/**
 * Application state: config, library, download queue, activity log.
 *
 * The desktop app persisted a single config.json. A phone needs more: the
 * library has to survive restarts, and so does an in-flight download queue, so
 * everything here is written to AsyncStorage (debounced) as it changes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  fetchChapterPages,
  fetchMangaWithChapters,
  getChapterPages,
} from '../api/client';
import { parseMangaId } from '../api/parse';
import {
  DEMO_LIBRARY,
  demoManga,
  demoMangaByInput,
  demoPages,
  isDemoMangaId,
} from '../api/demo';
import { DownloadQueue, jobId, type JobMeta } from '../download/queue';
import * as storage from '../lib/storage';
import {
  DEFAULT_CONFIG,
  type Chapter,
  type ChapterState,
  type Config,
  type DownloadJob,
  type LibraryEntry,
  type MangaInfo,
  type OutputFormat,
  type Page,
} from '../types';

const KEYS = {
  config: 'atsu:config:v1',
  library: 'atsu:library:v1',
  jobs: 'atsu:jobs:v1',
};

interface AppState {
  hydrated: boolean;
  config: Config;
  library: LibraryEntry[];
  jobs: DownloadJob[];
  logs: string[];
  mangaCache: Record<string, MangaInfo>;
  loadingManga: boolean;
  lastError: string | null;
}

interface AppActions {
  updateConfig: (patch: Partial<Config>) => void;
  loadManga: (input: string) => Promise<MangaInfo | null>;
  getManga: (mangaId: string) => MangaInfo | null;
  enqueue: (manga: MangaInfo, chapters: Chapter[], format: OutputFormat) => number;
  pauseJob: (id: string) => void;
  pauseAll: () => void;
  resumeAll: () => void;
  resumeJob: (id: string) => void;
  cancelJob: (id: string) => void;
  retryJob: (id: string) => void;
  removeJob: (id: string) => void;
  clearFinishedJobs: () => void;
  saveReadingProgress: (mangaId: string, chapterId: string, page: number, total: number) => void;
  deleteChapter: (mangaId: string, chapterId: string) => Promise<void>;
  removeFromLibrary: (mangaId: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  /** Delete downloaded files but keep the shelf and reading progress. */
  clearDownloads: () => Promise<void>;
  clearError: () => void;
  chapterPages: (manga: MangaInfo, chapter: Chapter) => Promise<Page[]>;
  demoLibrary: () => MangaInfo[];
}

type AppContextValue = AppState & { actions: AppActions };

const AppContext = createContext<AppContextValue | null>(null);

const emptyLibrary = (manga: MangaInfo): LibraryEntry => ({
  mangaId: manga.id,
  title: manga.title,
  coverUrl: manga.coverUrl,
  synopsis: manga.synopsis,
  authors: manga.authors,
  chapterCount: manga.chapters.length,
  addedAt: Date.now(),
  chapters: {},
  reading: null,
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    hydrated: false,
    config: DEFAULT_CONFIG,
    library: [],
    jobs: [],
    logs: [],
    mangaCache: {},
    loadingManga: false,
    lastError: null,
  });

  const configRef = useRef(state.config);
  configRef.current = state.config;

  const queueRef = useRef<DownloadQueue | null>(null);

  /**
   * Job updates arrive several times a second while pages download. Pushing each
   * one into React state re-renders every mounted screen, which is what made the
   * first build's lists stutter. Coalesce them into one commit every ~250 ms and
   * flush immediately whenever a job changes status (so the UI never lies about
   * a download that just finished or failed).
   */
  const pendingJobs = useRef(new Map<string, DownloadJob>());
  const appliedStatus = useRef(new Map<string, string>());
  const jobFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const log = useCallback((message: string) => {
    setState((prev) => ({
      ...prev,
      logs: [`${new Date().toLocaleTimeString()} · ${message}`, ...prev.logs].slice(0, 120),
    }));
  }, []);

  /* ---------------------------------------------------------- bootstrapping */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let config = DEFAULT_CONFIG;
      let library: LibraryEntry[] = [];
      let jobs: DownloadJob[] = [];

      try {
        const [rawConfig, rawLibrary, rawJobs] = await Promise.all([
          AsyncStorage.getItem(KEYS.config),
          AsyncStorage.getItem(KEYS.library),
          AsyncStorage.getItem(KEYS.jobs),
        ]);
        if (rawConfig) config = { ...DEFAULT_CONFIG, ...JSON.parse(rawConfig) } as Config;
        if (rawLibrary) library = JSON.parse(rawLibrary) as LibraryEntry[];
        if (rawJobs) jobs = JSON.parse(rawJobs) as DownloadJob[];
      } catch (error) {
        log(`Could not read saved state: ${String(error)}`);
      }

      if (cancelled) return;

      const queue = new DownloadQueue({
        getConfig: () => configRef.current,
        loadPages: async (mangaId, chapterId, signal) => {
          if (isDemoMangaId(mangaId)) return demoPages(chapterId);
          return getChapterPages(mangaId, chapterId, {
            signal,
            retries: configRef.current.maxRetries,
            retryDelay: configRef.current.retryDelay,
          });
        },
        onJob: queueJobUpdate,
        onLibraryUpdate: (job) => {
          if (job.status !== 'done') return;
          setState((prev) => {
            const existing = prev.library.find((entry) => entry.mangaId === job.mangaId);
            if (!existing) return prev;
            const chapter: ChapterState = {
              chapterId: job.chapterId,
              chapterTitle: job.chapterTitle,
              chapterNumber: job.chapterNumber,
              pageCount: job.pagesTotal,
              savedAs: job.format,
              savedPath: job.outputPath,
              bytes: job.bytes,
              updatedAt: Date.now(),
            };
            return {
              ...prev,
              library: prev.library.map((entry) =>
                entry.mangaId === job.mangaId
                  ? { ...entry, chapters: { ...entry.chapters, [job.chapterId]: chapter } }
                  : entry,
              ),
            };
          });
          schedulePersist();
        },
        onLog: log,
      });

      queueRef.current = queue;
      queue.hydrate(jobs);
      for (const job of queue.list()) appliedStatus.current.set(job.id, job.status);

      setState((prev) => ({ ...prev, hydrated: true, config, library, jobs: queue.list() }));
    })();

    return () => {
      cancelled = true;
      queueRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ persistence */

  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePersist = useCallback(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      setState((prev) => {
        void AsyncStorage.setItem(KEYS.config, JSON.stringify(prev.config));
        void AsyncStorage.setItem(KEYS.library, JSON.stringify(prev.library));
        void AsyncStorage.setItem(KEYS.jobs, JSON.stringify(prev.jobs));
        return prev;
      });
    }, 500);
  }, []);

  const flushJobs = useCallback(() => {
    if (jobFlushTimer.current) {
      clearTimeout(jobFlushTimer.current);
      jobFlushTimer.current = null;
    }
    if (pendingJobs.current.size === 0) return;

    const updates = [...pendingJobs.current.values()];
    pendingJobs.current.clear();
    for (const job of updates) appliedStatus.current.set(job.id, job.status);

    setState((prev) => {
      const byId = new Map(prev.jobs.map((entry) => [entry.id, entry]));
      for (const job of updates) byId.set(job.id, job);
      return { ...prev, jobs: [...byId.values()] };
    });
    schedulePersist();
  }, [schedulePersist]);

  const queueJobUpdate = useCallback(
    (job: DownloadJob) => {
      const statusChanged = appliedStatus.current.get(job.id) !== job.status;
      pendingJobs.current.set(job.id, job);
      if (statusChanged) {
        flushJobs();
        return;
      }
      if (!jobFlushTimer.current) jobFlushTimer.current = setTimeout(flushJobs, 250);
    },
    [flushJobs],
  );

  /* ---------------------------------------------------------------- actions */

  const updateConfig = useCallback(
    (patch: Partial<Config>) => {
      setState((prev) => ({ ...prev, config: { ...prev.config, ...patch } }));
      schedulePersist();
    },
    [schedulePersist],
  );

  const loadManga = useCallback(
    async (input: string): Promise<MangaInfo | null> => {
      const trimmed = input.trim();
      if (!trimmed) return null;

      setState((prev) => ({ ...prev, loadingManga: true, lastError: null }));
      try {
        let manga: MangaInfo | null = null;

        if (configRef.current.demoMode) {
          const demo = demoManga(trimmed) ?? demoMangaByInput(trimmed) ?? demoMangaByUrl(trimmed);
          if (demo) manga = demo;
        }

        if (!manga) {
          const mangaId = parseMangaId(trimmed);
          if (!mangaId) throw new Error('That does not look like an atsu.moe URL or id');
          manga = await fetchMangaWithChapters(configRef.current, mangaId);
        }

        setState((prev) => {
          const existing = prev.library.find((entry) => entry.mangaId === manga!.id);
          const entry: LibraryEntry = existing
            ? { ...existing, chapterCount: manga!.chapters.length, coverUrl: manga!.coverUrl }
            : emptyLibrary(manga!);
          return {
            ...prev,
            loadingManga: false,
            mangaCache: { ...prev.mangaCache, [manga!.id]: manga! },
            library: existing
              ? prev.library.map((item) => (item.mangaId === manga!.id ? entry : item))
              : [entry, ...prev.library],
          };
        });
        schedulePersist();
        log(`Loaded “${manga.title}” (${manga.chapters.length} chapters)`);
        return manga;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setState((prev) => ({ ...prev, loadingManga: false, lastError: message }));
        return null;
      }
    },
    [log, schedulePersist],
  );

  const getManga = useCallback(
    (mangaId: string) => state.mangaCache[mangaId] ?? demoManga(mangaId),
    [state.mangaCache],
  );

  const enqueue = useCallback(
    (manga: MangaInfo, chapters: Chapter[], format: OutputFormat) => {
      const queue = queueRef.current;
      if (!queue) return 0;

      let started = 0;
      for (const chapter of chapters) {
        const id = jobId(manga.id, chapter.id, format);
        const existing = queue.list().find((job) => job.id === id);
        if (existing && (existing.status === 'done' || existing.status === 'downloading')) {
          continue;
        }

        const meta: JobMeta = {
          mangaType: manga.mangaType,
          authors: manga.authors,
          genres: manga.genres,
          chapterCount: manga.chapters.length,
          pageCount: chapter.pageCount,
        };

        queue.enqueue({
          mangaId: manga.id,
          mangaTitle: manga.title,
          coverUrl: manga.coverUrl,
          chapterId: chapter.id,
          chapterTitle: chapter.title || `Chapter ${chapter.number}`,
          chapterNumber: chapter.number,
          format,
          meta,
        });
        started += 1;
      }

      setState((prev) => ({
        ...prev,
        mangaCache: { ...prev.mangaCache, [manga.id]: manga },
      }));

      if (started > 0) {
        log(
          `Queued ${started} chapter${started === 1 ? '' : 's'} · ${format.toUpperCase()} · ${
            manga.title
          }`,
        );
        schedulePersist();
      }
      return started;
    },
    [log, schedulePersist],
  );

  const value: AppContextValue = useMemo(
    () => ({
      ...state,
      actions: {
        updateConfig,
        loadManga,
        getManga,
        enqueue,
        pauseJob: (id) => queueRef.current?.pause(id),
        pauseAll: () => {
          for (const job of queueRef.current?.list() ?? []) {
            if (job.status === 'downloading' || job.status === 'queued') queueRef.current?.pause(job.id);
          }
        },
        resumeAll: () => {
          for (const job of queueRef.current?.list() ?? []) {
            if (job.status === 'paused') queueRef.current?.resume(job.id);
          }
        },
        resumeJob: (id) => queueRef.current?.resume(id),
        cancelJob: (id) => queueRef.current?.cancel(id),
        retryJob: (id) => queueRef.current?.retry(id),
        removeJob: (id) => {
          queueRef.current?.remove(id);
          setState((prev) => ({ ...prev, jobs: prev.jobs.filter((job) => job.id !== id) }));
          schedulePersist();
        },
        clearFinishedJobs: () => {
          const removed = queueRef.current?.clearFinished() ?? [];
          setState((prev) => ({
            ...prev,
            jobs: prev.jobs.filter((job) => !removed.includes(job.id)),
          }));
          schedulePersist();
        },
        saveReadingProgress: (mangaId, chapterId, page, total) => {
          setState((prev) => ({
            ...prev,
            library: prev.library.map((entry) =>
              entry.mangaId === mangaId
                ? {
                    ...entry,
                    reading: { chapterId, page, total, updatedAt: Date.now() },
                  }
                : entry,
            ),
          }));
          schedulePersist();
        },
        deleteChapter: async (mangaId, chapterId) => {
          const job = queueRef.current?.list().find((entry) => entry.chapterId === chapterId);
          await storage.removeDir(storage.chapterDir(mangaId, chapterId));
          if (job?.outputPath && (job.format === 'cbz' || job.format === 'pdf')) {
            await storage.remove(job.outputPath);
          }
          setState((prev) => ({
            ...prev,
            library: prev.library.map((entry) => {
              if (entry.mangaId !== mangaId) return entry;
              const chapters = { ...entry.chapters };
              delete chapters[chapterId];
              return { ...entry, chapters };
            }),
          }));
          schedulePersist();
        },
        removeFromLibrary: async (mangaId) => {
          await storage.removeDir(`${storage.ROOT}/${mangaId}`);
          setState((prev) => ({
            ...prev,
            library: prev.library.filter((entry) => entry.mangaId !== mangaId),
          }));
          schedulePersist();
        },
        clearDownloads: async () => {
          const queue = queueRef.current;
          for (const job of queue?.list() ?? []) {
            if (job.status === 'downloading' || job.status === 'queued' || job.status === 'paused') {
              queue?.cancel(job.id);
            }
          }
          await storage.clearAllDownloads();
          queue?.clearFinished();
          pendingJobs.current.clear();
          appliedStatus.current.clear();
          setState((prev) => ({
            ...prev,
            jobs: [],
            library: prev.library.map((entry) => ({ ...entry, chapters: {} })),
          }));
          schedulePersist();
        },
        clearAllData: async () => {
          await storage.clearAllDownloads();
          await AsyncStorage.multiRemove(Object.values(KEYS));
          setState((prev) => ({
            ...prev,
            library: [],
            jobs: [],
            logs: [],
            mangaCache: {},
          }));
        },
        clearError: () => setState((prev) => ({ ...prev, lastError: null })),
        chapterPages: async (manga, chapter) => {
          if (manga.demo || isDemoMangaId(manga.id)) return demoPages(chapter.id);
          return fetchChapterPages(configRef.current, manga.id, chapter.id);
        },
        demoLibrary: () => (configRef.current.demoMode ? DEMO_LIBRARY : []),
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, updateConfig, loadManga, getManga, enqueue, schedulePersist],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Resolve "lantern" / "demo-lantern" / a URL pasted from the demo list. */
function demoMangaByUrl(input: string): MangaInfo | null {
  const match = input.match(/demo-[a-z]+/i);
  return match ? demoManga(match[0]) : null;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside <AppProvider>');
  return context;
}

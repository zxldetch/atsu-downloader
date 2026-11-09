/**
 * Download queue — the mobile port of downloader/manager.py + images.py.
 *
 * Desktop behaviour that is preserved:
 *  - chapter-level concurrency and image-level concurrency
 *  - per-image retry with exponential backoff
 *  - output formats: images / cbz / pdf
 *  - zero-padded page filenames so archives sort correctly
 *
 * Mobile-specific behaviour that is new:
 *  - the queue survives app restarts (jobs are persisted by the store)
 *  - downloads are resumable: pages already on disk are skipped
 *  - pause / resume / cancel per chapter, via AbortController
 *  - the OS can kill the app at any time, so every page is committed as it lands
 */

import { pageImageUrl } from '../api/client';
import { formatChapterNumber, sanitizeFilename } from '../api/parse';
import { buildCbz, buildPdf, comicInfoXml, type PageEntry } from '../lib/archive';
import * as storage from '../lib/storage';
import type { Chapter, Config, DownloadJob, MangaInfo, OutputFormat, Page } from '../types';

export interface JobMeta {
  mangaType: string;
  authors: string[];
  genres: string[];
  chapterCount: number;
  pageCount: number;
}

export interface JobSpec {
  mangaId: string;
  mangaTitle: string;
  coverUrl: string;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  format: OutputFormat;
  meta: JobMeta;
}

interface QueueOptions {
  getConfig: () => Config;
  loadPages: (mangaId: string, chapterId: string, signal: AbortSignal) => Promise<Page[]>;
  onJob: (job: DownloadJob) => void;
  onLibraryUpdate: (job: DownloadJob) => void;
  onLog?: (message: string) => void;
}

interface Runtime {
  job: DownloadJob;
  controller: AbortController;
  running: boolean;
  lastEmit: number;
  pages: Page[] | null;
  /** The in-flight page-list request, shared by the prefetch and run(). */
  pagesRequest: Promise<Page[]> | null;
}

export const jobId = (mangaId: string, chapterId: string, format: OutputFormat) =>
  `${mangaId}::${chapterId}::${format}`;

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('canceled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

function extensionFor(image: string): string {
  const dataMatch = image.match(/^data:image\/([a-z0-9+]+);/i);
  if (dataMatch) return `.${dataMatch[1] === 'jpeg' ? 'jpg' : dataMatch[1]}`;

  const withoutQuery = image.split('?')[0];
  const match = withoutQuery.match(/(\.[a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : '.webp';
}

/** Run `worker` over `items` with at most `limit` in flight. */
async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

export class DownloadQueue {
  private runtimes = new Map<string, Runtime>();
  private active = new Set<string>();
  private metaByManga = new Map<string, JobMeta>();
  private config: () => Config;

  constructor(private options: QueueOptions) {
    this.config = options.getConfig;
  }

  /** Restore persisted jobs after a restart. Interrupted work goes back to the queue. */
  hydrate(jobs: DownloadJob[]): void {
    for (const job of jobs) {
      const status: DownloadJob['status'] =
        job.status === 'downloading' ? 'queued' : job.status;
      this.runtimes.set(job.id, {
        job: { ...job, status },
        controller: new AbortController(),
        running: false,
        lastEmit: 0,
        pages: null,
        pagesRequest: null,
      });
    }
    this.pump();
  }

  list(): DownloadJob[] {
    return [...this.runtimes.values()]
      .map((runtime) => runtime.job)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  get(id: string): DownloadJob | null {
    return this.runtimes.get(id)?.job ?? null;
  }

  /** Queue a chapter. Returns null when that chapter/format pair already exists. */
  enqueue(spec: JobSpec): DownloadJob {
    const id = jobId(spec.mangaId, spec.chapterId, spec.format);
    const existing = this.runtimes.get(id);
    if (existing) {
      if (existing.job.status === 'error' || existing.job.status === 'canceled') {
        this.retry(id);
      }
      return existing.job;
    }

    const now = Date.now();
    const job: DownloadJob = {
      id,
      mangaId: spec.mangaId,
      mangaTitle: spec.mangaTitle,
      coverUrl: spec.coverUrl,
      chapterId: spec.chapterId,
      chapterTitle: spec.chapterTitle,
      chapterNumber: spec.chapterNumber,
      format: spec.format,
      status: 'queued',
      pagesTotal: spec.meta.pageCount,
      pagesDone: 0,
      bytes: 0,
      outputPath: null,
      error: null,
      createdAt: now,
      updatedAt: now,
    };

    const runtime: Runtime = {
      job,
      controller: new AbortController(),
      running: false,
      lastEmit: 0,
      pages: null,
      pagesRequest: null,
    };
    // ComicInfo metadata is rebuilt from the library entry when needed.
    this.metaByManga.set(spec.mangaId, { ...(this.metaByManga.get(spec.mangaId) ?? {}), ...spec.meta });

    this.runtimes.set(id, runtime);
    this.emit(runtime, true);
    this.pump();
    return job;
  }

  private emit(runtime: Runtime, force = false): void {
    const now = Date.now();
    if (!force && now - runtime.lastEmit < 120) return;
    runtime.lastEmit = now;
    runtime.job = { ...runtime.job, updatedAt: now };
    this.options.onJob(runtime.job);
  }

  private patch(id: string, patch: Partial<DownloadJob>, force = true): void {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    runtime.job = { ...runtime.job, ...patch, updatedAt: Date.now() };
    this.options.onJob(runtime.job);
    if (!force) return;
  }

  pause(id: string): void {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    if (runtime.job.status !== 'downloading' && runtime.job.status !== 'queued') return;

    runtime.controller.abort();
    runtime.controller = new AbortController();
    this.active.delete(id);
    runtime.running = false;
    this.patch(id, { status: 'paused' });
  }

  resume(id: string): void {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    if (runtime.job.status !== 'paused') return;
    runtime.controller = new AbortController();
    this.patch(id, { status: 'queued', error: null });
    this.pump();
  }

  cancel(id: string): void {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    runtime.controller.abort();
    this.active.delete(id);
    runtime.running = false;

    const job = runtime.job;
    this.patch(id, { status: 'canceled', pagesDone: 0 });
    void storage.removeDir(storage.chapterDir(job.mangaId, job.chapterId));
    this.pump();
  }

  retry(id: string): void {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    if (runtime.job.status !== 'error' && runtime.job.status !== 'canceled') return;
    runtime.controller = new AbortController();
    this.patch(id, { status: 'queued', error: null, pagesDone: 0 });
    this.pump();
  }

  remove(id: string): void {
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    runtime.controller.abort();
    this.active.delete(id);
    this.runtimes.delete(id);
    this.options.onJob({ ...runtime.job, status: 'canceled', updatedAt: Date.now() });
  }

  clearFinished(): string[] {
    const removed: string[] = [];
    for (const [id, runtime] of this.runtimes) {
      if (['done', 'error', 'canceled'].includes(runtime.job.status) && !this.active.has(id)) {
        this.runtimes.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  /** Abort everything and drop the in-memory jobs (used on unmount / app reset). */
  dispose(): void {
    for (const runtime of this.runtimes.values()) {
      runtime.controller.abort();
    }
    this.runtimes.clear();
    this.active.clear();
  }

  /**
   * Fetch page lists for the next few queued chapters while the current batch is
   * still downloading. The API round-trip used to sit on the critical path at
   * every chapter boundary — 100 chapters meant 100 stalls.
   */
  private prefetchPages(): void {
    let budget = Math.max(1, this.config().concurrentChapters) * 2;
    for (const runtime of this.runtimes.values()) {
      if (budget <= 0) return;
      if (runtime.pages || runtime.running) continue;
      if (runtime.job.status !== 'queued') continue;
      budget -= 1;
      const { mangaId, chapterId } = runtime.job;
      runtime.pagesRequest ??= this.options.loadPages(
        mangaId,
        chapterId,
        runtime.controller.signal,
      );
      void runtime.pagesRequest
        .then((pages) => {
          if (pages.length > 0) runtime.pages = pages;
        })
        .catch(() => {
          // A failed prefetch is not an error: run() retries the request.
          runtime.pagesRequest = null;
        });
    }
  }

  /** Kick off as many queued jobs as the concurrency setting allows. */
  private pump(): void {
    const limit = Math.max(1, this.config().concurrentChapters);
    // Same enqueue batch → chapter order, so a 200-chapter job downloads 1 → 200.
    const queued = [...this.runtimes.values()]
      .filter((runtime) => runtime.job.status === 'queued' && !runtime.running)
      .sort(
        (a, b) =>
          a.job.createdAt - b.job.createdAt || a.job.chapterNumber - b.job.chapterNumber,
      );

    for (const runtime of queued) {
      if (this.active.size >= limit) return;
      runtime.running = true;
      this.active.add(runtime.job.id);
      void this.run(runtime).finally(() => {
        runtime.running = false;
        this.active.delete(runtime.job.id);
        this.pump();
      });
    }
    this.prefetchPages();
  }

  private async run(runtime: Runtime): Promise<void> {
    const { job } = runtime;
    const config = this.config();
    const signal = runtime.controller.signal;
    const dir = storage.chapterDir(job.mangaId, job.chapterId);

    this.patch(job.id, { status: 'downloading', error: null });

    try {
      await storage.ensureDir(dir);

      // Reuse the prefetch's request when it is still in flight, so a chapter
      // whose page list is already on its way never asks the API twice.
      runtime.pagesRequest ??= this.options.loadPages(job.mangaId, job.chapterId, signal);
      const pages = runtime.pages ?? (await runtime.pagesRequest);
      runtime.pages = pages;

      if (pages.length === 0) throw new Error('No pages found in chapter');

      this.patch(job.id, { pagesTotal: pages.length });

      // One listing replaces a stat() per page when resuming.
      const onDisk = new Map<string, number>();
      for (const file of await storage.listDir(dir)) {
        onDisk.set(file.path.split('/').pop() as string, file.size);
      }

      let done = 0;
      let bytes = 0;
      // Pages already on disk count immediately, so progress starts out honest.
      for (const page of pages) {
        const size = onDisk.get(
          storage.pagePath(job.mangaId, job.chapterId, page.number, extensionFor(page.image)).split('/').pop() as string,
        );
        if (size && size > 0) {
          done += 1;
          bytes += size;
        }
      }
      if (done > 0) this.patch(job.id, { pagesDone: done, bytes }, false);

      // Smoothed throughput → an ETA the UI can actually show.
      const sample = { at: Date.now(), pages: done, pps: 0 };
      const report = () => {
        const now = Date.now();
        const elapsed = (now - sample.at) / 1000;
        if (elapsed >= 0.4) {
          const instant = (done - sample.pages) / elapsed;
          sample.pps = sample.pps > 0 ? sample.pps * 0.6 + instant * 0.4 : instant;
          sample.at = now;
          sample.pages = done;
        }
        const remaining = Math.max(0, pages.length - done);
        this.patch(
          job.id,
          {
            pagesDone: done,
            bytes,
            pagesPerSecond: sample.pps > 0.01 ? Number(sample.pps.toFixed(2)) : null,
            etaSeconds: sample.pps > 0.01 ? Math.round(remaining / sample.pps) : null,
          },
          false,
        );
      };

      await pool(pages, Math.max(1, config.concurrentImages), async (page) => {
        if (signal.aborted) throw new Error('canceled');

        const path = storage.pagePath(job.mangaId, job.chapterId, page.number, extensionFor(page.image));
        const name = path.split('/').pop() as string;

        // Already counted above.
        if ((onDisk.get(name) ?? 0) > 0) return;

        let lastError: unknown = null;
        for (let attempt = 0; attempt < Math.max(1, config.maxRetries); attempt += 1) {
          if (signal.aborted) throw new Error('canceled');
          try {
            const written = await storage.downloadToFile(pageImageUrl(page), path, { signal });
            done += 1;
            bytes += written;
            report();
            return;
          } catch (error) {
            lastError = error;
            if (signal.aborted) throw new Error('canceled');
            if (attempt < config.maxRetries - 1) {
              await wait(config.retryDelay * 1000 * 2 ** attempt, signal);
            }
          }
        }
        throw new Error(
          `Failed page ${page.number}: ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
        );
      });

      this.patch(job.id, { pagesDone: pages.length, bytes });

      const outputPath = await this.finalize(runtime, pages);
      this.patch(job.id, { status: 'done', outputPath, pagesDone: pages.length });
      this.options.onLibraryUpdate(this.runtimes.get(job.id)?.job ?? job);
    } catch (error) {
      if (signal.aborted) {
        if (this.runtimes.get(job.id)?.job.status !== 'paused') {
          this.patch(job.id, { status: 'canceled', pagesDone: 0 });
        }
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      // A stale page-list promise must not leak into the retry.
      if (!runtime.pages) runtime.pagesRequest = null;
      this.options.onLog?.(`${job.chapterTitle}: ${message}`);
      this.patch(job.id, { status: 'error', error: message });
      this.options.onLibraryUpdate(this.runtimes.get(job.id)?.job ?? job);
    }
  }

  /** Convert the downloaded pages into the requested format. */
  private async finalize(runtime: Runtime, pages: Page[]): Promise<string> {
    const { job } = runtime;
    const config = this.config();
    const dir = storage.chapterDir(job.mangaId, job.chapterId);

    if (job.format === 'images') {
      return dir;
    }

    const files = await storage.listDir(dir);
    if (files.length === 0) throw new Error('No pages on disk to package');

    // Reading a 40-page chapter one file at a time was the tail stall that made
    // the last page of every chapter feel like a hang.
    const entries: PageEntry[] = new Array(files.length);
    await pool(files, 6, async (file, index) => {
      entries[index] = {
        name: file.path.split('/').pop() as string,
        bytes: await storage.readBytes(file.path),
      };
    });

    const chapterNumber = formatChapterNumber(job.chapterNumber);
    const extension = job.format === 'cbz' ? 'cbz' : 'pdf';
    const output = storage.exportPath(job.mangaTitle, chapterNumber, extension);

    if (job.format === 'cbz') {
      const meta = this.metaByManga.get(job.mangaId);
      const manga: MangaInfo = {
        id: job.mangaId,
        title: job.mangaTitle,
        mangaType: meta?.mangaType ?? 'Unknown',
        synopsis: '',
        coverUrl: job.coverUrl,
        genres: meta?.genres ?? [],
        authors: meta?.authors ?? [],
        status: 'Unknown',
        scanlators: [],
        chapters: Array.from({ length: meta?.chapterCount ?? 0 }, () => emptyChapter),
        groups: [],
      };
      const chapter: Chapter = {
        id: job.chapterId,
        title: job.chapterTitle,
        number: job.chapterNumber,
        index: 0,
        pageCount: pages.length,
        scanlationMangaId: '',
      };
      const archive = await buildCbz(entries, comicInfoXml(manga, chapter));
      await storage.writeFile(output, archive);
    } else {
      const byName = new Map(entries.map((entry) => [entry.name, entry]));
      const archive = await buildPdf(
        entries,
        async (name) => {
          const entry = byName.get(name);
          if (!entry) throw new Error(`Missing page ${name}`);
          return `data:image/jpeg;base64,${bytesToBase64(entry.bytes)}`;
        },
        { title: `${job.mangaTitle} — ${job.chapterTitle}`, author: job.mangaTitle },
      );
      await storage.writeFile(output, archive);
    }

    if (!config.keepImages) {
      await storage.removeDir(dir);
    }

    return output;
  }
}

const emptyChapter: Chapter = {
  id: '',
  title: '',
  number: 0,
  index: 0,
  pageCount: 0,
  scanlationMangaId: '',
};

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    output += alphabet[b0 >> 2];
    output += alphabet[((b0 & 3) << 4) | (b1 >> 4)];
    output += i + 1 < bytes.length ? alphabet[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    output += i + 2 < bytes.length ? alphabet[b2 & 63] : '=';
  }
  return output;
}

export { sanitizeFilename };

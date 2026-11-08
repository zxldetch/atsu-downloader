/**
 * HTTP client for atsu.moe — a port of api/client.py.
 *
 * Differences from the desktop version:
 *  - `fetch` instead of `requests`, with an AbortController timeout.
 *  - Base URLs are configurable so the web build can route through the bundled
 *    dev proxy (browsers cannot set `Referer` and are blocked by CORS).
 *  - Retry/backoff reads from the caller's Config rather than a global.
 */

import { Platform } from 'react-native';

import type { Chapter, Config, MangaInfo, Page, Scanlator } from '../types';

export const UPSTREAM_BASE = 'https://atsu.moe';
export const UPSTREAM_CDN = 'https://cdn.atsu.moe';

/**
 * Native builds talk to atsu.moe directly. The web build goes through the same
 * origin it was served from (`server/preview.mjs`) because atsu.moe sends no
 * CORS headers and browsers strip `Referer`.
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_ATSU_BASE ?? (Platform.OS === 'web' ? '/proxy/atsu' : UPSTREAM_BASE);

export const CDN_BASE =
  process.env.EXPO_PUBLIC_ATSU_CDN ?? (Platform.OS === 'web' ? '/proxy/cdn' : UPSTREAM_CDN);

const REQUEST_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  // Ignored by browsers, honoured by native clients — matches api/client.py.
  Referer: UPSTREAM_BASE,
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Mobile',
};

export class AtsuError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'http' | 'parse' | 'canceled' | 'not-found' = 'network',
  ) {
    super(message);
    this.name = 'AtsuError';
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function buildUrl(base: string, path: string, params?: Record<string, string | number>): string {
  const query = params
    ? Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&')
    : '';
  return `${base}${path}${query ? `?${query}` : ''}`;
}

interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  retryDelay?: number;
}

/** GET JSON with exponential backoff, mirroring `retry_with_backoff`. */
async function getJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { signal, timeoutMs = 30_000, retries = 3, retryDelay = 2 } = options;

  let lastError: Error = new AtsuError('Request failed', 'network');

  for (let attempt = 0; attempt < Math.max(1, retries); attempt += 1) {
    if (signal?.aborted) throw new AtsuError('Canceled', 'canceled');

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: REQUEST_HEADERS,
        signal: controller.signal,
      });

      if (response.status === 404) {
        throw new AtsuError('Not found on atsu.moe (404)', 'not-found');
      }
      if (!response.ok) {
        throw new AtsuError(`atsu.moe responded ${response.status}`, 'http');
      }

      return (await response.json()) as T;
    } catch (error) {
      const aborted = controller.signal.aborted;
      if (signal?.aborted) throw new AtsuError('Canceled', 'canceled');

      if (error instanceof AtsuError && error.kind === 'not-found') throw error;

      lastError =
        aborted
          ? new AtsuError('Request timed out', 'network')
          : error instanceof AtsuError
            ? error
            : new AtsuError(
                error instanceof Error ? error.message : 'Network request failed',
                'network',
              );

      if (attempt < retries - 1) {
        await sleep(retryDelay * 1000 * 2 ** attempt);
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  throw lastError;
}

/* ------------------------------------------------------------------ parsing */

const numberOrZero = (value: unknown): number => {
  const numeric = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

function toChapter(raw: any): Chapter {
  return {
    id: String(raw?.id ?? ''),
    title: String(raw?.title ?? ''),
    number: numberOrZero(raw?.number),
    index: numberOrZero(raw?.index),
    pageCount: numberOrZero(raw?.pageCount),
    scanlationMangaId: String(raw?.scanlationMangaId ?? raw?.scanId ?? ''),
  };
}

function normalizeChapterNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

/** Port of `MangaInfo.from_dict`, including the desktop app's de-duplication. */
export function parseMangaInfo(payload: any): MangaInfo {
  const manga = payload?.mangaPage ?? payload ?? {};

  const chapters: Chapter[] = [];
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();

  for (const raw of (manga.chapters ?? []) as any[]) {
    const chapter = toChapter(raw);
    if (!chapter.id || seenIds.has(chapter.id)) continue;

    const key = `${normalizeChapterNumber(chapter.number)}|${chapter.title.trim().toLowerCase()}`;
    if (seenKeys.has(key)) continue;

    seenIds.add(chapter.id);
    seenKeys.add(key);
    chapters.push(chapter);
  }

  let poster = manga.poster ?? manga.image;
  if (poster && typeof poster === 'object') poster = poster.image;
  let coverUrl = '';
  if (typeof poster === 'string' && poster.length > 0) {
    let path = poster.replace(/^\/+/, '');
    if (path.startsWith('static/')) path = path.slice('static/'.length);
    coverUrl = `${API_BASE}/static/${path}`;
  }

  const scanlators: Scanlator[] = Array.isArray(manga.scanlators)
    ? manga.scanlators
        .filter((s: any) => s?.id && s?.name)
        .map((s: any) => ({ id: String(s.id), name: String(s.name) }))
    : [];

  const genres = Array.isArray(manga.genres)
    ? manga.genres
    : Array.isArray(manga.tags)
      ? manga.tags
      : [];

  return {
    id: String(manga.id ?? ''),
    title: String(manga.title ?? manga.englishTitle ?? 'Unknown'),
    mangaType: String(manga.type ?? 'Unknown'),
    synopsis: String(manga.synopsis ?? ''),
    coverUrl,
    genres: genres.map((g: any) => g?.name).filter((name: unknown): name is string => !!name),
    authors: (manga.authors ?? [])
      .map((a: any) => a?.name)
      .filter((name: unknown): name is string => !!name),
    status: String(manga.status ?? 'Unknown'),
    scanlators,
    chapters,
  };
}

/** Image URL for a page, accepting demo data URIs unchanged. */
export function pageImageUrl(page: Page): string {
  if (/^(data:|https?:\/\/)/i.test(page.image)) return page.image;
  return `${CDN_BASE}${page.image.startsWith('/') ? '' : '/'}${page.image}`;
}

/* --------------------------------------------------------------------- api */

export async function getMangaInfo(
  mangaId: string,
  options: RequestOptions = {},
): Promise<MangaInfo> {
  const payload = await getJson<any>(
    buildUrl(API_BASE, '/api/manga/page', { id: mangaId }),
    options,
  );
  const manga = parseMangaInfo(payload);
  if (!manga.id) throw new AtsuError('Unexpected response from atsu.moe', 'parse');
  return manga;
}

export async function getAllChapters(
  mangaId: string,
  options: RequestOptions = {},
): Promise<Chapter[]> {
  const payload = await getJson<any>(
    buildUrl(API_BASE, '/api/manga/allChapters', { mangaId }),
    options,
  );
  const chapters = payload?.chapters ?? [];
  return Array.isArray(chapters) ? chapters.map(toChapter).filter((c) => c.id) : [];
}

export async function getChapterPages(
  mangaId: string,
  chapterId: string,
  options: RequestOptions = {},
): Promise<Page[]> {
  const payload = await getJson<any>(
    buildUrl(API_BASE, '/api/read/chapter', { mangaId, chapterId }),
    options,
  );
  const raw = payload?.readChapter?.pages ?? [];
  if (!Array.isArray(raw)) return [];

  return raw.map((p: any, index: number) => ({
    id: String(p?.id ?? `${chapterId}-${index}`),
    image: String(p?.image ?? ''),
    number: numberOrZero(p?.number) || index + 1,
    width: numberOrZero(p?.width),
    height: numberOrZero(p?.height),
    aspectRatio: numberOrZero(p?.aspectRatio),
  }));
}

/** Fetch a manga plus its chapter list, like `MangaScraper.fetch_manga`. */
export async function fetchMangaWithChapters(
  config: Config,
  mangaId: string,
  signal?: AbortSignal,
): Promise<MangaInfo> {
  const options: RequestOptions = {
    signal,
    retries: config.maxRetries,
    retryDelay: config.retryDelay,
  };

  const manga = await getMangaInfo(mangaId, options);
  const chapters = await getAllChapters(mangaId, options);
  return { ...manga, chapters: chapters.length > 0 ? chapters : manga.chapters };
}

export async function fetchChapterPages(
  config: Config,
  mangaId: string,
  chapterId: string,
  signal?: AbortSignal,
): Promise<Page[]> {
  return getChapterPages(mangaId, chapterId, {
    signal,
    retries: config.maxRetries,
    retryDelay: config.retryDelay,
  });
}

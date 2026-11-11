/**
 * Manual mock for src/lib/storage — an in-memory filesystem used by the queue
 * tests (jest.mock('../../lib/storage') picks this file up automatically).
 */

import { readArchivePages } from '../cbz';

export const ROOT = 'atsu';
export const PAGE_EXT = '.webp';

interface State {
  files: Map<string, Uint8Array>;
  downloads: { url: string; path: string }[];
  failures: Map<string, number>;
  delayMs: number;
  inFlight: number;
  maxInFlight: number;
  removedDirs: string[];
}

export const __state: State = {
  files: new Map(),
  downloads: [],
  failures: new Map(),
  delayMs: 2,
  inFlight: 0,
  maxInFlight: 0,
  removedDirs: [],
};

export function __reset(): void {
  __state.files.clear();
  __state.downloads.length = 0;
  __state.failures.clear();
  __state.removedDirs.length = 0;
  __state.delayMs = 2;
  __state.inFlight = 0;
  __state.maxInFlight = 0;
}

export const chapterDir = (mangaId: string, chapterId: string) => `atsu/${mangaId}/${chapterId}`;

export const pagePath = (mangaId: string, chapterId: string, number: number, ext: string) =>
  `atsu/${mangaId}/${chapterId}/${String(number).padStart(4, '0')}${ext}`;

export const exportPath = (
  mangaTitle: string,
  chapterNumber: string,
  extension: 'cbz' | 'pdf',
) => `atsu/exports/${mangaTitle} - ch ${chapterNumber}.${extension}`;

export const storageRootDescription = () => 'mock-storage';

export function guessMime() {
  return 'application/octet-stream';
}

export async function ensureDir(): Promise<void> {}

export async function exists(path: string): Promise<boolean> {
  return __state.files.has(path);
}

export async function size(path: string): Promise<number> {
  return __state.files.get(path)?.byteLength ?? 0;
}

export async function writeFile(path: string, data: Uint8Array | string): Promise<void> {
  __state.files.set(
    path,
    typeof data === 'string' ? new TextEncoder().encode(data) : data,
  );
}

export async function readBytes(path: string): Promise<Uint8Array> {
  const bytes = __state.files.get(path);
  if (!bytes) throw new Error(`File not found: ${path}`);
  return bytes;
}

export async function readText(path: string): Promise<string> {
  return new TextDecoder().decode(await readBytes(path));
}

export async function downloadToFile(
  url: string,
  path: string,
  options: { signal?: AbortSignal } = {},
): Promise<number> {
  if (options.signal?.aborted) throw new Error('canceled');

  __state.downloads.push({ url, path });
  __state.inFlight += 1;
  __state.maxInFlight = Math.max(__state.maxInFlight, __state.inFlight);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, __state.delayMs);
    options.signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('canceled'));
      },
      { once: true },
    );
  }).finally(() => {
    __state.inFlight -= 1;
  });

  const remainingFailures = __state.failures.get(path) ?? 0;
  if (remainingFailures > 0) {
    __state.failures.set(path, remainingFailures - 1);
    throw new Error('simulated network failure');
  }

  const bytes = new Uint8Array([1, 2, 3, 4]);
  __state.files.set(path, bytes);
  return bytes.byteLength;
}

export async function listDir(path: string): Promise<{ path: string; size: number }[]> {
  const prefix = `${path}/`;
  return [...__state.files.entries()]
    .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
    .map(([key, bytes]) => ({ path: key, size: bytes.byteLength }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function remove(path: string): Promise<void> {
  __state.files.delete(path);
}

export async function removeDir(path: string): Promise<void> {
  __state.removedDirs.push(path);
  for (const key of [...__state.files.keys()]) {
    if (key === path || key.startsWith(`${path}/`)) __state.files.delete(key);
  }
}

/** The real unpacking logic over the in-memory files, so CBZ chapters read offline. */
export async function extractArchive(archivePath: string, dir: string): Promise<number> {
  const pages = await readArchivePages(await readBytes(archivePath));
  for (const page of pages) {
    await writeFile(`${dir}/${page.name}`, page.bytes);
  }
  return pages.length;
}

export async function uriFor(path: string): Promise<string> {
  return `file:///${path}`;
}

export async function exportFile(): Promise<void> {}

export async function saveImagesToGallery(): Promise<number> {
  return 0;
}

export async function clearAllDownloads(): Promise<void> {
  __reset();
}

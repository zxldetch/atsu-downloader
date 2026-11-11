/**
 * Filesystem abstraction.
 *
 * The desktop app writes to `./downloads`; on a phone there is no such thing,
 * so downloaded pages live in the app's document directory:
 *
 *   <documents>/atsu/<mangaId>/<chapterId>/0001.webp
 *   <documents>/atsu/exports/<manga>-ch-<n>.cbz
 *
 * Paths are always relative ("atsu/…"); this module maps them per platform.
 * expo-file-system has no web implementation, so the web build keeps bytes in
 * memory — enough for the preview build, and documented in the README.
 */

import { Platform } from 'react-native';

import { sanitizeFilename } from '../api/parse';
import { extensionOf, readArchivePages } from './cbz';
import { aspectFromBytes } from './imageSize';

const isWeb = Platform.OS === 'web';

export const ROOT = 'atsu';
export const PAGE_EXT = '.webp';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------- native */

let nativeFs: typeof import('expo-file-system') | null = null;
function fs(): typeof import('expo-file-system') {
  if (!nativeFs) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeFs = require('expo-file-system') as typeof import('expo-file-system');
  }
  return nativeFs;
}

function nativeFile(path: string) {
  const { Paths, File, Directory } = fs();
  const segments = path.split('/').filter(Boolean);
  const last = segments.pop() as string;
  return new File(segments.length ? new Directory(Paths.document, ...segments) : Paths.document, last);
}

function directoryUri(path: string): string {
  const { Paths, Directory } = fs();
  const segments = path.split('/').filter(Boolean);
  return new Directory(Paths.document, ...segments).uri;
}

/* ---------------------------------------------------------------------- web */

const memory = new Map<string, Uint8Array>();
const objectUrls = new Map<string, string>();

function toBlob(bytes: Uint8Array, mime = 'application/octet-stream'): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: mime });
}

export function guessMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'cbz':
      return 'application/vnd.comicbook+zip';
    case 'pdf':
      return 'application/pdf';
    case 'zip':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}

/* -------------------------------------------------------------------- paths */

export function chapterDir(mangaId: string, chapterId: string): string {
  return `${ROOT}/${sanitizeFilename(mangaId)}/${sanitizeFilename(chapterId)}`;
}

export function exportPath(mangaTitle: string, chapterNumber: string, extension: 'cbz' | 'pdf') {
  return `${ROOT}/exports/${sanitizeFilename(`${mangaTitle} - ch ${chapterNumber}`)}.${extension}`;
}

export function pagePath(mangaId: string, chapterId: string, pageNumber: number, ext: string) {
  const suffix = ext && ext.startsWith('.') ? ext : `.${ext || 'webp'}`;
  return `${chapterDir(mangaId, chapterId)}/${String(pageNumber).padStart(4, '0')}${suffix}`;
}

/** Where files land on the phone, for display in Settings. */
export function storageRootDescription(): string {
  if (isWeb) return 'In-memory (browser preview)';
  try {
    return directoryUri(ROOT).replace(/^file:\/\//, '');
  } catch {
    return 'App documents / atsu';
  }
}

/* --------------------------------------------------------------- operations */

/**
 * Directories confirmed to exist during this session.
 *
 * The download loop used to create the chapter directory once per *page*, which
 * is 40-60 pointless native calls per chapter and hundreds across a long queue.
 */
const ensuredDirs = new Set<string>();

export async function ensureDir(path: string): Promise<void> {
  if (isWeb) return;
  if (ensuredDirs.has(path)) return;
  const { Directory, Paths } = fs();
  const segments = path.split('/').filter(Boolean);
  new Directory(Paths.document, ...segments).create({ intermediates: true, idempotent: true });
  ensuredDirs.add(path);
}

export async function exists(path: string): Promise<boolean> {
  if (isWeb) return memory.has(path);
  try {
    return nativeFile(path).exists;
  } catch {
    return false;
  }
}

export async function size(path: string): Promise<number> {
  if (isWeb) return memory.get(path)?.byteLength ?? 0;
  try {
    const file = nativeFile(path);
    return file.exists ? (file.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

export async function writeFile(path: string, data: Uint8Array | string): Promise<void> {
  if (isWeb) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    memory.set(path, bytes);
    return;
  }

  const segments = path.split('/').filter(Boolean);
  segments.pop();
  await ensureDir(segments.join('/'));

  const file = nativeFile(path);
  if (!file.exists) file.create({ intermediates: true, overwrite: true });
  await file.write(data as Uint8Array | string);
}

export async function readBytes(path: string): Promise<Uint8Array> {
  if (isWeb) {
    const stored = memory.get(path);
    if (!stored) throw new Error(`File not found: ${path}`);
    return stored;
  }
  const file = nativeFile(path);
  if (!file.exists) throw new Error(`File not found: ${path}`);
  return file.bytes();
}

export async function readText(path: string): Promise<string> {
  if (isWeb) return new TextDecoder().decode(await readBytes(path));
  return nativeFile(path).text();
}

export async function remove(path: string): Promise<void> {
  if (isWeb) {
    memory.delete(path);
    const url = objectUrls.get(path);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrls.delete(path);
    }
    return;
  }
  try {
    const file = nativeFile(path);
    if (file.exists) file.delete();
  } catch {
    // Deleting a missing file is not an error.
  }
}

export async function removeDir(path: string): Promise<void> {
  // Anything under the removed path must be re-created before it can be written.
  for (const dir of [...ensuredDirs]) {
    if (dir === path || dir.startsWith(`${path}/`)) ensuredDirs.delete(dir);
  }

  if (isWeb) {
    for (const key of [...memory.keys()]) {
      if (key === path || key.startsWith(`${path}/`)) memory.delete(key);
    }
    return;
  }
  const { Directory, Paths } = fs();
  const segments = path.split('/').filter(Boolean);
  const dir = new Directory(Paths.document, ...segments);
  if (dir.exists) dir.delete();
}

export async function listDir(path: string): Promise<{ path: string; size: number }[]> {
  if (isWeb) {
    const prefix = `${path}/`;
    return [...memory.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, bytes]) => ({ path: key, size: bytes.byteLength }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  const { Directory, Paths } = fs();
  const segments = path.split('/').filter(Boolean);
  const dir = new Directory(Paths.document, ...segments);
  if (!dir.exists) return [];

  return dir
    .list()
    .filter((entry): entry is ReturnType<typeof nativeFile> => !(entry instanceof Directory))
    .map((file) => ({ path: `${path}/${file.name}`, size: file.size ?? 0 }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export interface PageDownload {
  /** Bytes written. */
  size: number;
  /**
   * width / height read from the image header, or null when the format is not
   * recognised. The reader needs this to lay the page out at its true height —
   * without it a downloaded page was drawn into a guessed box and cropped.
   */
  aspect: number | null;
}

/**
 * Download `url` into `path`. Returns the size and the page's aspect ratio.
 *
 * Pages that already exist are skipped by the queue, which is what makes
 * interrupted downloads resumable without any extra bookkeeping.
 */
export async function downloadToFile(
  url: string,
  path: string,
  options: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<PageDownload> {
  if (isWeb) {
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    memory.set(path, bytes);
    if (url.startsWith('data:')) await sleep(90); // keep demo downloads legible
    return { size: bytes.byteLength, aspect: aspectFromBytes(bytes) };
  }

  const segments = path.split('/').filter(Boolean);
  segments.pop();
  await ensureDir(segments.join('/'));

  if (url.startsWith('data:')) {
    const response = await fetch(url, { signal: options.signal });
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(path, bytes);
    await sleep(90); // keep demo downloads legible
    return { size: bytes.byteLength, aspect: aspectFromBytes(bytes) };
  }

  const { File, Paths, Directory } = fs();
  const target = nativeFile(path);

  // Download beside the target as `<page>.part`, then move the bytes into place
  // ourselves. A dropped connection mid-request used to leave a short file at the
  // *final* name, which the resume check then happily skipped — that is how a
  // chapter ended up "complete" with blank pages on a bad link.
  const folder = segments.length
    ? new Directory(Paths.document, ...segments)
    : Paths.document;
  const partial = new File(folder, `${target.name}.part`);

  const downloaded = await File.downloadFileAsync(url, partial, {
    headers: options.headers,
    idempotent: true,
    signal: options.signal,
  });

  try {
    if ((downloaded.size ?? 0) <= 0) throw new Error('The server sent an empty page');
    const bytes = await downloaded.bytes();
    if (bytes.byteLength === 0) throw new Error('The server sent an empty page');
    await writeFile(path, bytes);
    return { size: bytes.byteLength, aspect: aspectFromBytes(bytes) };
  } finally {
    try {
      if (downloaded.exists) downloaded.delete();
    } catch {
      // A leftover .part file is ignored by every reader of chapterDir.
    }
  }
}

/**
 * Unpack a CBZ into a chapter folder, replacing whatever was there.
 *
 * Downloads made before pages were kept are archive-only; opening one extracts
 * it once, after which the reader takes the ordinary "pages on disk" path.
 * Returns the number of pages written.
 */
export async function extractArchive(archivePath: string, dir: string): Promise<number> {
  const pages = await readArchivePages(await readBytes(archivePath));
  if (pages.length === 0) throw new Error('That archive has no images in it');

  await removeDir(dir);
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    await writeFile(`${dir}/${String(index + 1).padStart(4, '0')}${extensionOf(page.name)}`, page.bytes);
  }
  return pages.length;
}

/** A URI usable by <Image source={{ uri }} />. */
export async function uriFor(path: string): Promise<string> {
  if (isWeb) {
    const cached = objectUrls.get(path);
    if (cached) return cached;
    const bytes = await readBytes(path);
    const url = URL.createObjectURL(toBlob(bytes, guessMime(path)));
    objectUrls.set(path, url);
    return url;
  }
  return nativeFile(path).uri;
}

/**
 * Hand a finished file to the OS.
 * Native: share sheet (Files, Drive, messaging…). Web: browser download.
 */
export async function exportFile(
  path: string,
  options: { mimeType?: string; dialogTitle?: string } = {},
): Promise<void> {
  if (isWeb) {
    const bytes = await readBytes(path);
    const blob = toBlob(bytes, options.mimeType ?? guessMime(path));
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = path.split('/').pop() ?? 'download';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }

  const uri = nativeFile(path).uri;
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(uri, {
    mimeType: options.mimeType ?? guessMime(path),
    dialogTitle: options.dialogTitle ?? 'Save chapter',
    UTI: path.endsWith('.cbz') ? 'public.zip-archive' : undefined,
  });
}

/** Copy loose page images into the device photo library. */
export async function saveImagesToGallery(paths: string[]): Promise<number> {
  if (isWeb) throw new Error('Saving to the gallery needs the mobile app');
  const MediaLibrary = await import('expo-media-library');
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Photo library permission denied');

  let saved = 0;
  for (const path of paths) {
    try {
      await MediaLibrary.saveToLibraryAsync(nativeFile(path).uri);
      saved += 1;
    } catch {
      // Skip individual failures (unsupported format, storage full…).
    }
  }
  return saved;
}

/** Best-effort wipe of every downloaded artifact. */
export async function clearAllDownloads(): Promise<void> {
  if (isWeb) {
    memory.clear();
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.clear();
    return;
  }
  await removeDir(ROOT);
}

/** Domain types — mirrors the desktop app's models.py. */

export type OutputFormat = 'images' | 'cbz' | 'pdf';

export interface Page {
  id: string;
  /** Path served by the image CDN, e.g. `/static/chapters/abc/0001.webp`. */
  image: string;
  number: number;
  width: number;
  height: number;
  aspectRatio: number;
}

export interface Chapter {
  id: string;
  title: string;
  number: number;
  index: number;
  pageCount: number;
  scanlationMangaId: string;
}

export interface Scanlator {
  id: string;
  name: string;
}

export interface MangaInfo {
  id: string;
  title: string;
  mangaType: string;
  synopsis: string;
  coverUrl: string;
  genres: string[];
  authors: string[];
  status: string;
  scanlators: Scanlator[];
  chapters: Chapter[];
  /** True when the payload came from bundled demo fixtures. */
  demo?: boolean;
}

export type JobStatus = 'queued' | 'downloading' | 'paused' | 'done' | 'error' | 'canceled';

export interface DownloadJob {
  id: string;
  mangaId: string;
  mangaTitle: string;
  coverUrl: string;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  format: OutputFormat;
  status: JobStatus;
  pagesTotal: number;
  pagesDone: number;
  bytes: number;
  outputPath: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Per-chapter state kept in the library. */
export interface ChapterState {
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  pageCount: number;
  /** 'images' keeps loose files; 'cbz'/'pdf' point at a single archive. */
  savedAs: OutputFormat | null;
  savedPath: string | null;
  bytes: number;
  updatedAt: number;
}

export interface ReadingProgress {
  chapterId: string;
  page: number;
  total: number;
  updatedAt: number;
}

export interface LibraryEntry {
  mangaId: string;
  title: string;
  coverUrl: string;
  synopsis: string;
  authors: string[];
  chapterCount: number;
  addedAt: number;
  chapters: Record<string, ChapterState>;
  reading: ReadingProgress | null;
}

export interface Config {
  downloadFormat: OutputFormat;
  keepImages: boolean;
  concurrentChapters: number;
  concurrentImages: number;
  maxRetries: number;
  retryDelay: number;
  /** Demo mode serves bundled fixtures instead of calling atsu.moe. */
  demoMode: boolean;
}

export const DEFAULT_CONFIG: Config = {
  downloadFormat: 'cbz',
  keepImages: false,
  concurrentChapters: 2,
  concurrentImages: 4,
  maxRetries: 3,
  retryDelay: 2,
  demoMode: process.env.EXPO_PUBLIC_DEMO === '1',
};

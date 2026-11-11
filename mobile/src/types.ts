/** Domain types — mirrors the desktop app's models.py. */

import type { ThemeName } from './theme';

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
  /** Scanlation group that published this copy of the chapter ("Delta", ...). */
  group?: string;
  /** Stable id of that group, used for filtering. */
  groupId?: string;
}

/** One scanlation group active on a series, with how many chapters it has. */
export interface MangaGroup {
  id: string;
  name: string;
  chapterCount: number;
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
  /** Groups that actually posted chapters, biggest first. */
  groups: MangaGroup[];
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
  /** width/height per page, in page order (0 when the header was unreadable). */
  aspects?: number[];
  outputPath: string | null;
  error: string | null;
  /** Smoothed page throughput while a chapter is downloading. */
  pagesPerSecond?: number | null;
  /** Remaining time estimate, in seconds. */
  etaSeconds?: number | null;
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
  /** width/height per page, recorded when the pages were downloaded. */
  aspects?: number[];
  updatedAt: number;
}

export interface ReadingProgress {
  chapterId: string;
  page: number;
  total: number;
  updatedAt: number;
  /** The chapter's number, so the shelf can say "Ch. 54" without the API. */
  chapterNumber?: number;
  chapterTitle?: string;
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
  /**
   * Kept for older stored configs and existing library entries; downloads are
   * always CBZ now, so nothing writes 'images' or 'pdf' any more.
   */
  downloadFormat: OutputFormat;
  keepImages: boolean;
  concurrentChapters: number;
  concurrentImages: number;
  maxRetries: number;
  retryDelay: number;
  /** Demo mode serves bundled fixtures instead of calling atsu.moe. */
  demoMode: boolean;
  /** Reader layout: continuous vertical strip or page-by-page. */
  readerMode: 'vertical' | 'paged';
  /**
   * "Infinite mode": next/previous walk into the neighbouring chapter at the
   * edges, and scrolling to the end of a strip loads the next one.
   */
  autoAdvanceChapters: boolean;
  /** Slowly scroll the vertical reader without touching the screen. */
  autoScroll: boolean;
  /** Auto-scroll speed, 1 (slowest) to 10 (fastest). */
  autoScrollSpeed: number;
  /** Keep the screen on while reading. */
  keepScreenAwake: boolean;
  /** normal = atsu Midnight, dark = OLED black, light = daylight. */
  theme: ThemeName;
  /** Remembered scanlation group per manga id. */
  groupChoice: Record<string, string>;
}

export const DEFAULT_CONFIG: Config = {
  // CBZ is the only download format: one file per chapter, which is what the
  // reader, the exporter and every storage number assume.
  downloadFormat: 'cbz',
  keepImages: false,
  // A 100-chapter binge is the normal case, not the exception: the old 2/4
  // defaults turned one into an overnight job. 4 chapters x 8 images keeps a
  // mid-range phone saturated without starving the reader.
  concurrentChapters: 4,
  concurrentImages: 8,
  maxRetries: 3,
  retryDelay: 1,
  demoMode: process.env.EXPO_PUBLIC_DEMO === '1',
  readerMode: 'vertical',
  autoAdvanceChapters: true,
  autoScroll: false,
  autoScrollSpeed: 4,
  keepScreenAwake: true,
  theme: 'normal',
  groupChoice: {},
};

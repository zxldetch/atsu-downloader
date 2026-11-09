/**
 * The reading strip: several chapters flattened into one list of rows.
 *
 * Infinite mode appends chapters to this strip instead of navigating, so the
 * seam between two chapters is a row of its own — that is where the reader shows
 * "Finished: Chapter 12" and "Next: Chapter 13". Keeping the flattening pure and
 * outside the screen makes the ordering testable without rendering anything.
 */

import { formatChapterNumber } from '../api/parse';

export interface ReaderPage {
  key: string;
  uri: string;
  /** width / height */
  aspect: number;
}

/** One loaded chapter in the continuous strip. */
export interface ReaderSegment {
  chapterId: string;
  number: number;
  label: string;
  pages: ReaderPage[];
}

export type ReaderRow =
  | {
      kind: 'page';
      key: string;
      page: ReaderPage;
      chapterId: string;
      pageIndex: number;
      chapterNumber: number;
      chapterLabel: string;
      total: number;
    }
  | {
      kind: 'seam';
      key: string;
      chapterId: string;
      finished: string;
      next: string;
    };

/** Chapters in reading order, seams between them, pages in their own order. */
export function buildRows(segments: ReaderSegment[]): ReaderRow[] {
  const rows: ReaderRow[] = [];

  segments.forEach((segment, segmentIndex) => {
    if (segmentIndex > 0) {
      const previous = segments[segmentIndex - 1];
      rows.push({
        kind: 'seam',
        key: `seam:${previous.chapterId}->${segment.chapterId}`,
        chapterId: segment.chapterId,
        finished: `Finished: Chapter ${formatChapterNumber(previous.number)}`,
        next: `Next: Chapter ${formatChapterNumber(segment.number)}`,
      });
    }

    segment.pages.forEach((page, pageIndex) => {
      rows.push({
        kind: 'page',
        key: `${segment.chapterId}:${page.key}`,
        page,
        chapterId: segment.chapterId,
        pageIndex,
        chapterNumber: segment.number,
        chapterLabel: segment.label,
        total: segment.pages.length,
      });
    });
  });

  return rows;
}

/** Index of the first page row belonging to `chapterId`, or -1. */
export function firstPageOf(rows: ReaderRow[], chapterId: string): number {
  return rows.findIndex((row) => row.kind === 'page' && row.chapterId === chapterId);
}

/**
 * Infinite mode is only correct if the strip is: chapter N's pages, a seam that
 * names both chapters, then chapter N+1's pages — in that order, with the page
 * counter restarting per chapter.
 */

import { buildRows, firstPageOf, type ReaderSegment } from '../readerRows';

const pages = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ key: `p${i + 1}`, uri: `u${i + 1}`, aspect: 0.7 }));

const chapter = (number: number, count: number): ReaderSegment => ({
  chapterId: `ch-${number}`,
  number,
  label: `Chapter ${number}`,
  pages: pages(count),
});

describe('reading strip', () => {
  it('keeps a single chapter as plain pages', () => {
    const rows = buildRows([chapter(5, 3)]);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.kind === 'page')).toBe(true);
    expect(rows.map((row) => (row.kind === 'page' ? row.pageIndex : -1))).toEqual([0, 1, 2]);
  });

  it('names the seam between two chapters', () => {
    const rows = buildRows([chapter(12, 2), chapter(13, 2)]);

    expect(rows.map((row) => row.kind)).toEqual(['page', 'page', 'seam', 'page', 'page']);
    const seam = rows[2];
    expect(seam.kind === 'seam' && seam.finished).toBe('Finished: Chapter 12');
    expect(seam.kind === 'seam' && seam.next).toBe('Next: Chapter 13');
  });

  it('restarts the page counter for the appended chapter', () => {
    const rows = buildRows([chapter(12, 2), chapter(13, 3)]);

    expect(rows[3].kind === 'page' && rows[3].pageIndex).toBe(0);
    expect(rows[4].kind === 'page' && rows[4].pageIndex).toBe(1);
    expect(rows[4].kind === 'page' && rows[4].total).toBe(3);
    expect(rows[4].kind === 'page' && rows[4].chapterNumber).toBe(13);
  });

  it('orders three chapters 12 → 13 → 14 with a seam before each', () => {
    const rows = buildRows([chapter(12, 1), chapter(13, 1), chapter(14, 1)]);

    expect(rows.map((row) => row.kind)).toEqual(['page', 'seam', 'page', 'seam', 'page']);
    const seams = rows.filter((row) => row.kind === 'seam');
    expect(seams.map((row) => (row.kind === 'seam' ? row.finished : ''))).toEqual([
      'Finished: Chapter 12',
      'Finished: Chapter 13',
    ]);
    expect(seams.map((row) => (row.kind === 'seam' ? row.next : ''))).toEqual([
      'Next: Chapter 13',
      'Next: Chapter 14',
    ]);
  });

  it('locates the first page of an appended chapter, past its seam', () => {
    const rows = buildRows([chapter(12, 4), chapter(13, 4)]);
    expect(firstPageOf(rows, 'ch-13')).toBe(5);
    expect(firstPageOf(rows, 'ch-99')).toBe(-1);
  });

  it('keeps keys unique across chapters that reuse page names', () => {
    const rows = buildRows([chapter(12, 2), chapter(13, 2)]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});

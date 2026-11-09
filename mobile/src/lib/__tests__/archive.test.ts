import JSZip from 'jszip';

import type { Chapter, MangaInfo } from '../../types';
import { buildCbz, comicInfoXml } from '../archive';

const manga: MangaInfo = {
  id: 'OaKBx',
  title: 'The Lantern Courier',
  mangaType: 'Manga',
  synopsis: 'rain',
  coverUrl: '',
  genres: ['Drama', 'Slice of Life'],
  authors: ['A. Rivera'],
  status: 'Ongoing',
  scanlators: [],
  groups: [],
  chapters: Array.from({ length: 12 }, (_, index) => ({
    id: `ch-${index}`,
    title: `Chapter ${index + 1}`,
    number: index + 1,
    index,
    pageCount: 8,
    scanlationMangaId: '',
  })),
};

const chapter: Chapter = {
  id: 'ch-1',
  title: 'The first delivery',
  number: 1,
  index: 0,
  pageCount: 3,
  scanlationMangaId: '',
};

const pages = [
  { name: '0001.webp', bytes: new Uint8Array([1, 2, 3]) },
  { name: '0002.webp', bytes: new Uint8Array([4, 5, 6]) },
  { name: '0003.webp', bytes: new Uint8Array([7, 8, 9]) },
];

describe('comicInfoXml', () => {
  const xml = comicInfoXml(manga, chapter);

  it('mirrors the desktop generator', () => {
    expect(xml).toContain('<Title>The first delivery</Title>');
    expect(xml).toContain('<Series>The Lantern Courier</Series>');
    expect(xml).toContain('<Number>1</Number>');
    expect(xml).toContain('<Count>12</Count>');
    expect(xml).toContain('<PageCount>3</PageCount>');
    expect(xml).toContain('<Format>Manga</Format>');
    expect(xml).toContain('<Manga>YesAndRightToLeft</Manga>');
    expect(xml).toContain('<Writer>A. Rivera</Writer>');
    expect(xml).toContain('<Genre>Drama, Slice of Life</Genre>');
    expect(xml).toContain('<Web>https://atsu.moe/manga/OaKBx</Web>');
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
  });

  it('does not mark non-manga as right-to-left', () => {
    expect(comicInfoXml({ ...manga, mangaType: 'Manhwa' }, chapter)).toContain(
      '<Manga>No</Manga>',
    );
  });

  it('escapes XML entities', () => {
    const xmlWithSpecials = comicInfoXml(manga, { ...chapter, title: 'Fish & <Chips> "x"' });
    expect(xmlWithSpecials).toContain('Fish &amp; &lt;Chips&gt; &quot;x&quot;');
  });

  it('handles decimal chapter numbers', () => {
    expect(comicInfoXml(manga, { ...chapter, number: 7.5 })).toContain('<Number>7.5</Number>');
  });
});

describe('buildCbz', () => {
  it('produces a real zip containing the pages and ComicInfo.xml', async () => {
    const bytes = await buildCbz(pages, comicInfoXml(manga, chapter));

    // Zip local file header magic.
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual([
      '0001.webp',
      '0002.webp',
      '0003.webp',
      'ComicInfo.xml',
    ]);

    const first = await zip.file('0001.webp')!.async('uint8array');
    expect(Array.from(first)).toEqual([1, 2, 3]);

    const info = await zip.file('ComicInfo.xml')!.async('string');
    expect(info).toContain('<Series>The Lantern Courier</Series>');
  });

  it('works without metadata', async () => {
    const zip = await JSZip.loadAsync(await buildCbz(pages));
    expect(Object.keys(zip.files)).toHaveLength(3);
  });

  it('preserves page order for readers that sort by name', async () => {
    const zip = await JSZip.loadAsync(await buildCbz(pages));
    const names = Object.keys(zip.files);
    expect(names).toEqual([...names].sort());
  });
});

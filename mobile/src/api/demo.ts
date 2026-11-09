/**
 * Bundled demo fixtures.
 *
 * atsu.moe is unreachable from CI/sandbox environments, and the app is more
 * useful to evaluate with real-looking data. Demo mode swaps the HTTP client for
 * these fixtures; everything downstream (queue, storage, CBZ/PDF export, reader,
 * library) runs through the exact same code path as the live source.
 */

import type { Chapter, MangaInfo, Page } from '../types';
import { withGroups } from './client';
import { DEMO_COVERS } from './demoCovers';
import { DEMO_PAGES } from './demoPages';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface DemoSeed {
  id: string;
  title: string;
  type: string;
  synopsis: string;
  authors: string[];
  genres: string[];
  status: string;
  cover: string;
  chapterCount: number;
  pageCounts: number[];
  /** Chapters that carry a decimal number, like the real site's side stories. */
  decimals?: Record<number, number>;
  titles: string[];
  /**
   * Extra scanlation groups, so the group picker has something to pick from.
   * `from`/`to` are 1-based chapter numbers the rival group has released.
   */
  rivals?: { id: string; name: string; from: number; to: number }[];
}

const SEEDS: DemoSeed[] = [
  {
    id: 'demo-lantern',
    title: 'The Lantern Courier',
    type: 'Manhwa',
    synopsis:
      'A courier carries paper lanterns across a city that never stops raining. Every lantern holds one memory the recipient would rather forget — and tonight, one of them is hers.',
    authors: ['A. Rivera'],
    genres: ['Drama', 'Slice of Life', 'Supernatural'],
    status: 'Ongoing',
    cover: DEMO_COVERS[0],
    chapterCount: 12,
    pageCounts: [6, 7, 8, 6, 9, 7, 8, 6, 7, 8, 6, 9],
    decimals: { 7: 7.5 },
    titles: [
      'The first delivery',
      'Rain, again',
      'A lantern for the archivist',
      'Static on the wire',
      'Two streets over',
      'What the paper remembers',
      'Half a memory',
      'The quiet district',
      'Night shift',
      'Return to sender',
      'The lamp that went out',
      'A city after rain',
    ],
  },
  {
    id: 'demo-static',
    title: 'Static Bloom',
    type: 'Manga',
    synopsis:
      'The greenhouse on the eleventh floor has been picking up a signal for forty years. When a junior botanist finally answers it, the plants start answering back.',
    authors: ['K. Sato', 'M. Lindqvist'],
    genres: ['Sci-Fi', 'Mystery'],
    status: 'Ongoing',
    cover: DEMO_COVERS[1],
    chapterCount: 9,
    pageCounts: [8, 7, 9, 8, 6, 10, 7, 8, 6],
    titles: [
      'Signal strength',
      'Roots and antennas',
      'The eleventh floor',
      'Photosynthesis at 3 a.m.',
      'Interference',
      'Someone is listening',
      'Pollen',
      'Carrier wave',
      'Bloom',
    ],
  },
  {
    id: 'demo-iron',
    title: 'Iron Season',
    type: 'Manhua',
    synopsis:
      'Winter lasts nine months in the forge towns. The last blacksmith has one season to finish a blade nobody asked for, for a duel that may never happen.',
    authors: ['L. Bai'],
    genres: ['Action', 'Historical'],
    status: 'Completed',
    cover: DEMO_COVERS[2],
    chapterCount: 21,
    pageCounts: [7, 8, 9, 7, 8, 10, 7, 9, 8, 7, 9, 8, 7, 10, 8, 9, 7, 8, 9, 7, 12],
    decimals: { 14: 14.5, 18: 18.5 },
    titles: [
      'Cold work',
      'Coal and ash',
      'The apprentice',
      'First heat',
      'Letters from the south',
      'Quenching',
      'The buyer',
      'A blade for nobody',
      'Nine months',
      'Stone town',
      'Hammerfall',
      'The duel that never came',
      'Rust',
      'An unfinished edge',
      'Half a season',
      'The long thaw',
      'Old scars',
      'Interlude: the wife',
      'Half a season (part two)',
      'Last forge',
      'Iron season',
    ],
    // Two groups released the opening chapters, exactly like the real site.
    rivals: [
      { id: 'demo-iron-alpha', name: 'Alpha Scans', from: 1, to: 9 },
      { id: 'demo-iron-delta', name: 'Delta Scans', from: 1, to: 4 },
    ],
  },
];

function toChapters(seed: DemoSeed): Chapter[] {
  const rows: Chapter[] = Array.from({ length: seed.chapterCount }, (_, index) => {
    const number = seed.decimals?.[index + 1] ?? index + 1;
    return {
      id: `${seed.id}-ch-${index + 1}`,
      title: seed.titles[index] ?? `Chapter ${index + 1}`,
      number,
      index,
      pageCount: seed.pageCounts[index] ?? 8,
      scanlationMangaId: `${seed.id}-scan`,
      group: 'Demo Scans',
      groupId: `${seed.id}-scan`,
    };
  });

  // Rival groups post their own copies of the same chapter numbers.
  for (const rival of seed.rivals ?? []) {
    for (let index = rival.from - 1; index < Math.min(rival.to, seed.chapterCount); index += 1) {
      const number = seed.decimals?.[index + 1] ?? index + 1;
      rows.push({
        id: `${rival.id}-ch-${index + 1}`,
        title: seed.titles[index] ?? `Chapter ${index + 1}`,
        number,
        index,
        pageCount: seed.pageCounts[index] ?? 8,
        scanlationMangaId: rival.id,
        group: rival.name,
        groupId: rival.id,
      });
    }
  }

  return rows;
}

function toManga(seed: DemoSeed): MangaInfo {
  const manga: MangaInfo = {
    id: seed.id,
    title: seed.title,
    mangaType: seed.type,
    synopsis: seed.synopsis,
    coverUrl: seed.cover,
    genres: seed.genres,
    authors: seed.authors,
    status: seed.status,
    scanlators: [
      { id: `${seed.id}-scan`, name: 'Demo Scans' },
      ...(seed.rivals ?? []).map((rival) => ({ id: rival.id, name: rival.name })),
    ],
    chapters: toChapters(seed),
    groups: [],
    demo: true,
  };

  return withGroups(manga);
}

export const DEMO_LIBRARY: MangaInfo[] = SEEDS.map(toManga);

export function isDemoMangaId(mangaId: string): boolean {
  return SEEDS.some((seed) => seed.id === mangaId);
}

export function demoManga(mangaId: string): MangaInfo | null {
  const seed = SEEDS.find((entry) => entry.id === mangaId);
  return seed ? toManga(seed) : null;
}

export function demoMangaByInput(input: string): MangaInfo | null {
  const needle = input.trim().toLowerCase();
  if (!needle) return null;
  const byId = SEEDS.find((seed) => seed.id === needle || seed.id === `demo-${needle}`);
  if (byId) return toManga(byId);
  const byTitle = SEEDS.find((seed) => seed.title.toLowerCase().includes(needle));
  return byTitle ? toManga(byTitle) : null;
}

export function demoPages(chapterId: string): Page[] {
  const seed = SEEDS.find((entry) => chapterId.startsWith(`${entry.id}-ch-`));
  const chapter = seed ? toChapters(seed).find((entry) => entry.id === chapterId) : undefined;
  const count = chapter?.pageCount ?? 8;

  return Array.from({ length: count }, (_, index) => ({
    id: `${chapterId}-p-${index + 1}`,
    image: DEMO_PAGES[index % DEMO_PAGES.length],
    number: index + 1,
    width: 720,
    height: 1080,
    aspectRatio: 720 / 1080,
  }));
}

/* --------------------------------------------------- demo-shaped "network" */

export async function fetchDemoManga(mangaId: string): Promise<MangaInfo> {
  await delay(220 + Math.random() * 180);
  const manga = demoManga(mangaId);
  if (!manga) throw new Error(`Unknown demo manga: ${mangaId}`);
  return manga;
}

export async function fetchDemoPages(chapterId: string): Promise<Page[]> {
  await delay(140 + Math.random() * 160);
  return demoPages(chapterId);
}

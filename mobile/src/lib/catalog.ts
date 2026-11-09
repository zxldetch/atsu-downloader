/**
 * atsu.moe's own catalog search.
 *
 * Until now the only way to add a series was to paste its link, because the app
 * only knew the three endpoints the desktop port used. atsu.moe does expose a
 * search: it is Typesense-backed and returns
 *
 *   GET https://atsu.moe/api/search/manga?q=<query>&query_by=title&per_page=N
 *   { "hits": [ { "document": { "id": "…", "title": "…", … } }, … ] }
 *
 * which means titles can be found in the app — no link, no browser round-trip.
 * The shape is parsed defensively: Typesense documents are not a contract, and a
 * missing `image` must not hide a series that is otherwise a good match.
 */

const SEARCH_URL = 'https://atsu.moe/api/search/manga';
const SITE = 'https://atsu.moe';

export interface CatalogHit {
  /** The manga id, ready for `actions.loadManga`. */
  id: string;
  title: string;
  cover: string | null;
  /** "Manhwa · 2023 · Ongoing", whatever the document happened to carry. */
  meta: string;
}

type Json = Record<string, unknown>;

const asString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

function firstString(source: Json, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    const direct = asString(value);
    if (direct) return direct;
    if (value && typeof value === 'object') {
      const nested = firstString(value as Json, ['url', 'src', 'path', 'name']);
      if (nested) return nested;
    }
  }
  return null;
}

/** Covers arrive as site-relative paths (`/static/posters/x.webp`) or absolute URLs. */
export function absoluteUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return `${SITE}${value.startsWith('/') ? '' : '/'}${value}`;
}

/** Normalise one search payload into hits, skipping anything without an id. */
export function parseSearchPayload(payload: unknown): CatalogHit[] {
  const hits = (payload as { hits?: unknown })?.hits;
  if (!Array.isArray(hits)) return [];

  const found: CatalogHit[] = [];
  for (const hit of hits) {
    const document = ((hit as { document?: unknown })?.document ?? hit) as Json;
    if (!document || typeof document !== 'object') continue;

    const id = firstString(document, ['id', 'mangaId', 'slug']);
    const title = firstString(document, ['title', 'name', 'englishTitle', 'romajiTitle']);
    if (!id || !title) continue;

    const cover = firstString(document, ['image', 'poster', 'cover', 'coverUrl', 'thumbnail']);
    const meta = [
      firstString(document, ['type', 'mangaType']),
      firstString(document, ['year', 'releaseYear']),
      firstString(document, ['status']),
    ]
      .filter(Boolean)
      .join(' · ');

    found.push({ id, title, cover: cover ? absoluteUrl(cover) : null, meta });
  }
  return found;
}

export async function searchCatalog(
  query: string,
  options: { limit?: number; timeoutMs?: number } = {},
): Promise<CatalogHit[]> {
  const text = query.trim();
  if (!text) return [];

  const limit = options.limit ?? 20;
  const url = `${SEARCH_URL}?q=${encodeURIComponent(text)}&query_by=title&per_page=${limit}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', Referer: SITE },
    });
    if (!response.ok) throw new Error(`atsu.moe search returned ${response.status}`);
    return parseSearchPayload(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

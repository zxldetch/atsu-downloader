/**
 * Catalog search parsing. The payload is Typesense-shaped and not a documented
 * contract, so the interesting cases are the odd ones: a document without an
 * image, a relative poster path, a hit with no title.
 */

import { absoluteUrl, parseSearchPayload, searchCatalog } from '../catalog';

const hit = (document: Record<string, unknown>) => ({ document });

describe('catalog search', () => {
  it('reads id and title out of Typesense hits', () => {
    const result = parseSearchPayload({
      hits: [
        hit({ id: 'AbC123', title: 'Solo Leveling', type: 'Manhwa', year: 2018 }),
        hit({ id: 'XyZ789', title: 'The Lantern Courier' }),
      ],
    });

    expect(result.map((entry) => entry.title)).toEqual(['Solo Leveling', 'The Lantern Courier']);
    expect(result[0].id).toBe('AbC123');
    expect(result[0].meta).toBe('Manhwa · 2018');
    expect(result[1].cover).toBeNull();
  });

  it('makes relative poster paths absolute and keeps absolute ones', () => {
    const result = parseSearchPayload({
      hits: [
        hit({ id: 'a1', title: 'A', image: '/static/posters/a.webp' }),
        hit({ id: 'b2', title: 'B', poster: 'https://cdn.atsu.moe/p/b.webp' }),
      ],
    });

    expect(result[0].cover).toBe('https://atsu.moe/static/posters/a.webp');
    expect(result[1].cover).toBe('https://cdn.atsu.moe/p/b.webp');
    expect(absoluteUrl('static/x.png')).toBe('https://atsu.moe/static/x.png');
  });

  it('drops hits with no usable id or title', () => {
    const result = parseSearchPayload({
      hits: [hit({ title: 'No id' }), hit({ id: 'ok', title: '' }), hit({ id: 'fine', title: 'Fine' })],
    });
    expect(result.map((entry) => entry.id)).toEqual(['fine']);
  });

  it('survives a payload that is not a search response at all', () => {
    expect(parseSearchPayload(null)).toEqual([]);
    expect(parseSearchPayload({ error: 'nope' })).toEqual([]);
    expect(parseSearchPayload('html')).toEqual([]);
  });

  it('queries the search endpoint and surfaces HTTP failures', async () => {
    const originalFetch = global.fetch;
    const calls: string[] = [];

    global.fetch = jest.fn(async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => ({ hits: [hit({ id: 'q1', title: 'Found' })] }) };
    }) as unknown as typeof fetch;

    const found = await searchCatalog('  found  ');
    expect(found[0].title).toBe('Found');
    expect(calls[0]).toContain('/api/search/manga?q=found&query_by=title');

    global.fetch = jest.fn(async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
    await expect(searchCatalog('boom')).rejects.toThrow('503');

    global.fetch = originalFetch;
  });
});

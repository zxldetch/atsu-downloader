import {
  chapterLabel,
  formatBytes,
  formatChapterNumber,
  formatEta,
  formatSpeed,
  looksLikeMangaTarget,
  parseChapterSelection,
  parseMangaId,
  sanitizeFilename,
} from '../parse';

describe('parseMangaId', () => {
  it.each([
    ['https://atsu.moe/manga/OaKBx', 'OaKBx'],
    ['atsu.moe/manga/OaKBx', 'OaKBx'],
    ['/manga/OaKBx', 'OaKBx'],
    ['OaKBx', 'OaKBx'],
    ['  https://atsu.moe/manga/OaKBx/chapter/1  ', 'OaKBx'],
  ])('parses %s', (input, expected) => {
    expect(parseMangaId(input)).toBe(expected);
  });

  it('rejects junk', () => {
    expect(parseMangaId('')).toBeNull();
    expect(parseMangaId('https://atsu.moe/read/something')).toBeNull();
    expect(parseMangaId('https://example.com/manga/')).toBeNull();
  });

  it('keeps the desktop app\'s short-id heuristic', () => {
    expect(parseMangaId('abc')).toBe('abc');
    expect(parseMangaId('a'.repeat(11))).toBeNull();
  });
});

describe('looksLikeMangaTarget', () => {
  it('loads URLs, paths and bare ids', () => {
    expect(looksLikeMangaTarget('https://atsu.moe/manga/OaKBx')).toBe(true);
    expect(looksLikeMangaTarget('atsu.moe/manga/OaKBx')).toBe(true);
    expect(looksLikeMangaTarget('/manga/OaKBx')).toBe(true);
    expect(looksLikeMangaTarget('OaKBx')).toBe(true);
    // Hyphenated tokens are only loadable when they are known ids (demo fixtures).
    expect(looksLikeMangaTarget('demo-123')).toBe(false);
    expect(looksLikeMangaTarget('demo-lantern', ['demo-lantern'])).toBe(true);
  });

  it('leaves ordinary words alone so they search the shelf', () => {
    expect(looksLikeMangaTarget('lantern')).toBe(false);
    expect(looksLikeMangaTarget('solo leveling')).toBe(false);
    expect(looksLikeMangaTarget('')).toBe(false);
  });

  it('knows bundled fixture ids', () => {
    expect(looksLikeMangaTarget('demo-lantern', ['demo-lantern'])).toBe(true);
  });
});

describe('parseChapterSelection', () => {
  const total = 12;

  it('handles all / a', () => {
    expect(parseChapterSelection('all', total)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(parseChapterSelection('A', total)).toHaveLength(total);
  });

  it('handles a single chapter', () => {
    expect(parseChapterSelection('5', total)).toEqual([4]);
  });

  it('handles ranges', () => {
    expect(parseChapterSelection('1-3', total)).toEqual([0, 1, 2]);
  });

  it('handles mixed expressions and clamps to the chapter count', () => {
    expect(parseChapterSelection('1,3,5-7', total)).toEqual([0, 2, 4, 5, 6]);
    expect(parseChapterSelection('10-20', total)).toEqual([9, 10, 11]);
  });

  it('ignores out-of-range and malformed parts', () => {
    expect(parseChapterSelection('0,99,abc, 4 ', total)).toEqual([3]);
    expect(parseChapterSelection('', total)).toEqual([]);
  });

  it('de-duplicates overlapping selections', () => {
    expect(parseChapterSelection('1-4,2-6', 12)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('formatEta', () => {
  it('renders seconds, minutes and hours', () => {
    expect(formatEta(45)).toBe('45s left');
    expect(formatEta(180)).toBe('3m left');
    expect(formatEta(4320)).toBe('1h 12m left');
    expect(formatEta(7200)).toBe('2h left');
  });

  it('stays quiet when there is no estimate', () => {
    expect(formatEta(null)).toBe('');
    expect(formatEta(0)).toBe('');
    expect(formatEta(undefined)).toBe('');
  });
});

describe('formatSpeed', () => {
  it('keeps one decimal below ten pages a second', () => {
    expect(formatSpeed(2.44)).toBe('2.4 pages/s');
    expect(formatSpeed(12.6)).toBe('13 pages/s');
    expect(formatSpeed(null)).toBe('');
  });
});

describe('formatting helpers', () => {
  it('formats chapter numbers like the CLI', () => {
    expect(formatChapterNumber(3)).toBe('3');
    expect(formatChapterNumber(7.5)).toBe('7.5');
    expect(formatChapterNumber(Number.NaN)).toBe('?');
  });

  it('labels chapters without repeating a generic title', () => {
    expect(chapterLabel({ number: 2, title: 'Chapter 2' })).toBe('Chapter 2');
    expect(chapterLabel({ number: 2, title: '' })).toBe('Chapter 2');
    expect(chapterLabel({ number: 2.5, title: 'Interlude' })).toBe('Chapter 2.5 · Interlude');
  });

  it('formats byte counts', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('strips unsafe filename characters', () => {
    expect(sanitizeFilename('a/b:c*?"<>|d')).toBe('abcd');
    expect(sanitizeFilename('  lots   of   space  ')).toBe('lots of space');
  });
});

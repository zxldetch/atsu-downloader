/**
 * Pure helpers ported from the desktop app:
 *  - scraper/manga.py::parse_manga_id
 *  - downloader/manager.py::parse_chapter_selection, sanitize_filename
 */

/** Extract a manga id from a URL, a path, or a bare id. */
export function parseMangaId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  // Bare id: short alphanumeric, e.g. "OaKBx"
  if (/^[A-Za-z0-9]{3,10}$/.test(value)) return value;

  let url = value;
  if (!/^https?:\/\//i.test(url)) {
    // Accept "atsu.moe/manga/OaKBx" and "/manga/OaKBx".
    url = `https://${url.replace(/^\/+/, '')}`;
  }

  const match = url.match(/\/manga\/([A-Za-z0-9]+)/i);
  return match ? match[1] : null;
}

/**
 * Decide whether a token should be *loaded* rather than used as a shelf search.
 *
 * Bare atsu ids (`OaKBx`) are mixed-case, while what people type into a search
 * box is usually a plain lowercase word (`lantern`). Treating every 3-10
 * character token as an id would make title search impossible, so the rule is:
 * a URL/path always loads, a known id always loads, and a bare token only loads
 * if it carries an uppercase letter or a digit.
 */
export function looksLikeMangaTarget(input: string, knownIds: Iterable<string> = []): boolean {
  const value = input.trim();
  if (!value) return false;

  for (const id of knownIds) {
    if (id.toLowerCase() === value.toLowerCase()) return true;
  }

  if (/[/:.]/.test(value)) return parseMangaId(value) !== null;
  if (!/^[A-Za-z0-9]{3,10}$/.test(value)) return false;
  return /[A-Z]/.test(value) || /\d/.test(value);
}

/**
 * Turn a selection expression into 0-based chapter indices.
 *
 * Supports "all"/"a", "5", "1-10", and mixes like "1,3,5-7" — same grammar as
 * the CLI.
 */
export function parseChapterSelection(expression: string, totalChapters: number): number[] {
  const selection = expression.trim().toLowerCase();
  if (!selection) return [];
  if (selection === 'all' || selection === 'a') {
    return Array.from({ length: totalChapters }, (_, i) => i);
  }

  const indices = new Set<number>();
  for (const part of selection.replace(/\s+/g, '').split(',')) {
    if (!part) continue;

    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      for (let i = start - 1; i < Math.min(end, totalChapters); i += 1) {
        if (i >= 0) indices.add(i);
      }
      continue;
    }

    if (/^\d+$/.test(part)) {
      const index = Number(part) - 1;
      if (index >= 0 && index < totalChapters) indices.add(index);
    }
  }

  return [...indices].sort((a, b) => a - b);
}

/** Filesystem-safe name, matching the desktop sanitiser. */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** "3" for whole numbers, "3.5" for halves — matching the CLI's labels. */
export function formatChapterNumber(value: number): string {
  if (!Number.isFinite(value)) return '?';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function chapterLabel(chapter: { number: number; title: string }): string {
  const number = formatChapterNumber(chapter.number);
  const title = chapter.title.trim();
  if (!title || /^chapter\s*[\d.]+$/i.test(title)) return `Chapter ${number}`;
  return `Chapter ${number} · ${title}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatRelativeTime(timestamp: number): string {
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

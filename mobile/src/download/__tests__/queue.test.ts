jest.mock('../../lib/storage');

import * as storage from '../../lib/storage';
import { DEFAULT_CONFIG, type Config, type DownloadJob, type Page } from '../../types';
import { DownloadQueue, jobId, type JobSpec } from '../queue';

const mock = (storage as unknown as { __state: any; __reset: () => void });
const state = mock.__state;

const pages = (count: number): Page[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `p-${index + 1}`,
    image: `/static/chapters/c1/${String(index + 1).padStart(4, '0')}.webp`,
    number: index + 1,
    width: 800,
    height: 1200,
    aspectRatio: 0.66,
  }));

const config = (overrides: Partial<Config> = {}): Config => ({
  ...DEFAULT_CONFIG,
  demoMode: false,
  downloadFormat: 'images',
  keepImages: true,
  concurrentChapters: 2,
  concurrentImages: 2,
  maxRetries: 3,
  retryDelay: 0,
  ...overrides,
});

function spec(overrides: Partial<JobSpec> = {}): JobSpec {
  return {
    mangaId: 'OaKBx',
    mangaTitle: 'The Lantern Courier',
    coverUrl: '',
    chapterId: 'ch-1',
    chapterTitle: 'The first delivery',
    chapterNumber: 1,
    format: 'images',
    meta: {
      mangaType: 'Manga',
      authors: ['A. Rivera'],
      genres: ['Drama'],
      chapterCount: 12,
      pageCount: 5,
    },
    ...overrides,
  };
}

const activeQueues: DownloadQueue[] = [];

function makeQueue(cfg: Config, pageCount = 5, loader?: jest.Mock) {
  const jobs: DownloadJob[] = [];
  const loadPages =
    loader ??
    jest.fn(async () => pages(pageCount));

  const queue = new DownloadQueue({
    getConfig: () => cfg,
    loadPages,
    onJob: (job) => {
      const index = jobs.findIndex((entry) => entry.id === job.id);
      if (index >= 0) jobs[index] = job;
      else jobs.push(job);
    },
    onLibraryUpdate: jest.fn(),
  });

  activeQueues.push(queue);
  return { queue, jobs, loadPages };
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for condition');
}

beforeEach(() => {
  mock.__reset();
});

afterEach(async () => {
  // Abort anything still in flight so a slow test cannot leak work into the next one.
  while (activeQueues.length > 0) activeQueues.pop()?.dispose();
  await new Promise((resolve) => setTimeout(resolve, 25));
  mock.__reset();
});

describe('DownloadQueue', () => {
  it('downloads every page and finishes the job', async () => {
    const { queue } = makeQueue(config());
    queue.enqueue(spec());

    await waitFor(() => queue.list()[0]?.status === 'done');

    const job = queue.list()[0];
    expect(job.status).toBe('done');
    expect(job.pagesDone).toBe(5);
    expect(job.pagesTotal).toBe(5);
    expect(job.bytes).toBe(20);
    expect(job.outputPath).toBe('atsu/OaKBx/ch-1');
    expect(state.downloads).toHaveLength(5);
    expect(state.downloads[0].url).toBe('https://cdn.atsu.moe/static/chapters/c1/0001.webp');
  });

  it('zero-pads page filenames so archives sort correctly', async () => {
    const { queue } = makeQueue(config());
    queue.enqueue(spec());
    await waitFor(() => queue.list()[0]?.status === 'done');

    const names = state.downloads.map((entry: { path: string }) => entry.path.split('/').pop());
    expect(names).toEqual(['0001.webp', '0002.webp', '0003.webp', '0004.webp', '0005.webp']);
  });

  it('keeps image concurrency within the configured limit', async () => {
    state.delayMs = 12;
    const { queue } = makeQueue(config({ concurrentImages: 2 }), 8);
    queue.enqueue(spec());

    await waitFor(() => queue.list()[0]?.status === 'done');
    expect(state.maxInFlight).toBeLessThanOrEqual(2);
    expect(state.maxInFlight).toBeGreaterThan(1);
  });

  it('respects chapter-level concurrency', async () => {
    state.delayMs = 12;
    const { queue } = makeQueue(config({ concurrentChapters: 1, concurrentImages: 1 }), 3);

    queue.enqueue(spec({ chapterId: 'ch-1', chapterNumber: 1 }));
    queue.enqueue(spec({ chapterId: 'ch-2', chapterNumber: 2 }));
    queue.enqueue(spec({ chapterId: 'ch-3', chapterNumber: 3 }));

    await waitFor(() => queue.list().every((job) => job.status === 'done'));
    expect(state.maxInFlight).toBe(1);
  });

  it('retries a failing page with backoff before giving up', async () => {
    state.failures.set('atsu/OaKBx/ch-1/0003.webp', 2);
    const { queue } = makeQueue(config({ maxRetries: 3 }));

    queue.enqueue(spec());
    await waitFor(() => queue.list()[0]?.status === 'done');

    expect(queue.list()[0].status).toBe('done');
    const attempts = state.downloads.filter((entry: { path: string }) =>
      entry.path.endsWith('0003.webp'),
    );
    expect(attempts).toHaveLength(3);
  });

  it('keeps the pages it did get and names what is missing when a page never lands', async () => {
    state.failures.set('atsu/OaKBx/ch-1/0002.webp', 99);
    const { queue } = makeQueue(config({ maxRetries: 2 }));

    queue.enqueue(spec());
    await waitFor(() => queue.list()[0]?.status === 'error', 15000);

    const job = queue.list()[0];
    expect(job.status).toBe('error');
    // The message says how much is missing and that retry resumes — a chapter is
    // never reported as done with holes in it.
    expect(job.error).toContain('1 of 5 pages failed');
    expect(job.error).toContain('page 2');
    expect(job.error).toMatch(/Retry/);
    // The other four stayed on disk for the retry to reuse.
    expect(state.files.has('atsu/OaKBx/ch-1/0001.webp')).toBe(true);
    expect(state.files.has('atsu/OaKBx/ch-1/0005.webp')).toBe(true);
  });

  it('keeps going after a bad minute on the network instead of dying on page one', async () => {
    // Three failures in a row: more than the per-page retries, so only the
    // second pass over the chapter can finish it.
    state.failures.set('atsu/OaKBx/ch-2/0002.webp', 3);
    const { queue } = makeQueue(config({ maxRetries: 2 }));

    queue.enqueue(spec({ chapterId: 'ch-2', chapterNumber: 2 }));
    await waitFor(() => queue.list()[0]?.status === 'done', 15000);

    const job = queue.list()[0];
    expect(job.status).toBe('done');
    expect(job.pagesDone).toBe(5);
    expect(state.files.has('atsu/OaKBx/ch-2/0002.webp')).toBe(true);
  });

  it('skips pages already on disk, which is what makes it resumable', async () => {
    state.files.set('atsu/OaKBx/ch-1/0001.webp', new Uint8Array([9, 9]));
    state.files.set('atsu/OaKBx/ch-1/0002.webp', new Uint8Array([9, 9]));

    const { queue } = makeQueue(config());
    queue.enqueue(spec());
    await waitFor(() => queue.list()[0]?.status === 'done');

    expect(state.downloads).toHaveLength(3);
    expect(queue.list()[0].pagesDone).toBe(5);
    expect(queue.list()[0].bytes).toBe(16);
  });

  it('packs a CBZ and keeps one copy of the pages, not two', async () => {
    const { queue } = makeQueue(config({ downloadFormat: 'cbz', keepImages: false }));
    queue.enqueue(spec({ format: 'cbz' }));

    await waitFor(() => queue.list()[0]?.status === 'done');

    const job = queue.list()[0];
    expect(job.outputPath).toBe('atsu/exports/The Lantern Courier - ch 1.cbz');

    const archive = state.files.get(job.outputPath as string);
    expect(Array.from((archive as Uint8Array).slice(0, 2))).toEqual([0x50, 0x4b]);

    const text = new TextDecoder().decode(archive as Uint8Array);
    expect(text).toContain('ComicInfo.xml');
    expect(text).toContain('<Series>The Lantern Courier</Series>');
    expect(text).toContain('0005.webp');

    // CBZ is the only format now, so the archive *is* the download: the loose
    // pages are removed once it is safely written (the reader unpacks them on
    // first open). Keeping both doubled what a chapter cost on the device.
    expect(state.removedDirs).toContain('atsu/OaKBx/ch-1');
    expect(state.files.has('atsu/OaKBx/ch-1/0001.webp')).toBe(false);
  });

  it('pauses, resumes and finishes', async () => {
    state.delayMs = 25;
    const { queue } = makeQueue(config({ concurrentImages: 1 }), 6);
    queue.enqueue(spec());
    const id = jobId('OaKBx', 'ch-1', 'images');

    await waitFor(() => (queue.get(id)?.pagesDone ?? 0) >= 1);
    queue.pause(id);
    expect(queue.get(id)?.status).toBe('paused');

    const doneAtPause = queue.get(id)?.pagesDone ?? 0;
    await new Promise((resolve) => setTimeout(resolve, 60));
    // Nothing progresses while paused.
    expect(queue.get(id)?.pagesDone).toBe(doneAtPause);

    queue.resume(id);
    await waitFor(() => queue.get(id)?.status === 'done');
    expect(queue.get(id)?.pagesDone).toBe(6);
  });

  it('does not enqueue the same chapter/format twice', () => {
    const { queue } = makeQueue(config());
    queue.enqueue(spec());
    queue.enqueue(spec());
    expect(queue.list()).toHaveLength(1);
  });

  it('allows the same chapter in another format', () => {
    const { queue } = makeQueue(config());
    queue.enqueue(spec({ format: 'images' }));
    queue.enqueue(spec({ format: 'cbz' }));
    expect(queue.list()).toHaveLength(2);
  });

  it('cancels a job and clears its partial pages', async () => {
    state.delayMs = 20;
    const { queue } = makeQueue(config({ concurrentImages: 1 }), 8);
    const enqueued = queue.enqueue(spec());

    await waitFor(() => (queue.get(enqueued.id)?.pagesDone ?? 0) >= 1);
    queue.cancel(enqueued.id);

    await waitFor(() => queue.get(enqueued.id)?.status === 'canceled');
    expect(state.removedDirs).toContain('atsu/OaKBx/ch-1');
  });

  it('survives a restart: interrupted jobs are requeued and resume where they stopped', async () => {
    // Pages 1-2 already exist from an earlier session.
    state.files.set('atsu/OaKBx/ch-1/0001.webp', new Uint8Array([1]));
    state.files.set('atsu/OaKBx/ch-1/0002.webp', new Uint8Array([1]));

    const { queue } = makeQueue(config());
    queue.hydrate([
      {
        id: jobId('OaKBx', 'ch-1', 'images'),
        mangaId: 'OaKBx',
        mangaTitle: 'The Lantern Courier',
        coverUrl: '',
        chapterId: 'ch-1',
        chapterTitle: 'The first delivery',
        chapterNumber: 1,
        format: 'images',
        status: 'downloading',
        pagesTotal: 5,
        pagesDone: 2,
        bytes: 2,
        outputPath: null,
        error: null,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);

    await waitFor(() => queue.list()[0]?.status === 'done');
    expect(state.downloads).toHaveLength(3);
    expect(queue.list()[0].pagesDone).toBe(5);
  });

  it('fails cleanly when a chapter has no pages', async () => {
    const { queue } = makeQueue(config(), 0);
    queue.enqueue(spec());
    await waitFor(() => queue.list()[0]?.status === 'error');
    expect(queue.list()[0].error).toContain('No pages');
  });

  it('clearFinished leaves active work alone', async () => {
    state.delayMs = 20;
    const { queue } = makeQueue(config({ concurrentChapters: 1, concurrentImages: 1 }), 4);
    queue.enqueue(spec({ chapterId: 'ch-1' }));
    queue.enqueue(spec({ chapterId: 'ch-2' }));

    await waitFor(() => queue.list().some((job) => job.status === 'done'));
    const removed = queue.clearFinished();
    expect(removed).toHaveLength(1);
    expect(queue.list()).toHaveLength(1);
  });
});

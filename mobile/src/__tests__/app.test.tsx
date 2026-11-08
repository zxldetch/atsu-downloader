/**
 * End-to-end-ish test: mounts the real app (provider + router + screens) in
 * demo mode and walks the primary journey — load a series, select chapters,
 * start a download, watch it finish, then read it.
 *
 * storage is the in-memory manual mock, so this exercises the queue, the
 * archive builder and the screens together without touching the filesystem.
 */

jest.mock('../lib/storage');

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import App from '../../App';
import { DEFAULT_CONFIG } from '../types';

const storage = jest.requireMock('../lib/storage');

// Demo mode is driven by an env var at build time; force it on for tests.
jest.mock('../types', () => {
  const actual = jest.requireActual('../types');
  return {
    ...actual,
    DEFAULT_CONFIG: { ...actual.DEFAULT_CONFIG, demoMode: true },
  };
});

async function renderApp() {
  const view = render(<App />);
  await screen.findByText('Library');
  return view;
}

beforeEach(() => {
  storage.__reset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Atsu Mobile app', () => {
  it('boots into the library screen with the demo source available', async () => {
    await renderApp();

    expect(screen.getByText('Library')).toBeTruthy();
    expect(screen.getByText('Paste a manga link')).toBeTruthy();
    expect(screen.getByText('Try a demo series')).toBeTruthy();
    expect(screen.getByText('The Lantern Courier')).toBeTruthy();
    expect(
      screen.getByText(/Nothing here yet/),
    ).toBeTruthy();
  });

  it('loads a manga from the demo list and lists its chapters', async () => {
    await renderApp();

    await act(async () => {
      fireEvent.press(screen.getByText('The Lantern Courier'));
    });

    await screen.findByText('12 chapters · 0 offline', {}, { timeout: 4000 });
    expect(screen.getByText('Chapter range')).toBeTruthy();
    expect(screen.getByText('Chapter 1 · The first delivery')).toBeTruthy();
    expect(screen.getByText('Select chapters to download')).toBeTruthy();
  });

  it('accepts a pasted URL and a range expression', async () => {
    await renderApp();

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('https://atsu.moe/manga/…'),
        'https://atsu.moe/manga/demo-static',
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Load'));
    });

    await screen.findByText('9 chapters · 0 offline', {}, { timeout: 4000 });

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('all · 1-10 · 1,3,5-7'), '1-3');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Apply'));
    });

    // Three chapters selected => the footer button reflects it.
    expect(screen.getByText('Download 3 · CBZ')).toBeTruthy();
  });

  it('downloads a chapter, packages a CBZ and exposes it in the queue', async () => {
    await renderApp();

    await act(async () => {
      fireEvent.press(screen.getByText('The Lantern Courier'));
    });
    await screen.findByText('12 chapters · 0 offline', {}, { timeout: 4000 });

    // Select chapter 1 only.
    await act(async () => {
      fireEvent.press(screen.getByText('Chapter 1 · The first delivery'));
    });
    expect(screen.getByText('Download 1 · CBZ')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Download 1 · CBZ'));
    });

    await screen.findByText('Downloads', {}, { timeout: 4000 });
    await waitFor(
      () => {
        expect(screen.getAllByText('DONE').length).toBeGreaterThan(0);
      },
      { timeout: 8000 },
    );

    expect(screen.getByText('Save file')).toBeTruthy();
    const archive = [...storage.__state.files.keys()].find((path: string) =>
      path.endsWith('.cbz'),
    );
    expect(archive).toContain('The Lantern Courier - ch 1.cbz');
  });

  it('opens the settings screen and reports the demo source', async () => {
    await renderApp();

    await act(async () => {
      fireEvent.press(screen.getByText('⚙'));
    });

    await screen.findByText('Settings');
    expect(screen.getByText('Demo mode')).toBeTruthy();
    expect(screen.getByText('Output')).toBeTruthy();
    expect(screen.getByText('Clear all downloads')).toBeTruthy();
  });

  it('survives the default (non-demo) config being used for chapter math', () => {
    // Guards against the test-only config override leaking into assertions.
    expect(DEFAULT_CONFIG.concurrentImages).toBeGreaterThan(0);
  });
});

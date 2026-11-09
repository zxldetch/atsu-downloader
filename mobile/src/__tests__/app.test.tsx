/**
 * End-to-end-ish tests: mount the real app (providers + router + screens) in
 * demo mode and walk the primary journeys.
 *
 * storage is the in-memory manual mock, so these exercise the queue, the
 * archive builder and the screens together without touching the filesystem.
 */

jest.mock('../lib/storage');

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import App from '../../App';

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
  await screen.findByText('ATSU');
  return view;
}

/** Home → Search → demo chip → Load → lands on the series screen. */
async function openDemoSeries(title = 'The Lantern Courier', subtitle = '12 chapters · 0 offline') {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Search manga or paste a link'));
  });
  await screen.findByPlaceholderText('atsu.moe link, or search your shelf');

  await act(async () => {
    fireEvent.press(screen.getByText(title));
  });
  await act(async () => {
    fireEvent.press(screen.getByText('Load'));
  });

  await screen.findByText(subtitle, {}, { timeout: 4000 });
}

beforeEach(async () => {
  storage.__reset();
  // The AsyncStorage mock is module-global: without this, a shelf saved by one
  // test leaks into the next and the same title shows up twice.
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Atsu Mobile app', () => {
  it('boots into a shelf-first home screen', async () => {
    await renderApp();

    expect(screen.getByText('ATSU')).toBeTruthy();
    expect(screen.getByLabelText('Search manga or paste a link')).toBeTruthy();
    expect(screen.getByText('Your shelf is empty')).toBeTruthy();
  });

  it('adds a series from the search tab and lists its chapters', async () => {
    await renderApp();
    await openDemoSeries();

    expect(screen.getByPlaceholderText('Range · all, 1-10, 1,3,5-7')).toBeTruthy();
    expect(screen.getByText('Chapter 1 · The first delivery')).toBeTruthy();
    expect(screen.getByText('Select chapters')).toBeTruthy();
  });

  it('selects chapters with a range expression and reflects the count', async () => {
    await renderApp();
    await openDemoSeries();

    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Range · all, 1-10, 1,3,5-7'), '1-3');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Apply'));
    });

    expect(screen.getByText('Download 3')).toBeTruthy();
    expect(screen.getAllByText('3 selected').length).toBeGreaterThan(0);
  });

  it('downloads a chapter, packages a CBZ and shows it in the shelf queue', async () => {
    await renderApp();
    await openDemoSeries();

    await act(async () => {
      fireEvent.press(screen.getByText('Chapter 1 · The first delivery'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Download 1'));
    });

    await screen.findByText('Downloads', {}, { timeout: 4000 });
    await waitFor(
      () => {
        expect(screen.getAllByText('Saved').length).toBeGreaterThan(0);
      },
      { timeout: 8000 },
    );

    const archive = [...storage.__state.files.keys()].find((path: string) =>
      path.endsWith('.cbz'),
    );
    expect(archive).toContain('The Lantern Courier - ch 1.cbz');
  });

  it('keeps everything on the shelf tab after loading a series', async () => {
    await renderApp();
    await openDemoSeries();

    // The series screen is a pushed route, so step back to the tabs first.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Shelf'));
    });
    await screen.findByText('Library');

    expect(screen.getAllByText('The Lantern Courier').length).toBeGreaterThan(0);
    expect(screen.getByText('All 1')).toBeTruthy();
    expect(screen.getByText('Offline')).toBeTruthy();
  });

  it('loads several pasted targets at once', async () => {
    await renderApp();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Search manga or paste a link'));
    });
    await screen.findByPlaceholderText('atsu.moe link, or search your shelf');

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('atsu.moe link, or search your shelf'),
        'demo-lantern demo-static',
      );
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Load 2'));
    });

    await screen.findByText('Added 2 series to your shelf.', {}, { timeout: 4000 });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Shelf'));
    });
    expect(screen.getAllByText('The Lantern Courier').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Static Bloom').length).toBeGreaterThan(0);
  });

  it('filters chapters by what is already downloaded', async () => {
    await renderApp();
    await openDemoSeries();

    await act(async () => {
      fireEvent.press(screen.getByText('Chapter 1 · The first delivery'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Download 1'));
    });
    await waitFor(
      () => {
        expect(screen.getAllByText('Saved').length).toBeGreaterThan(0);
      },
      { timeout: 8000 },
    );

    // Back to the series page via the library segment.
    await act(async () => {
      fireEvent.press(screen.getByText('Library'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('The Lantern Courier'));
    });
    await screen.findByText('Read 1');

    await act(async () => {
      fireEvent.press(screen.getByText('Read 1'));
    });

    expect(screen.getByText('1 of 12 chapters shown · numbered as atsu.moe lists them')).toBeTruthy();
    expect(screen.getByText('Chapter 1 · The first delivery')).toBeTruthy();
  });

  it('selects every chapter that is not downloaded yet', async () => {
    await renderApp();
    await openDemoSeries();

    await act(async () => {
      fireEvent.press(screen.getByText('Missing 12'));
    });

    expect(screen.getByText('Download 12')).toBeTruthy();
  });

  it('applies the turbo speed preset', async () => {
    await renderApp();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Settings'));
    });
    await screen.findByText('Download speed');

    await act(async () => {
      fireEvent.press(screen.getByText('Turbo'));
    });

    expect(screen.getByText(/Peak parallelism is/)).toBeTruthy();
    expect(screen.getByText(/72 connections/)).toBeTruthy();
  });

  it('lists scanlation groups and filters chapters to the chosen one', async () => {
    await renderApp();
    // Iron Season ships two rival groups in the demo fixtures.
    await openDemoSeries('Iron Season', '34 chapters · 0 offline');

    expect(screen.getByText('Scanlation group')).toBeTruthy();
    expect(screen.getByText('Delta Scans 4')).toBeTruthy();
    expect(screen.getByText('Alpha Scans 9')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Delta Scans 4'));
    });

    expect(screen.getByText('4 of 4 chapters shown · numbered as atsu.moe lists them')).toBeTruthy();
    expect(screen.getByText('Downloads use Delta Scans')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('All 34'));
    });
    expect(screen.getByText('34 of 34 chapters shown · numbered as atsu.moe lists them')).toBeTruthy();
  });

  it('switches between the normal, dark and light themes', async () => {
    await renderApp();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Settings'));
    });
    await screen.findByText('Appearance');

    expect(screen.getByText('atsu.moe Midnight · every screen, the reader chrome and the splash follow this choice.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Light'));
    });
    expect(screen.getByText('Daylight · every screen, the reader chrome and the splash follow this choice.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Dark'));
    });
    expect(screen.getByText('True-black OLED · every screen, the reader chrome and the splash follow this choice.')).toBeTruthy();

    // The theme remount must not throw you back to Home.
    expect(screen.getByText('Appearance')).toBeTruthy();
  });

  it('exposes the upgraded settings: reader, downloads, storage and about', async () => {
    await renderApp();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Settings'));
    });
    await screen.findByText('Atsu Mobile');

    expect(screen.getByText('Reader')).toBeTruthy();
    expect(screen.getByText('Keep the screen awake')).toBeTruthy();
    expect(screen.getByText('Default format')).toBeTruthy();
    expect(screen.getByText('Demo mode')).toBeTruthy();
    expect(screen.getByText('Delete downloaded chapters')).toBeTruthy();
    expect(screen.getByText('Reset app and all data')).toBeTruthy();
  });

  it('filters the shelf from the search field', async () => {
    await renderApp();
    await openDemoSeries();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Search'));
    });
    await screen.findByPlaceholderText('atsu.moe link, or search your shelf');

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('atsu.moe link, or search your shelf'),
        'lantern',
      );
    });

    expect(screen.getByText('1 on your shelf')).toBeTruthy();
    expect(screen.queryByText('Nothing matched')).toBeNull();
  });
});

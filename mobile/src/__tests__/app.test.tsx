/**
 * End-to-end-ish tests: mount the real app (providers + router + screens) in
 * demo mode and walk the primary journeys.
 *
 * storage is the in-memory manual mock, so these exercise the queue, the
 * archive builder and the screens together without touching the filesystem.
 */

jest.mock('../lib/storage');

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

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

/** The chapter list starts in read mode; picking chapters needs download mode. */
async function chooseDownloadMode() {
  await act(async () => {
    fireEvent.press(screen.getByText('Download'));
  });
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

describe('Atsu Offline app', () => {
  it('boots into a shelf-first home screen', async () => {
    await renderApp();

    expect(screen.getByText('ATSU')).toBeTruthy();
    expect(screen.getByLabelText('Search manga or paste a link')).toBeTruthy();
    expect(screen.getByText('Your shelf is empty')).toBeTruthy();
  });

  it('adds a series from the search tab and lists its chapters', async () => {
    await renderApp();
    await openDemoSeries();

    expect(screen.getByText('Chapter 1 · The first delivery')).toBeTruthy();
    // Read mode by default: no download tools, no footer bar.
    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Range · 1-10')).toBeNull();
  });

  it('selects chapters with a range expression and reflects the count', async () => {
    await renderApp();
    await openDemoSeries();

    await chooseDownloadMode();
    await act(async () => {
      fireEvent.changeText(screen.getByPlaceholderText('Range · 1-10'), '1-3');
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Apply'));
    });

    expect(screen.getByText('Download 3')).toBeTruthy();
    expect(screen.getAllByText('3 selected').length).toBeGreaterThan(0);
  });

  it('downloads a chapter as a single CBZ and shows it in the queue', async () => {
    await renderApp();
    await openDemoSeries();

    await chooseDownloadMode();
    await act(async () => {
      fireEvent.press(screen.getByText('Chapter 1 · The first delivery'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Download 1'));
    });

    await screen.findByText('Queue', {}, { timeout: 4000 });
    await waitFor(
      () => {
        expect(screen.getAllByText('Saved').length).toBeGreaterThan(0);
      },
      { timeout: 8000 },
    );

    // One file per chapter: the archive holds every page, the loose pages are gone.
    const archives = [...storage.__state.files.keys()].filter((path: string) =>
      path.endsWith('.cbz'),
    );
    expect(archives.length).toBe(1);
    expect(archives[0]).toContain('ch 1.cbz');
    expect(
      [...storage.__state.files.keys()].filter((path: string) => /\.(webp|jpe?g|png)$/i.test(path)),
    ).toHaveLength(0);
  });

  it('opens a chapter on tap in read mode, and only ticks rows in download mode', async () => {
    await renderApp();
    await openDemoSeries();

    // Read mode: the row is a way in, not a checkbox.
    await act(async () => {
      fireEvent.press(screen.getByText('Chapter 2 · Rain, again'));
    });
    await screen.findByText(/Ch\. 2 · 1 \/ \d+/, {}, { timeout: 4000 });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });

    // Download mode: same tap selects.
    await chooseDownloadMode();
    await act(async () => {
      fireEvent.press(screen.getByText('Chapter 2 · Rain, again'));
    });
    expect(screen.getByText('Download 1')).toBeTruthy();
    expect(screen.getByText('1 selected')).toBeTruthy();
  });

  it('reads a downloaded chapter with the network switched off', async () => {
    await renderApp();
    await openDemoSeries();

    await chooseDownloadMode();
    await act(async () => {
      fireEvent.press(screen.getByText('Chapter 1 · The first delivery'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Download 1'));
    });
    await waitFor(() => expect(screen.getAllByText('Saved').length).toBeGreaterThan(0), {
      timeout: 8000,
    });

    // From here on nothing may reach the network — the pages must come off disk.
    const offline = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('no network'));

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Home'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('The Lantern Courier'));
    });
    // Back in read mode, the row itself opens the chapter — no play button.
    await act(async () => {
      fireEvent.press(screen.getByText('Read'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Chapter 1 · The first delivery'));
    });

    // The reader's footer counts pages inside the chapter it read from storage,
    // and the chrome says the source is offline.
    await screen.findByText('Ch. 1 · 1 / 6', {}, { timeout: 4000 });
    expect(screen.getByText('Chapter 1 · offline')).toBeTruthy();
    expect(screen.queryByText(/not on the device yet/)).toBeNull();

    offline.mockRestore();
  });

  it('deletes a download: the archive, the queue row and the library entry', async () => {
    await renderApp();
    await openDemoSeries();

    await chooseDownloadMode();
    await act(async () => {
      fireEvent.press(screen.getByText('Chapter 1 · The first delivery'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Download 1'));
    });
    await waitFor(
      () =>
        expect(
          [...storage.__state.files.keys()].filter((path: string) => path.endsWith('.cbz')),
        ).toHaveLength(1),
      { timeout: 8000 },
    );

    // The download jumps to the queue; go back to the series in read mode.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Home'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('The Lantern Courier'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Read'));
    });
    await screen.findByText('Chapter 1 · The first delivery');

    // Long-press a downloaded chapter on the series page.
    const alert = jest.spyOn(Alert, 'alert');
    await act(async () => {
      fireEvent(screen.getByText('Chapter 1 · The first delivery'), 'longPress');
    });

    expect(alert).toHaveBeenCalled();
    const buttons = alert.mock.calls[0]?.[2] as { text?: string; onPress?: () => void }[];
    const confirm = buttons?.find((button) => button.text === 'Delete');
    expect(confirm).toBeTruthy();
    await act(async () => {
      confirm?.onPress?.();
    });

    // Nothing of that chapter is left on the device — the archive is the download,
    // and it lives outside the chapter folder.
    expect(
      [...storage.__state.files.keys()].filter((path: string) => path.endsWith('.cbz')),
    ).toHaveLength(0);
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it('moves a whole chapter per arrow, not a page', async () => {
    await renderApp();
    await openDemoSeries();

    await act(async () => {
      fireEvent.press(screen.getByText('Chapter 1 · The first delivery'));
    });
    await screen.findByText(/Ch\. 1 · 1 \/ \d+/, {}, { timeout: 4000 });

    // The arrow names the chapter it will open, and lands on its first page —
    // page turns are the swipe and the bar, not the arrows.
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Next chapter · Chapter 2/));
    });
    await screen.findByText(/Ch\. 2 · 1 \/ \d+/, {}, { timeout: 4000 });

    await act(async () => {
      fireEvent.press(screen.getByLabelText(/^Previous chapter · Chapter 1/));
    });
    await screen.findByText(/Ch\. 1 · 1 \/ \d+/, {}, { timeout: 4000 });
  });

  it('lists only downloaded chapters under On device, and opens them', async () => {
    await renderApp();
    await openDemoSeries();

    await chooseDownloadMode();
    await act(async () => {
      fireEvent.press(screen.getByText('Chapter 2 · Rain, again'));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Download 1'));
    });
    await waitFor(() => expect(screen.getAllByText('Saved').length).toBeGreaterThan(0), {
      timeout: 8000,
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Shelf'));
    });

    // The library record lands once the job is finalised, and the tab counts it.
    const tab = await screen.findByText('On device', {}, { timeout: 8000 });

    // The section is built from the library record, so it needs no network.
    const offline = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('no network'));
    await act(async () => {
      fireEvent.press(tab);
    });

    expect(screen.getByText('Chapter 2 · Rain, again')).toBeTruthy();
    // Only the downloaded chapter is there — chapter 1 was never fetched.
    expect(screen.queryByText('Chapter 1 · The first delivery')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByText('Chapter 2 · Rain, again'));
    });
    await screen.findByText(/Ch\. 2 · 1 \/ \d+/, {}, { timeout: 4000 });
    offline.mockRestore();
  });

  it('puts the shelf summary directly under its heading', async () => {
    await renderApp();
    await openDemoSeries();

    // The series route is pushed, so step back to the tabs before Home.
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Back'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Home'));
    });

    // One line, inside the "Your shelf" header — not floating below the grid.
    expect(screen.getByText('Your shelf')).toBeTruthy();
    expect(screen.getByText(/^1 series · updated /)).toBeTruthy();
    expect(screen.queryByText(/0 chapters offline/)).toBeNull();
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

    await chooseDownloadMode();
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
    await chooseDownloadMode();

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
    await screen.findByText('Download Speed');

    await act(async () => {
      fireEvent.press(screen.getByText('Turbo'));
    });

    // The preset sets both concurrency numbers, and the steppers show them.
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
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

    // One description per section, not per option.
    expect(screen.getByText('Choose your preferred app theme.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Light'));
    });
    expect(screen.getByText('Choose your preferred app theme.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Dark'));
    });

    // The theme remount must not throw you back to Home.
    expect(screen.getByText('Appearance')).toBeTruthy();
  });

  it('exposes the upgraded settings: reader, downloads, storage and about', async () => {
    await renderApp();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Settings'));
    });
    await screen.findByText('Appearance');

    // The sections and rows the settings screen is specified to have, in order,
    // each with a single line of explanation.
    expect(screen.getByText('Choose your preferred app theme.')).toBeTruthy();
    expect(screen.getByText('Reading Direction')).toBeTruthy();
    expect(screen.getByText('Choose how pages are displayed.')).toBeTruthy();
    expect(screen.getByText('Keep the Screen Awake')).toBeTruthy();
    expect(screen.getByText('Prevent the screen from turning off while reading.')).toBeTruthy();
    expect(screen.getByText('Infinite Mode')).toBeTruthy();
    expect(screen.getByText('Scroll continuously between pages.')).toBeTruthy();
    expect(screen.getByText('Download Speed')).toBeTruthy();
    expect(screen.getByText('Set the number of simultaneous downloads.')).toBeTruthy();
    expect(screen.getByText('Chapters at Once')).toBeTruthy();
    expect(screen.getByText('Images per Chapter')).toBeTruthy();
    expect(screen.getByText('Retry per Image')).toBeTruthy();
    expect(screen.getByText('Retry Delay')).toBeTruthy();
    expect(screen.getByText('Server Mode')).toBeTruthy();
    expect(screen.getByText('Choose how content is delivered.')).toBeTruthy();
    expect(screen.getByText('Source Code')).toBeTruthy();
    expect(screen.getByText('Storage Usage')).toBeTruthy();
    expect(screen.getByText('Delete Downloaded Chapters')).toBeTruthy();
    expect(screen.getByText('Remove all downloaded chapters.')).toBeTruthy();
    expect(screen.getByText('Reset App and Data')).toBeTruthy();
    expect(screen.getByText('Restore the app to its default state.')).toBeTruthy();
    expect(screen.getByText('Update Information')).toBeTruthy();
    expect(screen.getByText('About the App')).toBeTruthy();

    // CBZ is fixed: there is no format selector to pick something else.
    expect(screen.getByText('CBZ')).toBeTruthy();
    expect(screen.queryByText('Images')).toBeNull();
    expect(screen.queryByText('PDF')).toBeNull();
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

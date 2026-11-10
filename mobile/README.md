# Atsu Offline

A React Native (Expo) port of [Atsu Downloader](../README.md) — the same API client,
scraper, download manager and CBZ/PDF converters, rebuilt for a phone instead of a
desktop, with a library, an offline reader and a resumable download queue.

| | Desktop (this repo) | Mobile (`mobile/`) |
|---|---|---|
| Language | Python 3.10+ | TypeScript |
| UI | Typer CLI + PyQt6 | React Native (Expo SDK 58) |
| HTTP | `requests` + `retry_with_backoff` | `fetch` + `AbortController`, same backoff |
| Concurrency | `ThreadPoolExecutor` | bounded promise pool |
| Output | `./downloads` | app document directory + share sheet |
| CBZ | `zipfile` (`ZIP_STORED`) | `jszip` (`STORE`) — byte-compatible layout |
| PDF | Pillow → PDF | `expo-image-manipulator` → `pdf-lib` |
| Metadata | `ComicInfo.xml` | same generator, ported field-for-field |
| Config | `config.json` | AsyncStorage |
| State | none (one-shot) | library + resumable job queue |

The desktop modules map across almost one-to-one:

```
api/client.py        → src/api/client.ts
scraper/manga.py     → src/api/parse.ts + fetchMangaWithChapters()
downloader/manager.py→ src/download/queue.ts   (+ new: persistence, pause, resume)
downloader/images.py → src/download/queue.ts   (per-page retry + skip-if-present)
converters/cbz.py    → src/lib/archive.ts
converters/pdf.py    → src/lib/archive.ts
converters/comicinfo.py → src/lib/archive.ts
config.py            → src/store/AppStore.tsx + src/types.ts
cli/ + gui/          → src/screens/* (Home, Search, Shelf, Series, Reader, Settings)
models.py            → src/types.ts
```

## Design

The palette is sampled from the atsu.moe **app**, pixel by pixel, not eyeballed: its base
surface is near-black `#0D0E12`, cards and rows lift to `#191A1E`, segmented-control wells sit
at `#08080A`, body text is pure white with a blue-grey secondary (`#B5B8BD`), and the only
saturated colour is the violet of its Continue button, `#7569BF` (`#B3A9EC` for small purple
text). Cover badges reuse the app's own badge colours — gold `#806000` and blue `#038DFC`.
Corner radii are small (5–10pt), buttons are tall pills, chips are rounded rectangles, section
headers are large and sentence case with a chevron when they navigate, and the tab bar lifts the
active icon onto a soft rounded square instead of showing a label.

The layout follows the reference screen by screen:

- **Home** — `Continue Reading ›` rows (96pt square thumbnail, title, `Ch. 12 · 34% · 2h ago`)
  and a right-aligned **See all ›** button, then the shelf grid with corner badges.
- **Series** — cover hero with a 29pt title, genre pills, a stats line
  (`233 chapters · 41 offline · 120 MB`), a TYPE / STATUS / AUTHOR grid, and a
  `All · Unread · Read · Queue` segmented control over the chapter list.
- **Reader** — dark rounded-square chrome buttons, a floating rounded title pill, a violet
  scrubber and a centred page pill between the prev/next squares.
- **Shelf** — `Your Bookmarks` with `All · Reading · Offline`.
- **Settings** — inset cards over the same near-black surface.

| Screen | What it does |
|---|---|
| **Home** | Search pill, *Continue Reading* rows with progress and *See all ›*, a live *Downloading* strip, and the whole shelf as a cover grid with offline badges |
| **Search** | Paste one link or several; live filter over your shelf by title, author or synopsis; demo chips when the demo source is on |
| **Shelf** | *Your Bookmarks* (filter: all / reading / offline, long-press to remove) and *Downloads* (pause all, resume all, clear finished, share finished archives) |
| **Series** | Cover hero + genre pills + stats + TYPE/STATUS/AUTHOR grid, synopsis, range box, All / Missing / Unread / Latest 5 / None shortcuts, format chips, `All · Unread · Read · Queue` segmented filter, oldest-or-newest sort, virtualised list, sticky *Download* bar |
| **Reader** | Vertical or paged, violet page scrubber with a page pill, tap to hide chrome, next-chapter hand-off, keep-awake, prefetches the next two pages |

Everything visual is in `src/theme.ts` (tokens) and `src/components/ui.tsx` (kit). Icons are
Ionicons, imported from `@expo/vector-icons/Ionicons` directly so only one font ships.

### Scanlation groups

A series can be posted by several groups ("Delta", "Alpha", ...), each with its
own copy of the same chapter numbers. The series screen detects that and shows a
`Scanlation group` picker — `All 34 · Alpha Scans 9 · Delta Scans 4` — because
downloading "chapter 5" is ambiguous otherwise.

- `client.ts` reads the group from every field atsu has used for it
  (`scanlator.name`, `groupName`, `team`, ...), falls back to matching
  `scanlationMangaId` against the series' `scanlators`, and de-duplicates chapters
  *within* a group instead of across groups.
- The picker remembers your choice per series (`config.groupChoice`), defaults to
  the group with the most chapters, and the range box, `Missing N`, `Unread` and
  `Select all` shortcuts all operate on the visible group only.
- In the `All` view every row is tagged with its group so repeated numbers are
  never a surprise.

### Themes

`Normal`, `Dark` and `Light`, switchable in **Settings → Appearance** (with a
three-swatch preview):

| | surface | cards | accent |
|---|---|---|---|
| **Normal** | `#0D0E12` | `#191A1E` | `#7569BF` |
| **Dark** | `#000000` | `#101114` | `#8A7CF0` |
| **Light** | `#F4F4F7` | `#FFFFFF` | `#5B4DB8` |

Normal is the atsu.moe palette sampled from the app; Dark is the same design on
true-black for OLED panels (with a slightly brighter violet, since pure black
gives less ambient contrast); Light keeps every layout rule and flips the surface
tokens for daylight reading. Switching is instant and keeps your place: the
theme is a token swap, so `theme.ts` exposes `colors` as a palette proxy plus
`makeStyles`, which builds and caches one StyleSheet per theme and is read lazily
at render time.

### Motion and accessibility

The opening animation is the app icon in motion: the wordmark rises and fades in
over the same black field the native splash uses, the violet dot pulses, and a
hairline bar fills while the store rehydrates — then the overlay fades out. Screen
changes cross-fade with a 10pt rise. All of it is `opacity`/`transform` only, so
it runs on the native driver and never competes with the download queue.

Deliberately **no animation library**: for a handful of short fades the built-in
`Animated` API with `useNativeDriver` is the cheapest option, while Reanimated
(and Moti on top of it) only pay off for gesture-driven or many-node animations,
and would add native build surface to the APK for nothing
([benchmarks](https://andrei-calazans.com/posts/2026-07-15-which-react-native-animation-library/),
[overview](https://www.f22labs.com/blogs/9-best-react-native-animation-libraries/)).

Accessibility follows the common React Native checklist
([guide](https://reactnativerelay.com/article/react-native-accessibility-guide-building-inclusive-apps-expo)):

- every interactive element has a role and a label; icon-only buttons are labelled,
- selections are exposed as `accessibilityState` (`tablist`/`tab`, `checkbox`/`checked`),
- a finished download is announced with `AccessibilityInfo.announceForAccessibility`,
- Reduce Motion is honoured: the splash, route fade and pulse are skipped entirely,
- body text keeps WCAG AA contrast in all three themes, and the light theme darkens
  secondary text and the accent rather than reusing the dark values,
- chips and buttons keep ≥40-44pt targets, and font scaling is left enabled with
  `numberOfLines` guarding layouts.

### Finding series

The search tab talks to atsu.moe's own catalog endpoint —
`GET /api/search/manga?q=…&query_by=title` — so series can be found by title
instead of by pasted link (`lib/catalog.ts`, parsed defensively because the
payload is Typesense-shaped rather than a published contract). Typing one title
per line and pressing **Add all** resolves up to ten titles in a row, which is the
"here is my list of manhwa" path; links and bare ids still load directly.

### Chapter list

The list has two modes, because one tap cannot mean two things:

- **Read** (default) — tapping a row opens the reader. The leading square shows
  whether that chapter is already on the device; there is no separate play button
  to aim at.
- **Download** — tapping ticks rows, the range box, quick picks (All, Missing,
  Unread, Latest 5) and the format chips appear, and the footer downloads the
  selection.

The square is a rounded-corner checkbox (24 px, radius 8) rather than a circle:
easier to hit and unmistakably a tick. There is no translucent card around the
download tools any more — a hairline groups them without boxing the screen in.

### Reader

- **Infinite mode is one continuous strip.** Chapters are appended to the list
  you are already scrolling — no navigation, no pressing "next chapter". Where
  one ends and the next begins the strip shows a seam:
  `Finished: Chapter 12` / `Next: Chapter 13`. Turning Infinite mode off keeps
  the reader inside a single chapter. The list logic lives in
  `src/lib/readerRows.ts` (pure, tested) so the seam ordering and per-chapter page
  counter can be verified without a renderer.
- **Navigating by hand.** The arrows move a page and, at the edges, cross into the
  neighbouring chapter (landing on its first page going forward, its last page
  going back). The chrome is flat: glyphs straight on a translucent scrim, no
  boxes, pills or shadows behind the buttons.
- **Auto-scroll.** Hands-free glide down a strip, speed 1-10 in Settings. A touch
  pauses it for 2.5 s instead of switching it off.
- **Page scrubber.** atsu's slider, rebuilt: rounded track, violet fill, thin
  white thumb, dot at the end. The fill and the thumb are inset inside the
  track's caps, so neither ever pokes out past the rounded edge at either end.
  Dragging moves the list 1:1 with the thumb (no animation lag) and a small chip
  shows `12 / 233` while you drag.
- **Settings sheet.** A bottom sheet in their "Graphics" style — uppercase label
  + value, the same slider, iOS switches — for layout, infinite mode, auto-scroll
  and keep-awake, with a reset.
- Tapping the title pill in the chrome opens the series page.

### Offline

Downloads keep their **page images** on the device — the archive (CBZ/PDF) is an
extra export, not a replacement. That is what the reader paints when there is no
connection, so `downloadFormat` no longer decides whether a chapter can be read
offline. Chapters saved by older builds, which kept only the archive, are unpacked
into the chapter folder the first time they are opened (`lib/cbz.ts`, with
`storage.extractArchive`).

The reader also no longer needs the series metadata to open a chapter: a download
records its own number, title and page count in the library, so a cold start with
no network opens the pages instead of "series not available". While offline,
series pages fall back to the downloaded chapters (`MangaScreen`'s
`offlineManga`), and "next chapter" walks the chapters that are actually on disk.

### Downloads that survive a bad connection

Pages are fetched in **passes** over whatever is still missing rather than one
all-or-nothing loop: a page that keeps failing after its retries only fails that
page, the next pass picks it up again, and the chapter is never reported as done
with holes in it. What is left over leaves the job in `error` with a message like
`3 of 40 pages failed — tap Retry, it picks up where this left off`, and the pages
already on disk are reused.

Each page is downloaded to `<page>.part` and only moved into place once the bytes
are verified non-empty (`storage.downloadToFile`). Before, a connection dropping
mid-request could leave a short file at the final name, which the resume check
then skipped — that is how a "complete" chapter ended up with blank pages. `.part`
files are ignored by the archive builder and by the reader.

Deleting: long-press a downloaded chapter on the series page, on a row in the
**On device** tab, or use the bin on a finished row in the downloads queue — all
three confirm first and remove the files.

### On device

Shelf → **On device** is a flat list of every downloaded chapter, built purely from
the library record, so it fills in with no network at all. Each row shows the
series, the chapter label, its page count, format and size, and where you left off
("page 3 of 24"). Tap to read, long-press to delete. The Library grid still answers
"which series"; this answers "*what can I read right now*".

### Reader motion

Auto-scroll advances the offset by elapsed time on `requestAnimationFrame` instead
of adding a couple of pixels every 48ms, so it is continuous motion rather than
twenty small jumps a second. The list keeps a wider render window
(`windowSize={9}`, clipping off) so pages either side are already mounted, and the
page cell is memoised with `transition={0}` — re-rendering on every scroll tick no
longer pushes new style props into the native image view or fades a page that was
already on screen. That combination was the flicker.

The two footer arrows move between **chapters** — always starting on the new
chapter's first page — and their accessibility labels name the chapter they will
open. Turning pages is the swipe, the page bar, or the scrubber.

### Reader chrome

The controls float: every button, the page pill and the scrubber sit on their own
rounded shape, and there is no full-width translucent band (that rectangle, with
its soft edge, was reading as a drop shadow). The slider has a `dark` tone so it
keeps the reader's palette instead of following the app theme.

### Packaging

The release APK ships arm64-v8a and armeabi-v7a only (`reactNativeArchitectures`
in the generated `android/gradle.properties`, set by the workflow). x86/x86_64
libraries exist for emulators and made the download far larger than a phone
needs — and large downloads are what break, since Android's installer reports a
truncated APK as *"the parser did not find any certificates"*. CI asserts the
packaged ABIs after assembling and publishes `atsu-mobile.apk.sha256` alongside
the APK, with the size and hash in `version.json`.

### Updates

Every build is signed with the committed key in `mobile/keys/atsu-offline.keystore`
(personal-use debug-grade key, password in `.github/workflows/android-apk.yml`), so
a newer APK installs **over** the old one and keeps the user's data. CI verifies
the certificate fingerprint after building and fails rather than publish an APK
signed with anything else.

A sideloaded APK gets no store updates, so the app checks for itself: CI stamps
each build with its run number as `versionCode` and publishes `version.json`
next to the APK. On launch the app fetches that file, compares it with the
embedded `versionCode`, and — only if the published build is newer — shows a
"Build N is available" strip on Home (and a status row in Settings → Updates)
with a download button. Android still asks for confirmation before installing;
silent self-update is not possible outside Play.

### Animations

The selection rectangle **slides** instead of blinking: the segmented controls
and the tab bar keep one highlighted rectangle and spring it to the new index.
Progress bars ease to their new width, the splash plays the icon as an animation,
and route changes cross-fade. All of it is opacity/transform (or a 300 ms width
ease for the bars), and all of it is skipped under Reduce Motion.

### Download throughput

100 chapters is the normal case for this app, so the pipeline is tuned for it rather than for
one chapter at a time:

- **Defaults are 4 chapters × 8 images** (32 parallel page requests) instead of 2 × 4. Settings
  exposes Gentle / Balanced / Turbo presets (2×4, 4×8, 6×12) plus the raw steppers.
- **Page lists are prefetched.** The next `2 × concurrentChapters` chapters have their page
  lists requested while the current batch is still downloading, so the API round-trip is no
  longer on the critical path at every chapter boundary.
- **Resuming costs one directory listing**, not a `stat` per page, and the chapter directory is
  created once per chapter instead of once per page (that was ~40-60 wasted native calls per
  chapter, thousands across a long queue).
- **Packaging reads page bytes in parallel** (6 at a time) instead of one file after another —
  this was the stall that made the last page of every chapter feel like a hang.
- **The queue is no longer re-serialised to storage on every progress tick.** Status changes
  still persist immediately; page counters land every 2.5 s, which is enough because a resume is
  reconstructed from the files on disk.
- **Retry delay defaults to 1 s** (doubling), so a transient CDN hiccup costs a second, not two.
- The queue reports live **pages/s and a time estimate** per chapter and in aggregate.

### Why the first build scrolled badly, and what changed

1. **Every page of a chapter was mounted at once.** The reader used a `ScrollView` that mapped
   all pages, so a 60-page chapter decoded 60 full-res images before showing the first one. It
   is now a virtualised `FlatList` in both modes, with exact `getItemLayout` offsets computed
   from page aspects, `windowSize={3}`, and `Image.prefetch` for the next two pages.
2. **Download progress re-rendered the whole app.** Every job update went straight into React
   state, and every screen reads that context, so a 3-chapter download repainted the shelf and
   a 200-row chapter list several times a second. Job updates are now coalesced into one commit
   per 250 ms and flushed immediately on status changes; status text in chapter rows
   deliberately omits page counters so those rows don't re-render at all.
3. **Rows were rebuilt on every render.** Chapter, job, rail and shelf rows are `React.memo`
   components taking *stable* callbacks that receive an id, instead of a fresh closure per row.
4. **Android elevation on every card.** Each `elevation` was a render pass; the flat surfaces
   that atsu uses are also the fast ones. Shadows are gone from list rows.
5. **Lists were untuned.** Every list sets `initialNumToRender`, `maxToRenderPerBatch`,
   `windowSize`, `updateCellsBatchingPeriod` and `removeClippedSubviews`, and covers use
   `cachePolicy="memory-disk"` with a `recyclingKey` so scrolling doesn't re-decode.

## Quick start (on your phone, ~1 minute)

```bash
cd mobile
npm install
npx expo start
```

Install **Expo Go** ([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) ·
[iOS](https://apps.apple.com/app/expo-go/id982107779)), then scan the QR code from the
terminal. The app loads over your LAN — no Android Studio, no Xcode, no Mac required.

Paste any atsu.moe link and the app talks to the source directly. To try the queue, reader
and CBZ/PDF export without any network at all, turn on **Settings → Source → Demo mode** —
it serves bundled sample series with generated art through the exact same code paths. (The
`build:web` preview build has demo mode baked on.)

> On a real phone the app calls `https://atsu.moe` directly. There is no backend, no
> account, and nothing is uploaded anywhere.

## Commands

```bash
npm start              # Expo dev server (Expo Go / dev builds)
npm run android        # open on a connected Android device or emulator
npm run ios            # open in the iOS simulator (macOS only)
npm test               # 46 unit + integration tests
npm run typecheck      # tsc --noEmit, strict
npm run demo-assets    # regenerate the demo page/cover art (needs Pillow)

npm run build:web      # export the web build (demo mode) to ./dist
npm run preview        # serve ./dist + proxy atsu.moe on :8080
```

## Getting an APK

Three routes, easiest first. None of them require you to own the app-store saga below.

### 0. Just want the current APK?

<https://github.com/zxldetch/atsu-downloader/releases/download/mobile-latest/atsu-mobile.apk>

Every green CI build re-uploads that asset (tag `mobile-latest`), so the link is stable and
always the newest build. Install steps: [`INSTALL.md`](INSTALL.md).

### A. GitHub Actions (nothing to install — this is how the current APK was built)

[`.github/workflows/android-apk.yml`](../.github/workflows/android-apk.yml) builds a release
APK on GitHub's runners — no Expo account, no Android SDK, no Mac. It runs `tsc` and the
test suite first, so a broken tree fails in seconds rather than at the end of a Gradle build.

1. Push any change under `mobile/` (or use **Actions → Build Android APK → Run workflow**).
2. Open the newest run at
   [github.com/zxldetch/atsu-downloader/actions](https://github.com/zxldetch/atsu-downloader/actions).
3. Download the **atsu-mobile-apk** artifact at the bottom of the run summary (~30 MB zipped;
   the `.apk` inside is ~72 MB — unzip it to get `atsu-mobile.apk`).

It signs with the debug keystore from the generated project, which is fine for personal use.
Builds take 10–20 minutes including the Gradle cache warm-up.

### B. Cloud build with EAS (works today, needs a free expo.dev account)

```bash
cd mobile
npx eas-cli login                                  # or: npx eas-cli register
npx eas-cli build -p android --profile preview
```

The `preview` profile in [`eas.json`](eas.json) is already `buildType: "apk"` with internal
distribution, so you get an installable file rather than a Play Store `.aab`. EAS prints a
build URL; the APK is also in your expo.dev dashboard under **Builds**. On the first build
it offers to generate a keystore — accept, and Expo keeps it for future releases (that
account is what lets you ship updates over the top later).

### C. Local build with Gradle

Needs JDK 17+ and the Android SDK (Android Studio, or `sdkmanager` with `ANDROID_HOME` set).

```bash
cd mobile
npm run build:apk
# → android/app/build/outputs/apk/release/app-release.apk
```

`npm run build:apk` is just `expo prebuild -p android` followed by
`./gradlew assembleRelease`, so the generated `android/` directory is disposable — delete it
and the next build recreates it.

Heads-up: the React Native template signs *release* builds with the debug keystore. That
installs and runs fine for personal use, but before distributing to other people, generate a
real keystore and wire it into `android/app/build.gradle`:

```bash
keytool -genkeypair -v -keystore atsu-release.keystore -alias atsu \
  -keyalg RSA -keysize 2048 -validity 10000
```

### Installing the APK

1. Copy the `.apk` to the phone (USB, Drive, Telegram — anything).
2. Tap it in a file manager and allow **Install unknown apps** for that app when prompted.
3. Play Protect will warn about an app from outside the Play Store; that is expected for a
   sideloaded downloader — choose **Install anyway**.

To ship an update later, bump `expo.version` (and `android.versionCode` if you build
locally) so Android treats it as newer and installs over the old one.

> Reminder from the limitations below: do not expect Play Store or App Store approval for
> this app. Sideloading is the intended route.

## How it works

```
Home ──paste URL / demo series──▶ Manga ──select chapters + range──▶ Queue ──▶ Reader
                                        │                              │
                                        └── format: images/cbz/pdf ────┴──▶ share sheet / gallery
```

**Queue** (`src/download/queue.ts`)

- Chapters run `concurrentChapters` at a time (default 2), pages `concurrentImages`
  (default 4) — both configurable in Settings.
- Every page is committed to disk as it lands and skipped if already present, so an
  interrupted download resumes instead of restarting. Jobs are persisted and
  `downloading` jobs are requeued on next launch.
- Failed pages retry with exponential backoff (`maxRetries`, `retryDelay`), matching the
  desktop behaviour.
- Pause/resume/cancel are real: each job owns an `AbortController` that is passed all
  the way into the native download.

**Storage** (`src/lib/storage.ts`)

```
<documents>/atsu/<mangaId>/<chapterId>/0001.webp   loose pages (deleted after packing
                                                   unless "Keep page images" is on)
<documents>/atsu/exports/<title> - ch <n>.cbz      finished archives
```

`expo-file-system` has no web implementation, so the web build keeps bytes in memory and
exports through the browser's download manager. Everything else is shared.

**Reader** (`src/screens/ReaderScreen.tsx`) prefers the downloaded files and only falls
back to streaming when a chapter isn't offline. Scroll or paged mode, position saved per
manga.

## Demo mode

atsu.moe is unreachable from CI and from most sandboxes, and evaluating a downloader
without content is awkward. `npm run demo-assets` generates six pages and three covers
from scratch (Pillow, no third-party art) into `src/api/demoPages.ts` / `demoCovers.ts`;
`src/api/demo.ts` serves them through the same interfaces as the live client. The demo
goes through the real queue, real zip/PDF writers and the real reader — it is a fixture,
not a mock UI.

## Web build and the proxy

`server/preview.mjs` does two things: serves the exported SPA, and proxies
`/proxy/atsu` → `https://atsu.moe` and `/proxy/cdn` → `https://cdn.atsu.moe`.

The proxy is required on web only, because browsers forbid setting `Referer` and atsu.moe
sends no CORS headers. Native builds skip it entirely (`src/api/client.ts` picks the base
URL from `Platform.OS`). Override with `EXPO_PUBLIC_ATSU_BASE` / `EXPO_PUBLIC_ATSU_CDN`.

## Testing

```bash
npm test
```

- `src/api/__tests__/parse.test.ts` — URL/ID parsing and the chapter-selection grammar
  (`all`, `1-10`, `1,3,5-7`), ported behaviour included.
- `src/lib/__tests__/archive.test.ts` — CBZ is a real zip with ComicInfo.xml; XML escaping;
  decimal chapter numbers.
- `src/download/__tests__/queue.test.ts` — concurrency limits, retry/backoff, resume from
  partial state, pause/resume/cancel, CBZ packaging, `keepImages`.
- `src/__tests__/app.test.tsx` — mounts the real app and walks the journey: load a series →
  select a chapter → download → CBZ appears in the queue → settings.

## Limitations, honestly

- **App Store / Play Store**: both reject apps that make it easy to download copyrighted
  manga from unlicensed aggregators. Sideloading (the `preview` APK profile) or TestFlight
  is the realistic path; a store listing will likely be rejected.
- **Background downloads**: the queue keeps running while the app is foregrounded. If the
  OS suspends the app, in-flight transfers pause — but partial pages stay on disk, so
  reopening continues where it stopped. A true background service needs a development
  build plus `expo-task-manager`/`BGTaskScheduler`.
- **Web preview**: storage is in-memory and the source needs the proxy; it exists to make
  the UI reviewable, not to be the shipped product.
- **PDF export** converts each page to JPEG on device, which is CPU- and memory-heavy for
  very long chapters. CBZ is lossless and much faster — it is the default for that reason.

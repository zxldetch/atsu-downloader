# Atsu Mobile

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
cli/ + gui/          → src/screens/*
models.py            → src/types.ts
```

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

### A. GitHub Actions (nothing to install)

[`.github/workflows/android-apk.yml`](../.github/workflows/android-apk.yml) builds a release
APK on GitHub's runners — no Expo account, no Android SDK, no Mac.

1. Merge this branch into `main` (the workflow appears under the **Actions** tab once it is
   on the default branch).
2. **Actions → Build Android APK → Run workflow**, or just push a change under `mobile/`.
3. When the run finishes (~15 min), open it and download the **atsu-mobile-apk** artifact,
   then rename it to `atsu-mobile.apk` if your browser adds a `.zip`.

It signs with the debug keystore from the generated project, which is fine for personal use.

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

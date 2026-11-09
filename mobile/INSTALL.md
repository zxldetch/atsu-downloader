# Installing the APK

Android-only. The APK is universal (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) and needs
**Android 7.0 (Nougat) or newer** — any phone from ~2017 on is fine.

---

## New in this build

*Build 31 · install over the old app, nothing is lost.*

- **Renamed** to **Atsu Offline** (same package `moe.atsu.mobile`, so it installs
  straight over the old build and keeps your library).
- **New icon**: violet wifi waves with a slash, the A as its dot — offline reading,
  atsu mark.
- **Reader**: arrows step into the previous/next chapter at the edges, an
  "Infinite mode" switch, auto-scroll with a 1-10 speed slider, and a draggable
  page bar in atsu's style that follows your finger exactly. Tap the title to jump
  back to the series page. A new Reader settings sheet (bottom panel) holds all of
  it.
- **Infinite mode reads itself.** The next chapter is appended to the strip you
  are already scrolling, so there is nothing to press: you reach the bottom and
  keep going, past a seam that says `Finished: Chapter 12` / `Next: Chapter 13`.
- **No boxes behind the reader's buttons** any more — the glyphs sit on a plain
  scrim, and the page bar's fill now stays inside its rounded track instead of
  spilling past the end.
- **Offline actually works now.** The old build packed each chapter into a CBZ
  and then deleted the page files to save space, so the reader had nothing to
  show without a connection. Downloads now keep their pages, chapters you already
  have are unpacked from their CBZ the first time you open them, and the reader no
  longer needs the series metadata (or the network) to open a downloaded chapter.
- **Updates keep your data.** Every build is now signed with the same key, so a
  new APK installs *over* the old one — Android says "Update", not "Install" — and
  your shelf, settings and downloaded chapters stay put.
- **Search atsu.moe from inside the app.** Type a title on the Search tab and the
  results are the site's own. Have a list? Put one title per line and press
  **Add all** — no links needed.
- **Tapping a chapter reads it.** The list now has Read and Download modes: in
  Read, a tap opens the chapter (the square shows what's already on the device);
  in Download, a tap ticks it. The round play button is gone.
- **Calmer layout.** The translucent rectangle around the chapter tools is gone,
  chapter titles are brighter and larger, and the page bar's fill is a flat bar
  that stops short of the thumb instead of a pill spilling past the track.
- **Your logo.** The A with the violet slashes, on a light lavender plate so it
  reads as an icon instead of loose glyphs on a transparent canvas.
- **Reader controls float.** Each button, the page pill and the page bar have
  their own rounded shape behind them, and the full-width translucent band is
  gone — that was the "shadow" you circled.
- **Poor connections finish.** A page that fails no longer kills the chapter: the
  downloader keeps retrying the missing pages, keeps what it already fetched, and
  a half-written file can't masquerade as a page. If something is still missing
  the row says how many pages and Retry resumes from there.
- **Delete downloads.** Long-press a downloaded chapter on its series page, or
  tap the bin on a finished row in the downloads queue — both ask first.
- **Auto-scroll is smooth now.** It moves continuously instead of in twenty small
  jumps a second, and pages either side of the one you are reading stay mounted,
  so nothing blinks or fades while the page creeps down.
- **The arrows move chapters.** Left/right always land on the first page of the
  neighbouring chapter (the label tells you which one). Page turns are the swipe,
  the page bar or the scrubber.
- **Shelf → On device.** Every downloaded chapter in one flat list — series,
  chapter, pages, size, and where you stopped. No connection needed. Tap to read,
  long-press to delete.
- **Picking chapters.** The shortcuts now say how much they will pick (All 34,
  Missing 12, Unread 20), light up when that is exactly the current selection,
  and the footer counts pages, not just chapters. Messages (like "those chapters
  are already queued") float over the list instead of living below the fold.
- **Downloads now run 1 → N.** They used to start at the newest chapter because
  the API lists chapters newest-first.
- **Theme switching no longer flickers** (no remount, no blank frame).
- **Update notice**: if a newer build is published, Home shows "Build N is
  available" with a download button, and **Settings → Updates** has a *Check now*
  button. Android will ask you to confirm the install — no silent self-updating,
  that is not allowed for sideloaded apps. From this build on you will be told,
  instead of having to remember the release page.

## Will I lose anything when I install a new build?

No — as long as you **install over the top and never uninstall first**. The app
package (`moe.atsu.mobile`) is unchanged, every build is signed with the same
committed key (`mobile/keys/atsu-offline.keystore`), and the build number always
goes up. Android treats that as an update: your shelf, reading progress, settings
and downloaded chapters all survive.

One caveat, once: builds **before this one** were signed with a throwaway key that
changed on every CI run, so Android may refuse this build with *"App not
installed"* or a signature error. If that happens, uninstall the old app once and
install this APK fresh — **that deletes the downloads currently on the phone**.
After this build you will never have to do it again.

## 1. Download the APK

Straight to the phone — no login, no unzipping:

**<https://github.com/zxldetch/atsu-downloader/releases/download/mobile-latest/atsu-mobile.apk>**

or open the release page and tap the file:
<https://github.com/zxldetch/atsu-downloader/releases/tag/mobile-latest>

The browser will warn that this type of file can harm your device — that is the standard
Android/Chrome warning for any `.apk`, tap **Download anyway**. The file lands in
**Downloads** as `atsu-mobile.apk` (**~72 MB** — it is a universal build carrying all four
CPU architectures, so it runs on any phone without you having to pick a variant. On metered
data, prefer Wi-Fi.)

*Fallback:* every CI run also keeps the APK as a workflow artifact for 30 days
(**Actions → Build Android APK → newest run → Artifacts**), but those are private to the
repository and arrive zipped, so the release link above is the better path.

---

## 2. Allow the install

Android blocks apps from outside the Play Store by default, per-app. The first time you tap
the APK you will see one of these:

- **"For your security, your phone is not allowed to install unknown apps from this source"**
  → tap **Settings** → enable **Allow from this source** → press back. The installer is
  already waiting.
- **"Install unknown apps" toggle** → turn it on for *Files* (or *Chrome*, whichever app you
  are opening the APK from).

Then:

1. Tap **Install** (not "Cancel").
2. **Play Protect** will most likely say *"Unsafe app blocked"* or warn that the app was not
   scanned. Tap **More details** → **Install anyway**. This is normal for any sideloaded app;
   it means "unknown developer", not "known malware".
3. Tap **Open**.

If Play Protect blocks it without offering a way through, temporarily turn off
*Play Store → profile → Play Protect → Scan apps with Play Protect*, install, then turn it
back on.

---

## 3. First run

The APK does **not** ship with demo data — you start with an empty shelf on purpose. The app
opens on **Home**, with a search bar at the top and four tabs along the bottom: **Home ·
Search · Shelf · Settings**.

1. Tap the search bar (or the **Search** tab) and paste a manga link, e.g.
   `https://atsu.moe/manga/OaKBx` — or just the id `OaKBx` — then tap **Load**. Several links
   at once also work: separate them with spaces or commas and tap **Load 3**.
2. On the series page, tap chapters to select them, or use a shortcut: **All**, **Unread**,
   **Latest 5**, **None**. To type a range instead, put `all`, `1-10` or `1,3,5-7` in the
   range box and tap **Apply**.
3. Pick **CBZ** (default, best), **PDF**, or **Images** from the format chips, and use the
   chapter filters — **All**, **Not downloaded**, **Offline**, **In queue** — to see just what
   you still need. The arrow next to *Chapters* flips between oldest-first and newest-first.
4. Tap **Download N** — you land on **Shelf → Downloads** and can watch pages land, pause,
   resume, retry, or share.
5. When a chapter finishes, the row shows **Saved**: the share icon opens Android's share
   sheet (choose *Files* to put the `.cbz` anywhere, or *Drive*), and the play button opens it
   in the built-in reader. Reading position is remembered, and **Jump back in** on Home puts
   it one tap away.

A whole back catalogue is two taps: press **Missing N** (every chapter not yet on the phone),
then **Download N**. Downloads run 4 chapters × 8 images at a time by default and show a live
pages-per-second read-out with a time estimate; **Settings → Download speed** has Gentle,
Balanced and Turbo presets if you want them faster or cooler.

Reader and download behaviour live in **Settings**: *Reading direction* switches between the
continuous **Vertical** strip (how webtoons are drawn) and **Paged**; *Keep the screen awake*
stops the phone sleeping mid-chapter; *Downloads* holds the format, concurrency and retry
settings.

Optional: **Settings → Source → Demo mode** turns on three bundled sample series. With it on,
the **Search** tab lists them as chips, so you can try the queue, reader and CBZ export with
no network at all.

Permissions you may be asked for: *Photos/Media* — only when you tap **Save to gallery** on an
`images`-format chapter. Nothing else is requested; nothing is uploaded anywhere.

---

## 4. Updating later

Repeat steps 1–2 with the newer APK. Each CI build carries an increasing `versionCode`, so
Android installs it straight over the old one and your library, downloads and settings are
kept.

---

## If it goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| *"App not installed"* / *"invalid package"* | Truncated/downloaded-inside-zip file | Re-download and unzip on a computer; the file must be exactly `atsu-mobile.apk` |
| *"App not installed as package conflicts with existing package"* | An older copy signed with a different key (e.g. an EAS build) | Uninstall the existing Atsu Offline, then install |
| **Install** button greyed out | Under ~100 MB free storage, or a work profile | Free up space / install in the personal profile |
| Play Protect refuses | Default posture for unknown developers | *More details → Install anyway*, or pause Play Protect scanning |
| Opens to an empty library | Expected — demo mode is off | Paste a manga link |
| Link fails to load | atsu.moe down, or blocked on your network | Retry; try mobile data |
| Chapters fail at *0%* | Source/CDN issue or rate limiting | Lower *Settings → Performance* concurrency, retry the job |

iPhone: an APK cannot be installed. Use **Expo Go** with `npx expo start` from a computer, or
build for iOS through EAS with an Apple Developer account.

# Installing the APK

Android-only. The APK is universal (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) and needs
**Android 7.0 (Nougat) or newer** — any phone from ~2017 on is fine.

---

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
| *"App not installed as package conflicts with existing package"* | An older copy signed with a different key (e.g. an EAS build) | Uninstall the existing Atsu Mobile, then install |
| **Install** button greyed out | Under ~100 MB free storage, or a work profile | Free up space / install in the personal profile |
| Play Protect refuses | Default posture for unknown developers | *More details → Install anyway*, or pause Play Protect scanning |
| Opens to an empty library | Expected — demo mode is off | Paste a manga link |
| Link fails to load | atsu.moe down, or blocked on your network | Retry; try mobile data |
| Chapters fail at *0%* | Source/CDN issue or rate limiting | Lower *Settings → Performance* concurrency, retry the job |

iPhone: an APK cannot be installed. Use **Expo Go** with `npx expo start` from a computer, or
build for iOS through EAS with an Apple Developer account.

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

The APK does **not** ship with demo data — you start with an empty library on purpose.

1. Paste a manga link into the box at the top, e.g. `https://atsu.moe/manga/OaKBx`, and tap
   **Load**. (A bare id like `OaKBx` works too.)
2. Tap chapters to select them, or type a range in **Chapter range** (`all`, `1-10`,
   `1,3,5-7`) and tap **Apply**.
3. Pick **CBZ** (default, best), **PDF**, or **Images**.
4. Tap **Download N · CBZ** — the queue opens and shows pages landing.
5. When a chapter finishes: **Save file** opens Android's share sheet (choose *Files* to put
   the `.cbz` anywhere, or *Drive*), and **Read** opens it in the built-in reader.

Optional: **Settings → Source → Demo mode** turns on the three bundled sample series, if you
want to click around without any network.

Permissions you may be asked for: *Photos/Media* — only when you tap **Save to gallery** on
an `images`-format chapter. Nothing else is requested; nothing is uploaded anywhere.

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

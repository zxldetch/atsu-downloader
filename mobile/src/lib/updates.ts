/**
 * Update checks for a sideloaded APK.
 *
 * Google Play handles updates for store apps; a sideloaded build has to look
 * after itself. CI stamps every build with its run number as `versionCode` and
 * publishes a tiny `version.json` next to the APK, so the app can ask "is there
 * anything newer than me?" and offer the download.
 *
 * It cannot install anything silently — Android requires the user to confirm an
 * unknown-source install — so the honest flow is: notice → tap → browser
 * download → system installer.
 */

import Constants from 'expo-constants';

const REPO = 'zxldetch/atsu-downloader';
const RELEASE = 'mobile-latest';

export const APK_URL = `https://github.com/${REPO}/releases/download/${RELEASE}/atsu-mobile.apk`;
const VERSION_URL = `https://github.com/${REPO}/releases/download/${RELEASE}/version.json`;
const INSTALL_URL = `https://github.com/${REPO}/blob/main/mobile/INSTALL.md`;

export interface RemoteVersion {
  version: string;
  versionCode: number;
  apkUrl: string;
  installUrl: string;
  notes?: string;
  publishedAt?: string;
}

export interface UpdateCheck {
  /** The newer build, or null when this install is current. */
  update: RemoteVersion | null;
  /** This install's build number. */
  current: number;
  /** Human-readable failure, when the check could not run. */
  error: string | null;
}

/** The `versionCode` stamped by CI into the embedded app config. */
export function currentVersionCode(): number {
  const android = (Constants.expoConfig as { android?: { versionCode?: number } } | null)?.android;
  const code = android?.versionCode;
  if (typeof code === 'number' && Number.isFinite(code)) return code;
  // Web/dev fall back to the semantic version so the UI has something to show.
  const parsed = Number.parseFloat(String(Constants.expoConfig?.version ?? '0'));
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export async function checkForUpdate(timeoutMs = 8000): Promise<UpdateCheck> {
  const current = currentVersionCode();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(VERSION_URL, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

    const raw = (await response.json()) as Partial<RemoteVersion>;
    const versionCode = Number(raw.versionCode ?? 0);
    if (!Number.isFinite(versionCode) || versionCode <= 0) {
      throw new Error('version.json was missing a build number');
    }

    const remote: RemoteVersion = {
      version: String(raw.version ?? ''),
      versionCode,
      apkUrl: raw.apkUrl || APK_URL,
      installUrl: raw.installUrl || INSTALL_URL,
      notes: raw.notes,
      publishedAt: raw.publishedAt,
    };

    return { update: versionCode > current ? remote : null, current, error: null };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'The update check timed out'
        : error instanceof Error
          ? error.message
          : String(error);
    return { update: null, current, error: message };
  } finally {
    clearTimeout(timer);
  }
}

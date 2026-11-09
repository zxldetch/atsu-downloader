/**
 * The update check is the only thing standing between a sideloaded build and
 * silently going stale, so its comparison and failure modes are pinned here.
 */

import { checkForUpdate, currentVersionCode } from '../updates';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0', android: { versionCode: 41 } } },
}));

describe('update check', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reads the build number stamped into the app config', () => {
    expect(currentVersionCode()).toBe(41);
  });

  it('offers a newer build', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.0.0', versionCode: 42, apkUrl: 'https://example/apk' }),
    }) as unknown as typeof fetch;

    const result = await checkForUpdate();
    expect(result.error).toBeNull();
    expect(result.current).toBe(41);
    expect(result.update?.versionCode).toBe(42);
    expect(result.update?.apkUrl).toBe('https://example/apk');
  });

  it('stays quiet when the installed build is current or newer', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: '1.0.0', versionCode: 41 }),
    }) as unknown as typeof fetch;

    const result = await checkForUpdate();
    expect(result.update).toBeNull();
    expect(result.error).toBeNull();
  });

  it('reports failures instead of pretending there is no update', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const result = await checkForUpdate();
    expect(result.update).toBeNull();
    expect(result.error).toContain('503');
  });
});

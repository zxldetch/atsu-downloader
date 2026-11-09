import { StyleSheet } from 'react-native';
import type { ImageStyle, TextStyle, ViewStyle } from 'react-native';

/**
 * Three themes, all built from the same token names:
 *
 * - `normal` — the atsu.moe "Midnight" palette, sampled pixel by pixel from the
 *   app itself: near-black #0D0E12, cards #191A1E, violet #7569BF.
 * - `dark`   — true-black OLED variant of the same design; saves power and
 *   removes the blue cast from the surface.
 * - `light`  — daylight variant; keeps the violet accent and every layout rule,
 *   only the surface/text tokens flip.
 *
 * StyleSheets are produced lazily per theme by `makeStyles`, so switching theme
 * never needs a second code path anywhere in the app.
 */

export type ThemeName = 'normal' | 'dark' | 'light';

export interface Palette {
  bg: string;
  card: string;
  input: string;
  inputStrong: string;
  sunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentDim: string;
  accentSoft: string;
  accentLine: string;
  accentText: string;
  gold: string;
  goldText: string;
  blue: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  errorSoft: string;
  onAccent: string;
  overlay: string;
  /** Drives StatusBar and the native splash. */
  scheme: 'dark' | 'light';
}

export const palettes: Record<ThemeName, Palette> = {
  normal: {
    bg: '#0D0E12',
    card: '#191A1E',
    input: '#22242A',
    inputStrong: '#2A2C33',
    sunken: '#08080A',
    border: '#26272C',
    borderStrong: '#33353C',
    text: '#FFFFFF',
    textDim: '#B5B8BD',
    textFaint: '#8A8D93',
    accent: '#7569BF',
    accentDim: '#6357A8',
    accentSoft: 'rgba(117, 105, 191, 0.22)',
    accentLine: 'rgba(117, 105, 191, 0.52)',
    accentText: '#B3A9EC',
    gold: '#806000',
    goldText: '#F3D27A',
    blue: '#038DFC',
    success: '#4FBF87',
    successSoft: 'rgba(79, 191, 135, 0.16)',
    warning: '#D9A441',
    warningSoft: 'rgba(217, 164, 65, 0.16)',
    error: '#E05A5F',
    errorSoft: 'rgba(224, 90, 95, 0.16)',
    onAccent: '#FFFFFF',
    overlay: 'rgba(6, 6, 8, 0.92)',
    scheme: 'dark',
  },
  dark: {
    bg: '#000000',
    card: '#101114',
    input: '#17181C',
    inputStrong: '#202127',
    sunken: '#000000',
    border: '#1C1D22',
    borderStrong: '#2A2C33',
    text: '#FFFFFF',
    textDim: '#A9ADB4',
    textFaint: '#7B7F86',
    // A little brighter than Midnight: pure black gives less ambient contrast.
    accent: '#8A7CF0',
    accentDim: '#7164CC',
    accentSoft: 'rgba(138, 124, 240, 0.22)',
    accentLine: 'rgba(138, 124, 240, 0.50)',
    accentText: '#C0B7FF',
    gold: '#7A5E00',
    goldText: '#F5D98A',
    blue: '#1E9BFF',
    success: '#57CF96',
    successSoft: 'rgba(87, 207, 150, 0.16)',
    warning: '#E3AE4C',
    warningSoft: 'rgba(227, 174, 76, 0.16)',
    error: '#F06A6F',
    errorSoft: 'rgba(240, 106, 111, 0.16)',
    onAccent: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.94)',
    scheme: 'dark',
  },
  light: {
    bg: '#F4F4F7',
    card: '#FFFFFF',
    input: '#ECECF1',
    inputStrong: '#E1E1E8',
    sunken: '#E7E7EE',
    border: '#E2E2E8',
    borderStrong: '#CFCFD8',
    text: '#111214',
    textDim: '#55585E',
    textFaint: '#7E8288',
    accent: '#5B4DB8',
    accentDim: '#4C40A0',
    accentSoft: 'rgba(91, 77, 184, 0.12)',
    accentLine: 'rgba(91, 77, 184, 0.40)',
    accentText: '#52459F',
    gold: '#F4E2AC',
    goldText: '#6B5200',
    blue: '#0070D9',
    success: '#1F9D62',
    successSoft: 'rgba(31, 157, 98, 0.12)',
    warning: '#A96F06',
    warningSoft: 'rgba(169, 111, 6, 0.12)',
    error: '#C8383D',
    errorSoft: 'rgba(200, 56, 61, 0.10)',
    onAccent: '#FFFFFF',
    overlay: 'rgba(250, 250, 252, 0.94)',
    scheme: 'light',
  },
};

export const THEME_OPTIONS: { key: ThemeName; label: string; hint: string }[] = [
  { key: 'normal', label: 'Normal', hint: 'atsu.moe Midnight' },
  { key: 'dark', label: 'Dark', hint: 'True-black OLED' },
  { key: 'light', label: 'Light', hint: 'Daylight' },
];

let activeTheme: ThemeName = 'normal';

export const getThemeName = (): ThemeName => activeTheme;
export const getPalette = (name: ThemeName = activeTheme): Palette => palettes[name];

/**
 * Point the whole app at a palette. Called from the root before the tree
 * renders; every `colors.*` read and every lazily built StyleSheet follows it.
 */
export function setThemeName(name: ThemeName): void {
  activeTheme = name;
}

/**
 * Every module reads `colors.someToken` (also inside StyleSheet definitions), so
 * a proxy is enough to make the palette swappable without touching call sites.
 */
export const colors: Palette = new Proxy({} as Palette, {
  get: (_target, key: string) => (palettes[activeTheme] as unknown as Record<string, unknown>)[key],
  has: (_target, key: string) => key in palettes[activeTheme],
  ownKeys: () => Reflect.ownKeys(palettes[activeTheme]),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/**
 * Replacement for `StyleSheet.create` that resolves against the active theme and
 * caches one sheet per theme, so a theme switch rebuilds styles lazily instead of
 * at import time (when the palette is still the default).
 */
type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends NamedStyles<T> | NamedStyles<any>>(
  factory: (palette: Palette) => T,
): T {
  const cache = new Map<ThemeName, T>();

  const sheetFor = (name: ThemeName): T => {
    const cached = cache.get(name);
    if (cached) return cached;
    const built = StyleSheet.create(factory(palettes[name])) as unknown as T;
    cache.set(name, built);
    return built;
  };

  return new Proxy({} as T, {
    get: (_target, key: string) => (sheetFor(activeTheme) as Record<string, unknown>)[key],
    has: (_target, key: string) => key in sheetFor(activeTheme),
    ownKeys: () => Reflect.ownKeys(sheetFor(activeTheme) as object),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  xs: 5,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const type = {
  /** Wordmark / boot mark. */
  brand: { fontSize: 22, fontWeight: '800' as const, letterSpacing: 0.6 },
  display: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 21, fontWeight: '700' as const, letterSpacing: -0.3 },
  /** Section headers: atsu sets these large and near-white ("Continue Reading ›"). */
  section: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  subtitle: { fontSize: 15, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  small: { fontSize: 12, fontWeight: '500' as const },
  tiny: { fontSize: 11, fontWeight: '600' as const },
  mono: { fontSize: 12, fontVariant: ['tabular-nums'] as const },
} as const;

/** Cover aspect ratio shared by every artwork tile (atsu uses ~2:3). */
export const coverAspect = 0.69;

/**
 * Kept for the few surfaces that still want lift (modals, the boot screen).
 * List rows deliberately do not use it.
 */
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

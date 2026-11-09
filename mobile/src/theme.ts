export const colors = {
  /**
   * Sampled from atsu.moe itself rather than eyeballed: the page is a mid-dark
   * neutral (#1D1F20, the single most common pixel on the site), cards sit one
   * step above it, and the only saturated colour is the violet of the "Install"
   * button. That is why this build reads much closer to the site than the
   * earlier near-black GitHub palette.
   */
  bg: '#1D1F20',
  /** Cards, rows, the tab bar — measured #212325. */
  card: '#212325',
  /** Chips, inputs, recessed-but-tappable surfaces. */
  input: '#2A2C2E',
  /** Pressed states, cover placeholders, progress tracks. */
  inputStrong: '#303234',
  border: '#2F3133',
  borderStrong: '#3C3F42',
  text: '#F7F7F8',
  textDim: '#A6A9AB',
  textFaint: '#7C7F81',
  /** The atsu violet (#7667C2 on the site's primary button). */
  accent: '#7667C2',
  accentDim: '#6558A8',
  accentSoft: 'rgba(118, 103, 194, 0.20)',
  accentLine: 'rgba(118, 103, 194, 0.48)',
  /** A lighter tint for small text on dark, where #7667C2 loses contrast. */
  accentText: '#A196E0',
  success: '#57B87E',
  successSoft: 'rgba(87, 184, 126, 0.16)',
  warning: '#D9A441',
  warningSoft: 'rgba(217, 164, 65, 0.16)',
  error: '#E05A5F',
  errorSoft: 'rgba(224, 90, 95, 0.16)',
  onAccent: '#FFFFFF',
  overlay: 'rgba(20, 22, 23, 0.86)',
} as const;

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
  brand: { fontSize: 18, fontWeight: '800' as const, letterSpacing: 2.4 },
  display: { fontSize: 27, fontWeight: '800' as const, letterSpacing: -0.4 },
  title: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2 },
  /** Section headers, atsu-style sentence case. */
  section: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.1 },
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

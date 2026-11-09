/**
 * Design tokens.
 *
 * The palette follows atsu.moe itself: a near-black page, cards barely lifted
 * off it, a single violet accent, and type that leans on weight and spacing
 * instead of borders and shadows. Flat surfaces matter for more than looks —
 * on Android every `elevation` on a list row costs a render pass, which is the
 * main reason the first build scrolled badly.
 */

export const colors = {
  /** Page background — atsu's near-black, not pure #000 (it smears on OLED scroll). */
  bg: '#0A0A0B',
  /** Cards, rows, the tab bar. */
  card: '#141416',
  /** Inputs, chips, anything that must read as "recessed but tappable". */
  input: '#1E1E22',
  /** Hover/pressed surface and cover placeholders. */
  inputStrong: '#26262C',
  border: '#232329',
  borderStrong: '#32323A',
  text: '#F4F4F6',
  textDim: '#9A9AA4',
  textFaint: '#6B6B76',
  /** atsu's violet. */
  accent: '#7C5CFA',
  accentDim: '#6544E0',
  accentSoft: 'rgba(124, 92, 250, 0.16)',
  accentLine: 'rgba(124, 92, 250, 0.42)',
  success: '#3ED17D',
  successSoft: 'rgba(62, 209, 125, 0.14)',
  warning: '#E8B14A',
  warningSoft: 'rgba(232, 177, 74, 0.14)',
  error: '#F2555A',
  errorSoft: 'rgba(242, 85, 90, 0.14)',
  onAccent: '#FFFFFF',
  overlay: 'rgba(4, 4, 6, 0.78)',
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
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
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

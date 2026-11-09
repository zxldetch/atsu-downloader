export const colors = {
  /**
   * Sampled pixel-for-pixel from the atsu.moe app itself (the dark "Midnight"
   * theme): the base surface is #0D0E12, cards and rows lift to #191A1E, deeper
   * wells sit at #08080A, and the accent is the violet of its Continue button,
   * #7569BF. Text is plain white with a blue-grey secondary (#B5B8BD).
   */
  bg: '#0D0E12',
  /** Cards, rows, pills. */
  card: '#191A1E',
  /** Inputs and anything that must read as recessed. */
  input: '#22242A',
  /** Pressed states, progress tracks, cover placeholders. */
  inputStrong: '#2A2C33',
  /** Deeper wells: segmented-control containers, the tab bar. */
  sunken: '#08080A',
  border: '#26272C',
  borderStrong: '#33353C',
  text: '#FFFFFF',
  textDim: '#B5B8BD',
  textFaint: '#8A8D93',
  /** atsu's Continue violet. */
  accent: '#7569BF',
  accentDim: '#6357A8',
  accentSoft: 'rgba(117, 105, 191, 0.22)',
  accentLine: 'rgba(117, 105, 191, 0.52)',
  /** Lighter violet for small text on black. */
  accentText: '#B3A9EC',
  /** The bookmark-card badge colours the app uses. */
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

/**
 * Design tokens, ported from the desktop app's gui/theme.py palette so the
 * mobile build feels like the same product.
 */

export const colors = {
  bg: '#0d1117',
  card: '#161b22',
  input: '#21262d',
  border: '#30363d',
  borderStrong: '#3d444d',
  text: '#f0f6fc',
  textDim: '#8b949e',
  textFaint: '#6e7681',
  accent: '#58a6ff',
  accentDim: '#1f6feb',
  success: '#3fb950',
  error: '#f85149',
  warning: '#d29922',
  onAccent: '#ffffff',
  overlay: 'rgba(1, 4, 9, 0.72)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 26, fontWeight: '800' as const, letterSpacing: 1.5 },
  title: { fontSize: 20, fontWeight: '700' as const },
  subtitle: { fontSize: 15, fontWeight: '600' as const },
  body: { fontSize: 14, fontWeight: '400' as const },
  small: { fontSize: 12, fontWeight: '500' as const },
  mono: { fontSize: 12, fontVariant: ['tabular-nums'] as const },
};

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
};

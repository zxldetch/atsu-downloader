/** Small, dependency-free UI kit shared by every screen. */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, radius, shadow, spacing, type } from '../theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'sm';

export function Button({
  label,
  onPress,
  variant = 'secondary',
  size = 'md',
  disabled,
  loading,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.accentDim, fg: '#fff', border: colors.accent },
    secondary: { bg: colors.input, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.textDim, border: 'transparent' },
    danger: { bg: 'rgba(248, 81, 73, 0.12)', fg: colors.error, border: 'rgba(248, 81, 73, 0.4)' },
  };
  const tone = palette[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive }}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        {
          backgroundColor: tone.bg,
          borderColor: tone.border,
          opacity: inactive ? 0.45 : pressed ? 0.78 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.fg} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            size === 'sm' && styles.buttonLabelSm,
            { color: tone.fg },
          ]}
          numberOfLines={1}
        >
          {icon ? `${icon}  ${label}` : label}
        </Text>
      )}
    </Pressable>
  );
}

export function IconButton({
  glyph,
  onPress,
  badge,
  accessibilityLabel,
}: {
  glyph: string;
  onPress?: () => void;
  badge?: number;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.iconGlyph}>{glyph}</Text>
      {badge && badge > 0 ? (
        <View style={styles.iconBadge}>
          <Text style={styles.iconBadgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && { borderColor: colors.borderStrong }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ProgressBar({
  value,
  total,
  color = colors.accent,
  height = 6,
}: {
  value: number;
  total: number;
  color?: string;
  height?: number;
}) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  return (
    <View style={[styles.progressTrack, { height }]}>
      <View
        style={{
          width: `${ratio * 100}%`,
          height,
          backgroundColor: color,
          borderRadius: height,
        }}
      />
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  tone = 'default',
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'success' | 'warning' | 'error' | 'accent';
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    default: { bg: colors.input, fg: colors.textDim },
    accent: { bg: 'rgba(88, 166, 255, 0.14)', fg: colors.accent },
    success: { bg: 'rgba(63, 185, 80, 0.14)', fg: colors.success },
    warning: { bg: 'rgba(210, 153, 34, 0.16)', fg: colors.warning },
    error: { bg: 'rgba(248, 81, 73, 0.14)', fg: colors.error },
  };
  const palette = active ? { bg: 'rgba(88, 166, 255, 0.18)', fg: colors.accent } : tones[tone];

  const content = (
    <Text style={[styles.chipText, { color: palette.fg }]} numberOfLines={1}>
      {label}
    </Text>
  );

  if (!onPress) {
    return (
      <View style={[styles.chip, { backgroundColor: palette.bg }]}>{content}</View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: palette.bg,
          borderColor: active ? colors.accent : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {content}
    </Pressable>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionActionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyGlyph}>◍</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action ? <Button label={action} onPress={onAction} size="sm" style={{ marginTop: 14 }} /> : null}
    </View>
  );
}

export function Field({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function TextField({
  value,
  onChangeText,
  placeholder,
  onSubmit,
  autoCapitalize = 'none',
  keyboardType,
  style,
  editable = true,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoCapitalize?: 'none' | 'sentences';
  keyboardType?: 'default' | 'number-pad' | 'url';
  style?: StyleProp<TextStyle>;
  editable?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      onSubmitEditing={onSubmit}
      returnKeyType="go"
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      keyboardType={keyboardType}
      editable={editable}
      style={[styles.textField, style]}
    />
  );
}

export function Stepper({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return (
    <View style={styles.stepperRow}>
      <View style={{ flex: 1, paddingRight: spacing.md }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => onChange(clamp(value - step))}
          disabled={value <= min}
          style={({ pressed }) => [
            styles.stepperButton,
            { opacity: value <= min ? 0.35 : pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={styles.stepperGlyph}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{format ? format(value) : value}</Text>
        <Pressable
          onPress={() => onChange(clamp(value + step))}
          disabled={value >= max}
          style={({ pressed }) => [
            styles.stepperButton,
            { opacity: value >= max ? 0.35 : pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={styles.stepperGlyph}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={styles.stepperRow}
    >
      <View style={{ flex: 1, paddingRight: spacing.md }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.toggleTrack, value && { backgroundColor: colors.accentDim, borderColor: colors.accent }]}>
        <View style={[styles.toggleThumb, value ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]} />
      </View>
    </Pressable>
  );
}

export function Banner({
  tone = 'error',
  children,
  onDismiss,
}: {
  tone?: 'error' | 'info' | 'warning';
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const tones = {
    error: { bg: 'rgba(248, 81, 73, 0.12)', border: 'rgba(248, 81, 73, 0.45)', fg: colors.error },
    info: { bg: 'rgba(88, 166, 255, 0.1)', border: 'rgba(88, 166, 255, 0.35)', fg: colors.accent },
    warning: { bg: 'rgba(210, 153, 34, 0.12)', border: 'rgba(210, 153, 34, 0.4)', fg: colors.warning },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: tones.bg, borderColor: tones.border }]}>
      <Text style={[styles.bannerText, { color: tones.fg }]}>{children}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Text style={{ color: tones.fg, fontSize: 16 }}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonSm: { height: 34, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  buttonLabel: { ...type.subtitle, letterSpacing: 0.2 },
  buttonLabelSm: { ...type.small, fontWeight: '600' },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconGlyph: { color: colors.text, fontSize: 17 },
  iconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.bg,
  },
  iconBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  progressTrack: {
    backgroundColor: colors.input,
    borderRadius: radius.pill,
    overflow: 'hidden',
    width: '100%',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    maxWidth: 220,
  },
  chipText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...type.small,
    color: colors.textDim,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  sectionActionText: { ...type.small, color: colors.accent, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyGlyph: { fontSize: 34, color: colors.borderStrong, marginBottom: spacing.md },
  emptyTitle: { ...type.subtitle, color: colors.text, marginBottom: spacing.xs },
  emptyBody: {
    ...type.body,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  field: { marginBottom: spacing.lg },
  fieldLabel: { ...type.body, color: colors.text, fontWeight: '600', marginBottom: 4 },
  fieldHint: { ...type.small, color: colors.textFaint, lineHeight: 16 },
  textField: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 14,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: { color: colors.text, fontSize: 18, lineHeight: 20 },
  stepperValue: {
    ...type.body,
    color: colors.text,
    minWidth: 44,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  toggleTrack: {
    width: 50,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.text,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  bannerText: { ...type.body, flex: 1, lineHeight: 19 },
});

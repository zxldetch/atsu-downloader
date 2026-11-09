/**
 * The UI kit: every screen is built from these pieces.
 *
 * Style rules that come from atsu.moe: flat surfaces, no drop shadows, a single
 * violet accent, sentence-case section headers, and generous 16pt gutters.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useReducedMotion } from '../lib/motion';
import { colors, radius, spacing, type, makeStyles } from '../theme';
import { Icon, type IconName } from './icons';

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
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const palette: Record<ButtonVariant, { bg: string; fg: string }> = {
    primary: { bg: colors.accent, fg: colors.onAccent },
    secondary: { bg: colors.input, fg: colors.text },
    ghost: { bg: 'transparent', fg: colors.textDim },
    danger: { bg: colors.errorSoft, fg: colors.error },
  };
  const tone = palette[variant];
  const inactive = disabled || loading;
  const small = size === 'sm';

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSm,
        { backgroundColor: tone.bg, opacity: inactive ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Icon name={icon} size={small ? 15 : 17} color={tone.fg} /> : null}
          <Text
            numberOfLines={1}
            style={[small ? styles.buttonLabelSm : styles.buttonLabel, { color: tone.fg }]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  badge,
  accessibilityLabel,
  variant = 'plain',
  size = 20,
}: {
  name: IconName;
  onPress?: () => void;
  badge?: number;
  accessibilityLabel: string;
  variant?: 'plain' | 'filled';
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      style={({ pressed }) => [
        styles.iconButton,
        variant === 'filled' && styles.iconButtonFilled,
        { opacity: pressed ? 0.55 : 1 },
      ]}
    >
      <Icon name={name} size={size} color={colors.text} />
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
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
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
  height = 3,
}: {
  value: number;
  total: number;
  color?: string;
  height?: number;
}) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
  const reducedMotion = useReducedMotion();
  const animated = useRef(new Animated.Value(ratio)).current;

  useEffect(() => {
    if (reducedMotion) {
      animated.setValue(ratio);
      return;
    }
    Animated.timing(animated, {
      toValue: ratio,
      duration: 320,
      useNativeDriver: false,
    }).start();
  }, [animated, ratio, reducedMotion]);

  return (
    <View style={[styles.progressTrack, { height, borderRadius: height }]}>
      <Animated.View
        style={{
          width: animated.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
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
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'success' | 'warning' | 'error' | 'accent';
  icon?: IconName;
}) {
  const tones: Record<string, { bg: string; fg: string }> = {
    default: { bg: colors.input, fg: colors.textDim },
    accent: { bg: colors.accentSoft, fg: colors.accentText },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    error: { bg: colors.errorSoft, fg: colors.error },
  };
  const palette = active ? { bg: colors.accent, fg: colors.onAccent } : tones[tone];

  const content = (
    <View style={styles.chipInner}>
      {icon ? <Icon name={icon} size={12} color={palette.fg} /> : null}
      <Text style={[styles.chipText, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) {
    return <View style={[styles.chip, { backgroundColor: palette.bg }]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: palette.bg, opacity: pressed ? 0.72 : 1 },
      ]}
    >
      {content}
    </Pressable>
  );
}

/** atsu-style section header: sentence case, optional violet action. */
export function SectionHeader({
  title,
  subtitle,
  action,
  onAction,
  style,
}: {
  title: string;
  /** One line under the title, e.g. "2 series · 1 chapter offline". */
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionTitleColumn}>
        <Pressable
          onPress={onAction ?? undefined}
          disabled={!onAction}
          hitSlop={8}
          style={styles.sectionTitleRow}
          accessibilityRole={onAction ? 'button' : undefined}
        >
          <Text style={styles.sectionHeaderText} accessibilityRole="header">
            {title}
          </Text>
          {onAction ? <Icon name="chevron-forward" size={19} color={colors.textDim} /> : null}
        </Pressable>
        {subtitle ? (
          <Text style={styles.sectionSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon = 'book-outline',
  title,
  body,
  action,
  onAction,
}: {
  icon?: IconName;
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={26} color={colors.textFaint} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action ? (
        <Button
          label={action}
          onPress={onAction}
          size="sm"
          variant="primary"
          style={{ marginTop: spacing.lg }}
        />
      ) : null}
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
  icon,
  autoFocus,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoCapitalize?: 'none' | 'sentences';
  keyboardType?: 'default' | 'number-pad' | 'url';
  style?: StyleProp<TextStyle>;
  editable?: boolean;
  icon?: IconName;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.textFieldWrap}>
      {icon ? (
        <View style={styles.textFieldIcon}>
          <Icon name={icon} size={17} color={colors.textFaint} />
        </View>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        onSubmitEditing={onSubmit}
        returnKeyType="go"
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoFocus={autoFocus}
        keyboardType={keyboardType}
        editable={editable}
        selectionColor={colors.accent}
        style={[styles.textField, icon ? styles.textFieldWithIcon : null, style]}
      />
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { key: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const index = Math.max(0, options.findIndex((option) => option.key === value));
  const [width, setWidth] = useState(0);
  const reducedMotion = useReducedMotion();
  const slide = useRef(new Animated.Value(0)).current;
  const previous = useRef(index);

  // The selection is one rectangle that slides, rather than a background that
  // blinks on and off per option.
  useEffect(() => {
    if (previous.current === index) return;
    previous.current = index;
    if (reducedMotion) {
      slide.setValue(index);
      return;
    }
    Animated.spring(slide, {
      toValue: index,
      useNativeDriver: true,
      stiffness: 320,
      damping: 32,
      mass: 0.7,
    }).start();
  }, [index, reducedMotion, slide]);

  useEffect(() => {
    slide.setValue(index);
    // Only on mount / layout: re-running on every index change would cancel the
    // spring above by snapping first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const padding = 4;
  const gap = 2;
  const slot = width > 0 ? (width - padding * 2 - gap * (options.length - 1)) / options.length : 0;

  return (
    <View
      style={[styles.segmented, style]}
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {slot > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segmentPill,
            {
              width: slot,
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: options.map((_, i) => i),
                    outputRange: options.map((_, i) => padding + i * (slot + gap)),
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}

      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={styles.segment}
          >
            {option.icon ? (
              <Icon
                name={option.icon}
                size={14}
                color={active ? colors.text : colors.textDim}
              />
            ) : null}
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
    <View style={styles.settingRow}>
      <View style={styles.settingText}>
        <Text style={styles.settingLabel}>{label}</Text>
        {hint ? <Text style={styles.settingHint}>{hint}</Text> : null}
      </View>
      <View style={styles.stepperControls}>
        <Pressable
          onPress={() => onChange(clamp(value - step))}
          disabled={value <= min}
          hitSlop={4}
          accessibilityLabel={`Decrease ${label}`}
          style={({ pressed }) => [
            styles.stepperButton,
            { opacity: value <= min ? 0.3 : pressed ? 0.6 : 1 },
          ]}
        >
          <Icon name="remove" size={16} color={colors.text} />
        </Pressable>
        <Text style={styles.stepperValue}>{format ? format(value) : value}</Text>
        <Pressable
          onPress={() => onChange(clamp(value + step))}
          disabled={value >= max}
          hitSlop={4}
          accessibilityLabel={`Increase ${label}`}
          style={({ pressed }) => [
            styles.stepperButton,
            { opacity: value >= max ? 0.3 : pressed ? 0.6 : 1 },
          ]}
        >
          <Icon name="add" size={16} color={colors.text} />
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
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      style={styles.settingRow}
    >
      <View style={styles.settingText}>
        <Text style={styles.settingLabel}>{label}</Text>
        {hint ? <Text style={styles.settingHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
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
    error: { bg: colors.errorSoft, fg: colors.error },
    info: { bg: colors.accentSoft, fg: colors.accent },
    warning: { bg: colors.warningSoft, fg: colors.warning },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: tones.bg }]}>
      <Text style={[styles.bannerText, { color: tones.fg }]}>{children}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} hitSlop={10} accessibilityLabel="Dismiss">
          <Icon name="close" size={15} color={tones.fg} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: IconName;
}) {
  return (
    <View style={styles.statTile}>
      <Icon name={icon} size={16} color={colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = makeStyles((colors) => ({
  button: {
    height: 50,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSm: { height: 34, paddingHorizontal: spacing.lg, borderRadius: radius.pill },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  buttonLabel: { ...type.subtitle, letterSpacing: 0.1 },
  buttonLabelSm: { ...type.small, fontWeight: '600' },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonFilled: { backgroundColor: colors.input },
  iconBadge: {
    position: 'absolute',
    top: 1,
    right: 0,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  iconBadgeText: { color: colors.onAccent, fontSize: 9, fontWeight: '800' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardPressed: { backgroundColor: colors.input },
  progressTrack: {
    backgroundColor: colors.inputStrong,
    overflow: 'hidden',
    width: '100%',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.sm,
    maxWidth: 260,
    backgroundColor: colors.card,
  },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontSize: 14, fontWeight: '600', letterSpacing: 0 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  sectionTitleColumn: { flex: 1 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  /** Tucked under the heading, so the shelf summary belongs to it. */
  sectionSubtitle: {
    ...type.small,
    color: colors.textDim,
    fontWeight: '500',
    fontSize: 12.5,
    marginTop: 2,
  },
  sectionHeaderText: { ...type.section, color: colors.text },
  sectionAction: { ...type.small, color: colors.accentText, fontWeight: '600' },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: { ...type.subtitle, color: colors.text, marginBottom: 6 },
  emptyBody: { ...type.body, color: colors.textDim, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  field: { marginBottom: spacing.lg },
  fieldLabel: { ...type.body, color: colors.text, fontWeight: '600', marginBottom: 6 },
  fieldHint: { ...type.small, color: colors.textFaint, lineHeight: 17 },
  textFieldWrap: { position: 'relative', justifyContent: 'center' },
  textFieldIcon: { position: 'absolute', left: 14, zIndex: 1 },
  textField: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontSize: 14,
  },
  textFieldWithIcon: { paddingLeft: 40 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.sunken,
    borderRadius: radius.md,
    padding: 4,
    gap: 2,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: radius.sm,
  },
  segmentPill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
  },
  segmentText: { ...type.small, color: colors.textDim, fontWeight: '600' },
  segmentTextActive: { color: colors.text },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    minHeight: 56,
  },
  settingText: { flex: 1, paddingRight: spacing.md },
  settingLabel: { ...type.body, color: colors.text, fontWeight: '600' },
  settingHint: { ...type.small, color: colors.textFaint, lineHeight: 16, marginTop: 2 },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    ...type.body,
    color: colors.text,
    minWidth: 34,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  toggleTrack: {
    width: 46,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.inputStrong,
    padding: 3,
    justifyContent: 'center',
  },
  toggleTrackOn: { backgroundColor: colors.accent },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.text,
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  bannerText: { ...type.small, flex: 1, lineHeight: 18, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  statTile: {
    flex: 1,
    minWidth: 78,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    gap: 3,
  },
  statValue: { ...type.title, color: colors.text, fontSize: 17 },
  statLabel: { ...type.tiny, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: 0.6, fontSize: 10 },
}));

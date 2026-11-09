/**
 * The reader's settings sheet.
 *
 * Modelled on atsu's "Graphics" sheet: a bottom panel with a grab handle, a
 * titled header, uppercase label + value rows, the shared violet slider, and
 * iOS-style switches. Everything here is a live setting — no confirm button.
 */

import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './icons';
import { Slider } from './Slider';
import { Toggle } from './ui';
import { makeStyles, radius, spacing, type } from '../theme';

export function ReaderSheet({
  open,
  onClose,
  mode,
  onMode,
  autoAdvance,
  onAutoAdvance,
  autoScroll,
  onAutoScroll,
  speed,
  onSpeed,
  keepAwake,
  onKeepAwake,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'vertical' | 'paged';
  onMode: (mode: 'vertical' | 'paged') => void;
  autoAdvance: boolean;
  onAutoAdvance: (value: boolean) => void;
  autoScroll: boolean;
  onAutoScroll: (value: boolean) => void;
  speed: number;
  onSpeed: (value: number) => void;
  keepAwake: boolean;
  onKeepAwake: (value: boolean) => void;
  onReset: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close reader settings" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.roundButton}
          >
            <Icon name="chevron-back" size={20} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            Reader
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.roundButton}
          >
            <Icon name="close" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          <Text style={styles.sectionLabel}>LAYOUT</Text>
          <View style={styles.modeRow}>
            {(['vertical', 'paged'] as const).map((option) => {
              const active = mode === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => onMode(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={option === 'vertical' ? 'Vertical strip' : 'Paged'}
                  style={[styles.modePill, active && styles.modePillOn]}
                >
                  <Icon
                    name={option === 'vertical' ? 'reorder-four-outline' : 'copy-outline'}
                    size={16}
                    color={active ? '#FFFFFF' : '#9BA0A8'}
                  />
                  <Text style={[styles.modeText, active && styles.modeTextOn]}>
                    {option === 'vertical' ? 'Vertical' : 'Paged'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.divider} />

          <Toggle
            label="Infinite mode"
            hint="Next/previous roll into the neighbouring chapter, and the strip loads it at the end."
            value={autoAdvance}
            onChange={onAutoAdvance}
          />
          <Toggle
            label="Auto-scroll"
            hint="Glide down the page hands-free. Touching the page pauses it briefly."
            value={autoScroll}
            onChange={onAutoScroll}
          />

          <Slider
            value={(speed - 1) / 9}
            steps={10}
            onChange={(value) => onSpeed(1 + Math.round(value * 9))}
            label="SCROLL SPEED"
            valueLabel={`${speed}`}
            disabled={!autoScroll}
            style={{ marginTop: spacing.lg }}
          />

          <View style={styles.divider} />

          <Toggle
            label="Keep screen awake"
            hint="Stops the screen sleeping while a chapter is open."
            value={keepAwake}
            onChange={onKeepAwake}
          />

          <Pressable
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel="Reset reader settings"
            style={styles.resetRow}
          >
            <Icon name="refresh" size={16} color="#9BA0A8" />
            <Text style={styles.resetText}>Reset reader settings</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = makeStyles(() => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: '#08080A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '82%',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3C42',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: '#17181C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.display, color: '#FFFFFF', fontSize: 24 },
  sectionLabel: {
    ...type.tiny,
    color: '#8A8D93',
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modePill: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: '#141519',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modePillOn: { backgroundColor: '#2A2440' },
  modeText: { ...type.small, color: '#9BA0A8', fontWeight: '600' },
  modeTextOn: { color: '#FFFFFF' },
  divider: { height: 1, backgroundColor: '#1C1D22', marginVertical: spacing.lg },
  resetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.lg,
  },
  resetText: { ...type.small, color: '#9BA0A8', fontWeight: '600' },
}));

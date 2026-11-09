/**
 * The opening animation.
 *
 * It mirrors the app icon: the wordmark rises and fades in over the same
 * near-black field the native splash uses, a violet dot pulses, and a hairline
 * bar fills while the store rehydrates. When there is nothing left to wait for,
 * the whole overlay fades away and unmounts itself.
 *
 * Everything respects Reduce Motion: with motion off the mark is simply shown
 * until hydration finishes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useReducedMotion } from '../lib/motion';
import { colors, makeStyles, spacing, type } from '../theme';

export function BootSplash({ ready, onDone }: { ready: boolean; onDone?: () => void }) {
  const reducedMotion = useReducedMotion();
  const [gone, setGone] = useState(false);

  const enter = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  // Entrance: fade + rise + a short pulse on the violet dot.
  useEffect(() => {
    if (reducedMotion) {
      enter.setValue(1);
      fill.setValue(1);
      return;
    }

    const intro = Animated.parallel([
      Animated.timing(enter, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fill, {
        toValue: 0.82,
        duration: 1100,
        easing: Easing.out(Easing.quad),
        // The bar animates width, which the native driver cannot do.
        useNativeDriver: false,
      }),
    ]);
    intro.start();

    const beat = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.45,
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 620,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    beat.start();

    return () => {
      intro.stop();
      beat.stop();
    };
  }, [enter, fill, pulse, reducedMotion]);

  // Finish: top the bar up, then fade the overlay out once the store is ready.
  useEffect(() => {
    if (!ready) return;

    if (reducedMotion) {
      setGone(true);
      onDone?.();
      return;
    }

    Animated.sequence([
      Animated.timing(fill, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.delay(120),
      Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setGone(true);
      onDone?.();
    });
  }, [fade, fill, onDone, ready, reducedMotion]);

  const markStyle = useMemo(
    () => ({
      opacity: enter,
      transform: [
        {
          translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
        },
        {
          scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
        },
      ],
    }),
    [enter],
  );

  if (gone) return null;

  return (
    <Animated.View
      style={[styles.root, { opacity: fade }]}
      accessibilityLabel="Atsu Offline is starting"
      accessibilityLiveRegion="polite"
      testID="boot-splash"
    >
      <Animated.View style={[styles.markRow, markStyle]}>
        <Text style={styles.mark}>ATSU</Text>
        <Animated.View style={[styles.dot, { transform: [{ scale: pulse }] }]} />
      </Animated.View>

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityLabel="Loading your shelf"
      >
        <Animated.View style={[styles.bar, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>

      <Text style={styles.caption}>
        {ready ? 'Ready' : 'Restoring your shelf…'}
      </Text>
    </Animated.View>
  );
}

const styles = makeStyles((colors) => ({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  markRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  mark: { ...type.brand, color: colors.text, fontSize: 30, letterSpacing: 6 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: 10,
  },
  track: {
    width: 132,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.input,
    overflow: 'hidden',
  },
  bar: { height: 2, borderRadius: 1, backgroundColor: colors.accent },
  caption: { ...type.small, color: colors.textFaint, fontWeight: '500' },
}));

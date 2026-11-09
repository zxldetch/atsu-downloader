/**
 * The atsu slider, rebuilt in React Native.
 *
 * Reference (atsu's own reader): a full-width rounded track, a violet fill, a
 * thin white bar as the thumb and a small violet dot at the far end. It is the
 * same widget their Graphics sheet and page scrubber use, so it lives here once
 * and both screens render it.
 *
 * Dragging is exact: the thumb tracks the finger, the value snaps to `steps`
 * when given, and VoiceOver/TalkBack can move it with the adjustable action.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { makeStyles, radius, type } from '../theme';

const TRACK_HEIGHT = 40;
const THUMB_WIDTH = 3;
const THUMB_HEIGHT = 26;

export function Slider({
  value,
  onChange,
  onSlideStart,
  onSlideEnd,
  steps,
  label,
  valueLabel,
  disabled,
  style,
}: {
  /** 0..1 */
  value: number;
  onChange: (value: number) => void;
  onSlideStart?: () => void;
  onSlideEnd?: () => void;
  /** Snap to this many discrete positions (1 → free). */
  steps?: number;
  label?: string;
  /** Rendered above the thumb while dragging (e.g. "12 / 233"). */
  valueLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const clamp = useCallback(
    (input: number) => {
      let next = Math.min(1, Math.max(0, input));
      if (steps && steps > 1) next = Math.round(next * (steps - 1)) / (steps - 1);
      return next;
    },
    [steps],
  );

  const ratioFromX = useCallback(
    (x: number) => {
      const usable = Math.max(1, widthRef.current - THUMB_WIDTH);
      return clamp((x - THUMB_WIDTH / 2) / usable);
    },
    [clamp],
  );

  const pageOriginRef = useRef(0);
  const trackRef = useRef<React.ComponentRef<typeof View> | null>(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (event) => {
          setDragging(true);
          onSlideStart?.();
          onChange(ratioFromX(event.nativeEvent.locationX));
        },
        onPanResponderMove: (_event, gesture) => {
          // Location during a move is page-relative, so subtract the track's
          // measured page origin — this is what makes the drag land exactly
          // under the finger instead of drifting.
          onChange(ratioFromX(gesture.moveX - pageOriginRef.current));
        },
        onPanResponderRelease: () => {
          setDragging(false);
          onSlideEnd?.();
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          onSlideEnd?.();
        },
      }),
    [clamp, disabled, onChange, onSlideEnd, onSlideStart, ratioFromX],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
    setWidth(event.nativeEvent.layout.width);
    // Measure once: the track is full-width inside a padded container.
    trackRef.current?.measureInWindow?.((x: number) => {
      pageOriginRef.current = x;
    });
  };

  const clamped = Math.min(1, Math.max(0, value));
  const thumbX = clamped * Math.max(0, width - THUMB_WIDTH);

  return (
    <View style={style}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.labelValue}>{valueLabel ?? ''}</Text>
        </View>
      ) : null}

      <View
        ref={trackRef}
        onLayout={onLayout}
        style={[styles.track, dragging && styles.trackActive, disabled && { opacity: 0.5 }]}
        accessibilityRole="adjustable"
        accessibilityLabel={label ?? 'Slider'}
        accessibilityValue={valueLabel ? { text: valueLabel } : undefined}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const step = steps && steps > 1 ? 1 / (steps - 1) : 0.05;
          onChange(
            clamp(event.nativeEvent.actionName === 'increment' ? value + step : value - step),
          );
        }}
        {...responder.panHandlers}
      >
        <View style={[styles.fill, { width: `${clamped * 100}%` }]} />
        <View style={[styles.thumb, { left: thumbX }]} />
        <View style={styles.endDot} />
        {dragging && valueLabel ? (
          <View style={styles.bubble} pointerEvents="none">
            <Text style={styles.bubbleText}>{valueLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Thin, non-interactive bar used for progress elsewhere in the app. */
export function MiniBar({ value, style }: { value: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.miniTrack, style]}>
      <View style={[styles.miniFill, { width: `${Math.min(1, Math.max(0, value)) * 100}%` }]} />
    </View>
  );
}

const styles = makeStyles((colors) => ({
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  label: { ...type.small, color: colors.textDim, fontWeight: '700', letterSpacing: 0.8 },
  labelValue: { ...type.small, color: colors.textDim, fontWeight: '500' },

  track: {
    height: TRACK_HEIGHT,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    justifyContent: 'center',
    overflow: 'visible',
  },
  trackActive: { backgroundColor: colors.input },
  fill: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: 2,
    backgroundColor: colors.text,
    top: (TRACK_HEIGHT - THUMB_HEIGHT) / 2,
  },
  endDot: {
    position: 'absolute',
    right: 12,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accentText,
  },
  bubble: {
    position: 'absolute',
    top: -34,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.input,
  },
  bubbleText: { ...type.tiny, color: colors.text },

  miniTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.inputStrong,
    overflow: 'hidden',
  },
  miniFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
}));

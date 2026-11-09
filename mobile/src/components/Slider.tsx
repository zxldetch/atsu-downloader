/**
 * The atsu slider, rebuilt in React Native.
 *
 * Reference (atsu's own reader): a full-width rounded track, a violet fill, a
 * thin white bar as the thumb and a small violet dot at the far end. It is the
 * same widget their Graphics sheet and page scrubber use, so it lives here once
 * and both screens render it.
 *
 * Geometry: everything is inset by INSET inside the rounded track, and the thumb
 * travels between the two insets — so the fill and the thumb never poke out past
 * the track's own edge at either end (the fill starts flush with the left cap and
 * stops flush with the right one).
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
/** Breathing room between the track edge and the fill/thumb at the extremes. */
const INSET = 4;
/** Clear space between the fill and the thumb — the "===== |" look, not "=====|". */
const GAP = 5;

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

  /** Distance the thumb's left edge can travel, inside the insets. */
  const usable = useCallback(
    (trackWidth: number) => Math.max(1, trackWidth - INSET * 2 - THUMB_WIDTH),
    [],
  );

  const ratioFromX = useCallback(
    (x: number) =>
      // x is relative to the track's left edge; the thumb's centre is what the
      // finger sits on, so measure from the centre of the thumb.
      clamp((x - INSET - THUMB_WIDTH / 2) / usable(widthRef.current)),
    [clamp, usable],
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
    [disabled, onChange, onSlideEnd, onSlideStart, ratioFromX],
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
  /** Left edge of the thumb, from the track's left edge. */
  const thumbX = INSET + clamped * usable(width);
  /** The fill stops short of the thumb, leaving a hairline of empty track. */
  const fillWidth = Math.max(0, thumbX - INSET - GAP);

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
        style={[styles.wrap, disabled && { opacity: 0.5 }]}
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
        {/* The rounded track clips its own contents, so the fill can never show a
            square corner outside the pill. */}
        <View style={[styles.track, dragging && styles.trackActive]}>
          <View style={[styles.fill, { left: INSET, width: fillWidth }]} />
          {/* The end dot only makes sense while there is still empty track for it
              to label — at the last page the fill has reached the cap. */}
          {fillWidth + GAP < width - INSET - THUMB_WIDTH - 30 ? <View style={styles.endDot} /> : null}
        </View>
        <View pointerEvents="none" style={[styles.thumb, { left: thumbX }]} />
        {dragging && valueLabel ? (
          <View pointerEvents="none" style={[styles.bubble, { left: thumbX - 34 }]}>
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

  wrap: { height: TRACK_HEIGHT, justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  trackActive: { backgroundColor: colors.input },
  fill: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    backgroundColor: colors.accent,
    // Flat ends, like the reference: a bar, not a pill inside a pill.
    borderRadius: 3,
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
    right: 14,
    top: TRACK_HEIGHT / 2 - 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accentText,
  },
  bubble: {
    position: 'absolute',
    top: -30,
    width: 68,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.inputStrong,
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

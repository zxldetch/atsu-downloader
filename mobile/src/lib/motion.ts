/**
 * Motion helpers.
 *
 * Two rules the app follows:
 *  1. every animation here is opt-out when the OS reports "remove animations"
 *     (Android's Remove animations setting, iOS Reduce Motion), and
 *  2. animations only ever touch `opacity` and `transform`, so they run on the
 *     native driver and never fight the download queue for JS frames.
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** True when the user asked the system to reduce motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;

    try {
      void AccessibilityInfo.isReduceMotionEnabled?.()
        .then((value) => {
          if (alive) setReduced(Boolean(value));
        })
        .catch(() => {});
    } catch {
      // Older platforms simply keep the default.
    }

    let subscription: { remove: () => void } | undefined;
    try {
      subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) =>
        setReduced(Boolean(value)),
      );
    } catch {
      // ignored
    }

    return () => {
      alive = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}

/** Announce a short, meaningful update to screen readers. */
export function announce(message: string): void {
  try {
    AccessibilityInfo.announceForAccessibility?.(message);
  } catch {
    // Web and older runtimes do not implement it; nothing to do.
  }
}

/**
 * Cross-platform "the OS already knows" check used by the boot animation so the
 * splash does not linger on low-end devices.
 */
export const isWeb = Platform.OS === 'web';

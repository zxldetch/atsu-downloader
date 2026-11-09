/**
 * One icon component, backed by Ionicons (the set Expo ships with).
 *
 * Importing the set through a single module keeps the icon names typed and
 * makes it trivial to swap the family later.
 */

// Import the one family directly: going through the package index pulls every
// icon font into the bundle (~1.5 MB of TTFs in the APK).
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors } from '../theme';

export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({
  name,
  size = 20,
  color = colors.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

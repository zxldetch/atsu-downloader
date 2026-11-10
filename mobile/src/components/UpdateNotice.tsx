/**
 * "There is a newer build" strip.
 *
 * Sideloaded APKs get no store updates, so this is the closest thing to an
 * update notification: it checks once per launch, and only speaks up when the
 * published build number is actually higher than the one installed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Icon } from './icons';
import { checkForUpdate, type UpdateCheck } from '../lib/updates';
import { formatBytes } from '../api/parse';
import { colors, makeStyles, radius, spacing, type } from '../theme';

export function useUpdateCheck(auto = true) {
  const [state, setState] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const ran = useRef(false);

  const run = useCallback(async () => {
    setChecking(true);
    const result = await checkForUpdate();
    setState(result);
    setChecking(false);
    return result;
  }, []);

  useEffect(() => {
    if (!auto || ran.current) return;
    ran.current = true;
    void run();
  }, [auto, run]);

  return { state, checking, check: run };
}

export function UpdateNotice({
  state,
  checking,
  onCheck,
  compact = false,
}: {
  state: UpdateCheck | null;
  checking: boolean;
  onCheck: () => void;
  compact?: boolean;
}) {
  const open = (url: string) => {
    void Linking.openURL(url).catch(() => {});
  };

  if (!state) {
    return compact ? (
      <Pressable
        onPress={onCheck}
        accessibilityRole="button"
        accessibilityLabel="Check for updates"
        style={styles.row}
      >
        <Icon name="cloud-download-outline" size={16} color={colors.textDim} />
        <Text style={styles.rowText}>{checking ? 'Checking for updates…' : 'Check for updates'}</Text>
      </Pressable>
    ) : null;
  }

  if (state.update) {
    return (
      <View style={styles.card} accessibilityLiveRegion="polite">
        <View style={styles.iconWrap}>
          <Icon name="cloud-download-outline" size={18} color={colors.accentText} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Build {state.update.versionCode} is available</Text>
          <Text style={styles.body} numberOfLines={2}>
            You are on build {state.current}.{' '}
            {state.update.sizeBytes
              ? `The APK is ${formatBytes(state.update.sizeBytes)} — let it finish downloading, then confirm the install.`
              : 'Tap to download the APK, then confirm the install.'}
          </Text>
        </View>
        <Pressable
          onPress={() => open(state.update!.apkUrl)}
          accessibilityRole="button"
          accessibilityLabel={`Download build ${state.update.versionCode}`}
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.75 }]}
        >
          <Text style={styles.actionText}>Get</Text>
          <Icon name="arrow-down-outline" size={14} color={colors.onAccent} />
        </Pressable>
      </View>
    );
  }

  return compact ? (
    <Pressable
      onPress={onCheck}
      accessibilityRole="button"
      accessibilityLabel="Check for updates"
      style={styles.row}
    >
      <Icon name="checkmark-circle-outline" size={16} color={colors.success} />
      <Text style={styles.rowText}>
        {state.error
          ? `Update check failed · ${state.error}`
          : `Up to date · build ${state.current}`}
      </Text>
    </Pressable>
  ) : null;
}

const styles = makeStyles((colors) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...type.subtitle, color: colors.text, fontSize: 14 },
  body: { ...type.tiny, color: colors.textDim, fontWeight: '400', marginTop: 3, lineHeight: 15 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  actionText: { ...type.small, color: colors.onAccent, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  rowText: { ...type.small, color: colors.textDim, fontWeight: '500', flex: 1 },
}));

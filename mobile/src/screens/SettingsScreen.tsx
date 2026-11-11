import Constants from 'expo-constants';
import { Fragment, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '../components/icons';
import {
  Button,
  Divider,
  SectionHeader,
  Segmented,
  StatTile,
  Stepper,
  Toggle,
} from '../components/ui';
import { UpdateNotice, useUpdateCheck } from '../components/UpdateNotice';
import { confirmAsync } from '../lib/confirm';
import * as storage from '../lib/storage';
import { Screen } from '../navigation';
import { useApp } from '../store/AppStore';
import {
  colors,
  makeStyles,
  radius,
  spacing,
  type,
  THEME_OPTIONS,
  useThemeName,
  type ThemeName,
} from '../theme';

type SpeedPreset = 'gentle' | 'balanced' | 'turbo';

const SPEED_PRESETS: {
  key: SpeedPreset;
  label: string;
  chapters: number;
  images: number;
  hint: string;
}[] = [
  { key: 'gentle', label: 'Gentle', chapters: 2, images: 4, hint: 'Cooler phone, lighter on data' },
  { key: 'balanced', label: 'Balanced', chapters: 4, images: 8, hint: 'Recommended' },
  { key: 'turbo', label: 'Turbo', chapters: 6, images: 12, hint: 'Fastest on good Wi-Fi' },
];

const REPO_URL = 'https://github.com/zxldetch/atsu-downloader';
const GUIDE_URL = `${REPO_URL}/blob/main/mobile/INSTALL.md`;
const SITE_URL = 'https://atsu.moe';

export function SettingsScreen() {
  useThemeName();
  const { config, jobs, library, actions } = useApp();
  const [busy, setBusy] = useState<'downloads' | 'all' | null>(null);

  const stats = useMemo(() => {
    const chapters = library.reduce(
      (sum, entry) => sum + Object.keys(entry.chapters).length,
      0,
    );
    const bytes = library.reduce(
      (sum, entry) =>
        sum + Object.values(entry.chapters).reduce((inner, chapter) => inner + chapter.bytes, 0),
      0,
    );
    const active = jobs.filter((job) =>
      ['queued', 'downloading', 'paused'].includes(job.status),
    ).length;
    return { chapters, bytes, active };
  }, [jobs, library]);

  const clearDownloads = async () => {
    const ok = await confirmAsync(
      'Delete downloaded chapters?',
      'Files are removed from this device. Your shelf and reading progress stay.',
      'Delete',
    );
    if (!ok) return;
    setBusy('downloads');
    await actions.clearDownloads();
    setBusy(null);
  };

  const resetAll = async () => {
    const ok = await confirmAsync(
      'Reset the app?',
      'Downloads, the shelf, reading progress and settings are all removed from this device.',
      'Reset',
    );
    if (!ok) return;
    setBusy('all');
    await actions.clearAllData();
    setBusy(null);
  };

  /** Which speed preset the current numbers correspond to, if any. */
  const activePreset = useMemo(() => {
    const match = SPEED_PRESETS.find(
      (preset) =>
        preset.chapters === config.concurrentChapters && preset.images === config.concurrentImages,
    );
    return match?.key ?? 'custom';
  }, [config.concurrentChapters, config.concurrentImages]);

  const updates = useUpdateCheck();

  return (
    <Screen title="Settings" subtitle={config.demoMode ? 'Demo source' : 'Live · atsu.moe'}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Appearance ------------------------------------------------------ */}
        <SectionHeader title="Appearance" />
        <View style={styles.card}>
          <LabelBlock label="Theme" hint="Choose your preferred app theme." />
          <Segmented<ThemeName>
            options={THEME_OPTIONS.map((option) => ({ key: option.key, label: option.label }))}
            value={config.theme}
            onChange={(theme) => actions.updateConfig({ theme })}
          />
        </View>

        {/* Reader ---------------------------------------------------------- */}
        <SectionHeader title="Reader" />
        <View style={styles.card}>
          <LabelBlock label="Reading Direction" hint="Choose how pages are displayed." />
          <Segmented<'vertical' | 'paged'>
            options={[
              { key: 'vertical', label: 'Vertical', icon: 'reorder-four-outline' },
              { key: 'paged', label: 'Paged', icon: 'copy-outline' },
            ]}
            value={config.readerMode}
            onChange={(readerMode) => actions.updateConfig({ readerMode })}
          />
          <Divider style={{ marginVertical: spacing.md }} />
          <Toggle
            label="Keep the Screen Awake"
            hint="Prevent the screen from turning off while reading."
            value={config.keepScreenAwake}
            onChange={(keepScreenAwake) => actions.updateConfig({ keepScreenAwake })}
          />
          <Divider />
          <Toggle
            label="Infinite Mode"
            hint="Scroll continuously between pages."
            value={config.autoAdvanceChapters}
            onChange={(autoAdvanceChapters) => actions.updateConfig({ autoAdvanceChapters })}
          />
        </View>

        {/* Downloads ------------------------------------------------------- */}
        <SectionHeader title="Downloads" />
        <View style={styles.card}>
          {/* One format, no selector: a CBZ per chapter holds every page in order. */}
          <InfoRow icon="archive-outline" label="Format">
            CBZ
          </InfoRow>
          <Divider style={{ marginVertical: spacing.sm }} />
          <LabelBlock label="Download Speed" hint="Set the number of simultaneous downloads." />
          <Segmented<SpeedPreset>
            options={SPEED_PRESETS.map((preset) => ({ key: preset.key, label: preset.label }))}
            value={activePreset as SpeedPreset}
            onChange={(key) => {
              const preset = SPEED_PRESETS.find((entry) => entry.key === key);
              if (!preset) return;
              actions.updateConfig({
                concurrentChapters: preset.chapters,
                concurrentImages: preset.images,
              });
            }}
          />
        </View>

        <View style={[styles.card, { marginTop: spacing.md }]}>
          <Stepper
            label="Chapters at Once"
            hint="Choose how many chapters to download at a time."
            value={config.concurrentChapters}
            min={1}
            max={8}
            onChange={(concurrentChapters) => actions.updateConfig({ concurrentChapters })}
          />
          <Divider />
          <Stepper
            label="Images per Chapter"
            hint="Set the number of images downloaded per chapter."
            value={config.concurrentImages}
            min={1}
            max={16}
            onChange={(concurrentImages) => actions.updateConfig({ concurrentImages })}
          />
          <Divider />
          <Stepper
            label="Retry per Image"
            hint="Set how many times a failed image download is retried."
            value={config.maxRetries}
            min={0}
            max={6}
            onChange={(maxRetries) => actions.updateConfig({ maxRetries })}
          />
          <Divider />
          <Stepper
            label="Retry Delay"
            hint="Set the time between download retries."
            value={config.retryDelay}
            min={1}
            max={10}
            onChange={(retryDelay) => actions.updateConfig({ retryDelay })}
            format={(value) => `${value}s`}
          />
        </View>

        {/* Source ---------------------------------------------------------- */}
        <SectionHeader title="Source" />
        <View style={styles.card}>
          <LabelBlock label="Server Mode" hint="Choose how content is delivered." />
          <Segmented<'live' | 'demo'>
            options={[
              { key: 'live', label: 'Live', icon: 'globe-outline' },
              { key: 'demo', label: 'Demo', icon: 'flask-outline' },
            ]}
            value={config.demoMode ? 'demo' : 'live'}
            onChange={(mode) => actions.updateConfig({ demoMode: mode === 'demo' })}
          />
          <Divider style={{ marginVertical: spacing.sm }} />
          <LinkRow
            icon="logo-github"
            label="Source Code"
            hint="View the app's source code."
            onPress={() => void Linking.openURL(REPO_URL).catch(() => {})}
          />
        </View>

        {/* Storage --------------------------------------------------------- */}
        <SectionHeader title="Storage" />
        <View style={styles.card}>
          <LabelBlock label="Storage Usage" hint="View your current storage usage." />
          <View style={styles.statRow}>
            <StatTile icon="albums-outline" label="Series" value={String(library.length)} />
            <StatTile icon="book-outline" label="Offline" value={String(stats.chapters)} />
            <StatTile
              icon="save-outline"
              label="On disk"
              value={`${(stats.bytes / (1024 * 1024)).toFixed(stats.bytes > 99 * 1024 * 1024 ? 0 : 1)} MB`}
            />
            <StatTile icon="sync-outline" label="Active" value={String(stats.active)} />
          </View>
        </View>

        <View style={[styles.card, { marginTop: spacing.md }]}>
          <Text style={styles.rowLabel}>Delete Downloaded Chapters</Text>
          <Text style={styles.rowHint}>Remove all downloaded chapters.</Text>
          <Button
            label="Delete"
            icon="trash-outline"
            onPress={clearDownloads}
            loading={busy === 'downloads'}
            style={{ marginTop: spacing.md }}
          />
          <Divider style={{ marginVertical: spacing.md }} />
          <Text style={styles.rowLabel}>Reset App and Data</Text>
          <Text style={styles.rowHint}>Restore the app to its default state.</Text>
          <Button
            label="Reset"
            variant="danger"
            icon="warning-outline"
            onPress={resetAll}
            loading={busy === 'all'}
            style={{ marginTop: spacing.md }}
          />
        </View>

        {/* Updates --------------------------------------------------------- */}
        <SectionHeader title="Updates" />
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Update Information</Text>
          <Text style={[styles.rowHint, { marginBottom: spacing.md }]}>
            Check the latest version and update details.
          </Text>
          <UpdateNotice
            state={updates.state}
            checking={updates.checking}
            onCheck={() => void updates.check()}
          />
        </View>

        {/* About ----------------------------------------------------------- */}
        <SectionHeader title="About" />
        <View style={styles.card}>
          <Text style={styles.rowLabel}>About the App</Text>
          <Text style={styles.rowHint}>
            v{Constants.expoConfig?.version ?? '1.0.0'} · build{' '}
            {Constants.expoConfig?.android?.versionCode ?? '—'} · not affiliated with atsu.moe.
          </Text>
          <View style={{ marginTop: spacing.sm }}>
            <LinkRow
              icon="download-outline"
              label="Latest APK"
              onPress={() =>
                void Linking.openURL(`${REPO_URL}/releases/tag/mobile-latest`).catch(() => {})
              }
            />
            <LinkRow
              icon="book-outline"
              label="Install Guide"
              onPress={() => void Linking.openURL(GUIDE_URL).catch(() => {})}
            />
            <LinkRow
              icon="globe-outline"
              label="atsu.moe"
              onPress={() => void Linking.openURL(SITE_URL).catch(() => {})}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

/** The label + one-line description that sits above a segmented control. */
function LabelBlock({ label, hint }: { label: string; hint: string }) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowHint}>{hint}</Text>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.infoRow}>
      <Icon name={icon} size={15} color={colors.textFaint} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {children}
      </Text>
    </View>
  );
}

function LinkRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Fragment>
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
      >
        <Icon name={icon} size={16} color={colors.textDim} />
        <View style={{ flex: 1 }}>
          <Text style={styles.linkLabel}>{label}</Text>
          {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
        </View>
        <Icon name="open-outline" size={14} color={colors.textFaint} />
      </Pressable>
      <Divider />
    </Fragment>
  );
}

const styles = makeStyles((colors) => ({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xs,
  },
  identityMark: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityMarkText: { ...type.title, color: colors.accent },
  identityTitle: { ...type.subtitle, color: colors.text },
  identityMeta: { ...type.tiny, color: colors.textFaint, fontWeight: '500', marginTop: 2 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg },
  swatches: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  swatch: {
    flex: 1,
    height: 52,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xs,
    justifyContent: 'space-between',
  },
  swatchCard: { height: 12, borderRadius: 3 },
  swatchAccent: { height: 6, width: '45%', borderRadius: 3 },
  rowLabel: { ...type.body, color: colors.text, fontWeight: '600' },
  rowHint: { ...type.tiny, color: colors.textFaint, fontWeight: '500', lineHeight: 16 },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.sm },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 7,
  },
  infoLabel: { ...type.small, color: colors.textDim, fontWeight: '600', width: 60 },
  infoValue: { ...type.tiny, color: colors.text, flex: 1, fontWeight: '500', lineHeight: 15 },
  aboutText: { ...type.tiny, color: colors.textDim, lineHeight: 17, fontWeight: '400' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  linkLabel: { ...type.small, color: colors.text, fontWeight: '600' },
  footerNote: {
    ...type.tiny,
    color: colors.textFaint,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
}));

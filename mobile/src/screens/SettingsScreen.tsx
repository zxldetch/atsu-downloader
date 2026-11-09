import Constants from 'expo-constants';
import { Fragment, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '../components/icons';
import {
  Banner,
  Button,
  Chip,
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
import { Slider } from '../components/Slider';
import { Screen, useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import {
  colors,
  useThemeName, makeStyles,
  palettes,
  radius,
  spacing,
  type,
  THEME_OPTIONS,
  type ThemeName,
} from '../theme';
import type { OutputFormat } from '../types';

const FORMATS: { key: OutputFormat; label: string }[] = [
  { key: 'cbz', label: 'CBZ' },
  { key: 'pdf', label: 'PDF' },
  { key: 'images', label: 'Images' },
];

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
  const nav = useNav();
  const [busy, setBusy] = useState<'downloads' | 'all' | null>(null);

  const activePreset = useMemo(() => {
    const match = SPEED_PRESETS.find(
      (preset) =>
        preset.chapters === config.concurrentChapters && preset.images === config.concurrentImages,
    );
    return match?.key ?? 'custom';
  }, [config.concurrentChapters, config.concurrentImages]);

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

  const updates = useUpdateCheck();

  const openLink = (url: string) => {
    void Linking.openURL(url).catch(() => {});
  };

  return (
    <Screen title="Settings" subtitle={config.demoMode ? 'Demo source' : 'Live · atsu.moe'}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <View style={styles.identityMark}>
            <Text style={styles.identityMarkText}>A</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.identityTitle}>Atsu Offline</Text>
            <Text style={styles.identityMeta}>
              v{Constants.expoConfig?.version ?? '1.0.0'} ·{' '}
              {config.demoMode ? 'demo fixtures' : 'direct from atsu.moe'}
            </Text>
          </View>
          <Chip
            label={config.demoMode ? 'DEMO' : 'LIVE'}
            tone={config.demoMode ? 'warning' : 'success'}
          />
        </View>

        <SectionHeader title="Appearance" />
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Theme</Text>
          <Segmented<ThemeName>
            options={THEME_OPTIONS.map((option) => ({
              key: option.key,
              label: option.label,
            }))}
            value={config.theme}
            onChange={(theme) => actions.updateConfig({ theme })}
            style={{ marginTop: spacing.sm, marginBottom: spacing.sm }}
          />
          <Text style={styles.rowHint}>
            {THEME_OPTIONS.find((option) => option.key === config.theme)?.hint ?? ''} · every
            screen, the reader chrome and the splash follow this choice.
          </Text>
          <View style={styles.swatches}>
            {(Object.keys(palettes) as ThemeName[]).map((name) => (
              <Pressable
                key={name}
                onPress={() => actions.updateConfig({ theme: name })}
                accessibilityRole="button"
                accessibilityLabel={`Use the ${name} theme`}
                accessibilityState={{ selected: config.theme === name }}
                style={[
                  styles.swatch,
                  { backgroundColor: palettes[name].bg, borderColor: palettes[name].borderStrong },
                  config.theme === name && { borderColor: colors.accent, borderWidth: 2 },
                ]}
              >
                <View style={[styles.swatchCard, { backgroundColor: palettes[name].card }]} />
                <View style={[styles.swatchAccent, { backgroundColor: palettes[name].accent }]} />
              </Pressable>
            ))}
          </View>
        </View>

        <SectionHeader title="Reader" />
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Reading direction</Text>
          <Segmented<'vertical' | 'paged'>
            options={[
              { key: 'vertical', label: 'Vertical', icon: 'reorder-four-outline' },
              { key: 'paged', label: 'Paged', icon: 'copy-outline' },
            ]}
            value={config.readerMode}
            onChange={(readerMode) => actions.updateConfig({ readerMode })}
            style={{ marginTop: spacing.sm, marginBottom: spacing.sm }}
          />
          <Text style={styles.rowHint}>
            Vertical stitches the chapter into one scroll, the way webtoons are drawn. Paged shows
            one image at a time and pages left to right.
          </Text>
          <Divider style={{ marginVertical: spacing.sm }} />
          <Toggle
            label="Keep the screen awake"
            hint="Stops the phone sleeping mid-chapter."
            value={config.keepScreenAwake}
            onChange={(keepScreenAwake) => actions.updateConfig({ keepScreenAwake })}
          />
        </View>

        <View style={[styles.card, { marginTop: spacing.md }]}>
          <Toggle
            label="Infinite mode"
            hint="Next/previous move into the neighbouring chapter, and the end of a strip loads the next one."
            value={config.autoAdvanceChapters}
            onChange={(autoAdvanceChapters) => actions.updateConfig({ autoAdvanceChapters })}
          />
          <Toggle
            label="Auto-scroll"
            hint="Glide down the page without touching it. Touching pauses it for a moment."
            value={config.autoScroll}
            onChange={(autoScroll) => actions.updateConfig({ autoScroll })}
          />
          <Slider
            value={(config.autoScrollSpeed - 1) / 9}
            steps={10}
            onChange={(value) => actions.updateConfig({ autoScrollSpeed: 1 + Math.round(value * 9) })}
            label="SCROLL SPEED"
            valueLabel={`${config.autoScrollSpeed}`}
            disabled={!config.autoScroll}
            style={{ marginTop: spacing.md }}
          />
        </View>

        <SectionHeader title="Downloads" />
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Default format</Text>
          <View style={styles.chipRow}>
            {FORMATS.map((format) => (
              <Chip
                key={format.key}
                label={format.label}
                active={config.downloadFormat === format.key}
                onPress={() => actions.updateConfig({ downloadFormat: format.key })}
              />
            ))}
          </View>
          <Text style={styles.rowHint}>Override per series on its page.</Text>
          <Divider style={{ marginVertical: spacing.sm }} />
          <Toggle
            label="Keep page images"
            hint="Archives are built from the pages. Off deletes the images after packing, which saves space."
            value={config.keepImages}
            onChange={(keepImages) => actions.updateConfig({ keepImages })}
          />
        </View>

        <View style={[styles.card, { marginTop: spacing.md }]}>
          <Text style={styles.rowLabel}>Download speed</Text>
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
            style={{ marginTop: spacing.sm, marginBottom: spacing.sm }}
          />
          <Text style={styles.rowHint}>
            {SPEED_PRESETS.find((preset) => preset.key === activePreset)?.hint ??
              `Custom — ${config.concurrentChapters} chapters × ${config.concurrentImages} images.`}{' '}
            Peak parallelism is{' '}
            {config.concurrentChapters * config.concurrentImages} connections; if pages start
            failing or the phone gets hot, step down one level.
          </Text>
          <Divider style={{ marginVertical: spacing.sm }} />
          <Stepper
            label="Chapters at once"
            hint="Phones do better with fewer parallel chapters than a desktop."
            value={config.concurrentChapters}
            min={1}
            max={8}
            onChange={(concurrentChapters) => actions.updateConfig({ concurrentChapters })}
          />
          <Divider />
          <Stepper
            label="Images per chapter"
            hint="Higher is faster, heavier on data and battery."
            value={config.concurrentImages}
            min={1}
            max={16}
            onChange={(concurrentImages) => actions.updateConfig({ concurrentImages })}
          />
          <Divider />
          <Stepper
            label="Retries per image"
            value={config.maxRetries}
            min={0}
            max={6}
            onChange={(maxRetries) => actions.updateConfig({ maxRetries })}
          />
          <Divider />
          <Stepper
            label="Retry delay"
            hint="Doubles after every failed attempt."
            value={config.retryDelay}
            min={1}
            max={10}
            onChange={(retryDelay) => actions.updateConfig({ retryDelay })}
            format={(value) => `${value}s`}
          />
        </View>

        <SectionHeader title="Source" />
        <View style={styles.card}>
          <Toggle
            label="Demo mode"
            hint="Serves bundled sample series instead of calling atsu.moe. Handy for trying the app without using data."
            value={config.demoMode}
            onChange={(demoMode) => actions.updateConfig({ demoMode })}
          />
          <Divider style={{ marginVertical: spacing.sm }} />
          <InfoRow icon="cloud-outline" label="API">
            {Platform.OS === 'web' ? 'same-origin proxy → atsu.moe' : 'atsu.moe · direct from device'}
          </InfoRow>
          <InfoRow icon="image-outline" label="Images">
            cdn.atsu.moe
          </InfoRow>
          <InfoRow icon="folder-outline" label="Files">
            {storage.storageRootDescription()}
          </InfoRow>
        </View>

        <SectionHeader title="Storage" />
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
        <View style={[styles.card, { marginTop: spacing.md }]}>
          <Button
            label="Delete downloaded chapters"
            icon="trash-outline"
            onPress={clearDownloads}
            loading={busy === 'downloads'}
            style={{ marginBottom: spacing.sm }}
          />
          <Button
            label="Reset app and all data"
            variant="danger"
            icon="warning-outline"
            onPress={resetAll}
            loading={busy === 'all'}
          />
          <Text style={[styles.rowHint, { marginTop: spacing.md }]}>
            Deleting chapters frees space but keeps your shelf and where you stopped reading.
          </Text>
        </View>

        <SectionHeader title="Updates" />
        <View style={styles.card}>
          <UpdateNotice
            state={updates.state}
            checking={updates.checking}
            onCheck={() => void updates.check()}
            compact
          />
          <Text style={styles.rowHint}>
            Builds are published to GitHub. The app checks once per launch and offers the APK;
            Android asks you to confirm the install, since sideloaded apps cannot self-update.
          </Text>
        </View>

        <SectionHeader title="About" />
        <View style={styles.card}>
          <Text style={styles.aboutText}>
            A React Native port of the Atsu Downloader desktop app — the atsu.moe API client, the
            chapter scraper, the download manager and the CBZ/PDF exporters are all reimplemented
            in TypeScript so they run on the phone itself.
          </Text>
          <Text style={[styles.aboutText, { marginTop: spacing.sm }]}>
            Pages come from atsu.moe and its CDN; nothing is uploaded anywhere. Your shelf, queue
            and settings live in this app's storage.
          </Text>
          <Text style={[styles.aboutText, { marginTop: spacing.sm, color: colors.warning }]}>
            Download only what you have the right to keep. This app ships with demo fixtures so you
            can evaluate it without touching third-party content.
          </Text>

          <View style={{ marginTop: spacing.lg }}>
            <LinkRow icon="logo-github" label="Source code" onPress={() => openLink(REPO_URL)} />
            <LinkRow
              icon="download-outline"
              label="Get the latest APK"
              onPress={() => openLink(`${REPO_URL}/releases/tag/mobile-latest`)}
            />
            <LinkRow icon="book-outline" label="Install guide" onPress={() => openLink(GUIDE_URL)} />
            <LinkRow icon="globe-outline" label="atsu.moe" onPress={() => openLink(SITE_URL)} />
          </View>
        </View>

        <Pressable onPress={() => nav.go('shelf')} style={{ marginTop: spacing.xl }}>
          <Text style={styles.footerNote}>
            {library.length} series · {stats.chapters} chapters offline · {jobs.length} queue entries
          </Text>
        </Pressable>

        <Banner tone="info">
          Not affiliated with atsu.moe. Built as an offline-first companion for people who read
          series more than once.
        </Banner>
      </ScrollView>
    </Screen>
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
  onPress,
}: {
  icon: IconName;
  label: string;
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
        <Text style={styles.linkLabel}>{label}</Text>
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
  linkLabel: { ...type.small, color: colors.text, fontWeight: '600', flex: 1 },
  footerNote: {
    ...type.tiny,
    color: colors.textFaint,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
}));

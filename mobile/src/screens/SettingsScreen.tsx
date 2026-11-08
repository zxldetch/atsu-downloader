import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Chip, Field, SectionTitle, Stepper, Toggle } from '../components/ui';
import { confirmAsync } from '../lib/confirm';
import * as storage from '../lib/storage';
import { Screen, useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, radius, spacing, type } from '../theme';
import type { OutputFormat } from '../types';

const FORMATS: OutputFormat[] = ['cbz', 'pdf', 'images'];

export function SettingsScreen() {
  const { config, jobs, library, actions } = useApp();
  const nav = useNav();
  const [busy, setBusy] = useState(false);

  const clearAll = async () => {
    const ok = await confirmAsync(
      'Delete everything?',
      'This removes downloaded chapters, the library and the queue from this device.',
      'Delete',
    );
    if (!ok) return;
    setBusy(true);
    await actions.clearAllData();
    setBusy(false);
  };

  const downloadedChapters = library.reduce(
    (sum, entry) => sum + Object.keys(entry.chapters).length,
    0,
  );
  const totalBytes = library.reduce(
    (sum, entry) =>
      sum + Object.values(entry.chapters).reduce((inner, chapter) => inner + chapter.bytes, 0),
    0,
  );

  return (
    <Screen title="Settings" subtitle="Downloads, storage and source" onBack={nav.back}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.cardTitle}>Output</Text>
          <Field label="Default format" hint="You can override this per download on the manga screen.">
            <View style={styles.chipRow}>
              {FORMATS.map((format) => (
                <Chip
                  key={format}
                  label={format.toUpperCase()}
                  active={config.downloadFormat === format}
                  onPress={() => actions.updateConfig({ downloadFormat: format })}
                />
              ))}
            </View>
          </Field>
          <Toggle
            label="Keep page images"
            hint="Archives are built from the pages; turn off to delete them after packing."
            value={config.keepImages}
            onChange={(value) => actions.updateConfig({ keepImages: value })}
          />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.cardTitle}>Performance</Text>
          <Stepper
            label="Chapters at once"
            hint="Phones handle fewer parallel chapters than a desktop."
            value={config.concurrentChapters}
            min={1}
            max={5}
            onChange={(value) => actions.updateConfig({ concurrentChapters: value })}
          />
          <Stepper
            label="Images per chapter"
            hint="Higher is faster but heavier on data and CPU."
            value={config.concurrentImages}
            min={1}
            max={8}
            onChange={(value) => actions.updateConfig({ concurrentImages: value })}
          />
          <Stepper
            label="Retries per image"
            value={config.maxRetries}
            min={0}
            max={6}
            onChange={(value) => actions.updateConfig({ maxRetries: value })}
          />
          <Stepper
            label="Retry delay"
            hint="Doubles after every failed attempt."
            value={config.retryDelay}
            min={1}
            max={10}
            onChange={(value) => actions.updateConfig({ retryDelay: value })}
            format={(value) => `${value}s`}
          />
        </Card>

        <Card style={{ marginTop: spacing.md }}>
          <Text style={styles.cardTitle}>Source</Text>
          <Toggle
            label="Demo mode"
            hint="Serves bundled sample series instead of calling atsu.moe. Useful for trying the app offline."
            value={config.demoMode}
            onChange={(value) => actions.updateConfig({ demoMode: value })}
          />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>API</Text>
            <Text style={styles.infoValue}>
              {Platform.OS === 'web' ? 'same-origin proxy → atsu.moe' : 'atsu.moe (direct)'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Storage</Text>
            <Text style={styles.infoValue} numberOfLines={2}>
              {storage.storageRootDescription()}
            </Text>
          </View>
        </Card>

        <SectionTitle title="Your data" />
        <Card>
          <View style={styles.statsRow}>
            <Stat label="Manga" value={String(library.length)} />
            <Stat label="Offline chapters" value={String(downloadedChapters)} />
            <Stat label="On disk" value={`${(totalBytes / (1024 * 1024)).toFixed(1)} MB`} />
            <Stat label="Jobs" value={String(jobs.length)} />
          </View>
          <Button
            label={busy ? 'Clearing…' : 'Clear all downloads'}
            variant="danger"
            onPress={clearAll}
            loading={busy}
            style={{ marginTop: spacing.md }}
          />
        </Card>

        <SectionTitle title="About" />
        <Card>
          <Text style={styles.aboutText}>
            Atsu Mobile 1.0.0 — a React Native port of the Atsu Downloader desktop app
            (API client, scraper, download manager and CBZ/PDF converters, all reimplemented in
            TypeScript).
          </Text>
          <Text style={[styles.aboutText, { marginTop: spacing.sm }]}>
            Pages are fetched from atsu.moe and its CDN. Nothing is uploaded anywhere; the library
            index lives in this app's local storage and the files stay on the device.
          </Text>
          <Text style={[styles.aboutText, { marginTop: spacing.sm, color: colors.warning }]}>
            Only download material you have the right to keep. This app ships with demo fixtures so
            you can evaluate it without touching any third-party content.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  cardTitle: {
    ...type.small,
    color: colors.textDim,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  infoLabel: { ...type.body, color: colors.textDim, width: 72 },
  infoValue: { ...type.small, color: colors.text, flex: 1, fontWeight: '400', lineHeight: 17 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: {
    flex: 1,
    minWidth: 72,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.input,
    alignItems: 'center',
  },
  statValue: { ...type.title, color: colors.accent, fontSize: 18 },
  statLabel: { ...type.small, color: colors.textFaint, fontSize: 10, marginTop: 2 },
  aboutText: { ...type.small, color: colors.textDim, lineHeight: 18, fontWeight: '400' },
});

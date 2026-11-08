import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatBytes, formatRelativeTime } from '../api/parse';
import { Banner, Button, Card, Chip, EmptyState, ProgressBar, SectionTitle, TextField } from '../components/ui';
import { Screen, useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, radius, spacing, type } from '../theme';
import type { LibraryEntry } from '../types';

export function HomeScreen() {
  const { config, library, jobs, loadingManga, lastError, actions } = useApp();
  const nav = useNav();
  const [input, setInput] = useState('');

  const activeJobs = jobs.filter((job) =>
    ['queued', 'downloading', 'paused'].includes(job.status),
  ).length;

  const continueReading = useMemo(
    () =>
      library
        .filter((entry) => entry.reading)
        .sort((a, b) => (b.reading?.updatedAt ?? 0) - (a.reading?.updatedAt ?? 0))
        .slice(0, 8),
    [library],
  );

  const handleLoad = async (value?: string) => {
    const target = (value ?? input).trim();
    if (!target) return;
    const manga = await actions.loadManga(target);
    if (manga) {
      setInput('');
      nav.push({ name: 'manga', mangaId: manga.id });
    }
  };

  return (
    <Screen
      title="Library"
      subtitle={config.demoMode ? 'Demo data · toggle in Settings' : 'atsumoe · direct from device'}
      right={
        <>
          <Button
            label={activeJobs > 0 ? `Queue ${activeJobs}` : 'Queue'}
            size="sm"
            variant={activeJobs > 0 ? 'primary' : 'secondary'}
            onPress={() => nav.push({ name: 'queue' })}
          />
          <Button label="⚙" size="sm" onPress={() => nav.push({ name: 'settings' })} />
        </>
      }
    >
      <FlatList
        data={library}
        keyExtractor={(entry) => entry.mangaId}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Card>
              <Text style={styles.heroTitle}>Paste a manga link</Text>
              <Text style={styles.heroBody}>
                Any atsu.moe link — <Text style={styles.code}>atsu.moe/manga/OaKBx</Text> — or just
                the id.
              </Text>
              <View style={styles.searchRow}>
                <TextField
                  value={input}
                  onChangeText={setInput}
                  placeholder="https://atsu.moe/manga/…"
                  onSubmit={() => handleLoad()}
                  keyboardType="url"
                  style={{ flex: 1 }}
                />
                <Button
                  label="Load"
                  variant="primary"
                  loading={loadingManga}
                  onPress={() => handleLoad()}
                  style={{ width: 88 }}
                />
              </View>

              {lastError ? (
                <Banner onDismiss={actions.clearError}>{lastError}</Banner>
              ) : null}

              {config.demoMode ? (
                <View style={styles.demoRow}>
                  <Text style={styles.demoLabel}>Try a demo series</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {actions.demoLibrary().map((manga) => (
                      <Chip
                        key={manga.id}
                        label={manga.title}
                        onPress={() => handleLoad(manga.id)}
                      />
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </Card>

            {continueReading.length > 0 ? (
              <>
                <SectionTitle title="Continue reading" />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.md }}
                >
                  {continueReading.map((entry) => (
                    <Card
                      key={entry.mangaId}
                      style={styles.continueCard}
                      onPress={() =>
                        entry.reading &&
                        nav.push({
                          name: 'reader',
                          mangaId: entry.mangaId,
                          chapterId: entry.reading.chapterId,
                        })
                      }
                    >
                      <Image source={{ uri: entry.coverUrl }} style={styles.continueCover} contentFit="cover" />
                      <Text style={styles.continueTitle} numberOfLines={2}>
                        {entry.title}
                      </Text>
                      <Text style={styles.continueMeta} numberOfLines={1}>
                        {entry.reading
                          ? `Page ${entry.reading.page}/${entry.reading.total}`
                          : 'Not started'}
                      </Text>
                      <ProgressBar
                        value={entry.reading?.page ?? 0}
                        total={entry.reading?.total ?? 1}
                        height={4}
                      />
                    </Card>
                  ))}
                </ScrollView>
              </>
            ) : null}

            {library.length > 0 ? <SectionTitle title="Saved manga" /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <LibraryRow entry={item} onOpen={() => nav.push({ name: 'manga', mangaId: item.mangaId })} />
        )}
        ListEmptyComponent={
          <EmptyState
            title="Nothing here yet"
            body={
              config.demoMode
                ? 'Demo mode is on, so the bundled series are ready to browse. Load one above to try the queue, reader and export.'
                : 'Load a manga from atsu.moe to start building your offline library.'
            }
          />
        }
      />
    </Screen>
  );
}

function LibraryRow({ entry, onOpen }: { entry: LibraryEntry; onOpen: () => void }) {
  const downloaded = Object.keys(entry.chapters).length;
  const reading = entry.reading;
  const lastUpdate = Math.max(
    entry.addedAt,
    ...Object.values(entry.chapters).map((chapter) => chapter.updatedAt),
  );
  const totalBytes = Object.values(entry.chapters).reduce((sum, ch) => sum + ch.bytes, 0);

  return (
    <Card style={styles.row} onPress={onOpen}>
      <Image source={{ uri: entry.coverUrl }} style={styles.rowCover} contentFit="cover" />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {entry.chapterCount} chapters · {downloaded} offline
          {totalBytes > 0 ? ` · ${formatBytes(totalBytes)}` : ''}
        </Text>
        {reading ? (
          <View style={{ marginTop: 8 }}>
            <ProgressBar value={reading.page} total={reading.total} height={4} />
            <Text style={styles.rowReading}>
              Chapter {reading.chapterId.split('-ch-').pop() ?? ''} · page {reading.page}/
              {reading.total}
            </Text>
          </View>
        ) : (
          <Text style={styles.rowReading}>Added {formatRelativeTime(lastUpdate)}</Text>
        )}
      </View>
      <Text style={styles.rowChevron}>›</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  heroTitle: { ...type.subtitle, color: colors.text, marginBottom: 2 },
  heroBody: { ...type.small, color: colors.textDim, lineHeight: 17, marginBottom: spacing.md },
  code: { color: colors.accent, fontFamily: 'monospace' },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  demoRow: { marginTop: spacing.lg },
  demoLabel: {
    ...type.small,
    color: colors.textFaint,
    marginBottom: spacing.sm,
    letterSpacing: 0.4,
  },
  continueCard: { width: 132, padding: spacing.sm, gap: 6 },
  continueCover: { width: '100%', height: 168, borderRadius: radius.md, backgroundColor: colors.input },
  continueTitle: { ...type.small, color: colors.text, fontWeight: '600' },
  continueMeta: { ...type.small, color: colors.textFaint, fontWeight: '400' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  rowCover: { width: 54, height: 76, borderRadius: radius.sm, backgroundColor: colors.input },
  rowTitle: { ...type.subtitle, color: colors.text, fontSize: 15 },
  rowMeta: { ...type.small, color: colors.textDim, fontWeight: '400', marginTop: 2 },
  rowReading: { ...type.small, color: colors.textFaint, fontWeight: '400', marginTop: 5 },
  rowChevron: { color: colors.textFaint, fontSize: 24, marginLeft: 2 },
});

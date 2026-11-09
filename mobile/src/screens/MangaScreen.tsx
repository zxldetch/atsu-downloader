import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { formatBytes, parseChapterSelection } from '../api/parse';
import { ChapterRow } from '../components/cards';
import { Icon } from '../components/icons';
import { Banner, Button, Chip, EmptyState, TextField } from '../components/ui';
import { Screen, useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, coverAspect, radius, spacing, type } from '../theme';
import type { Chapter, DownloadJob, OutputFormat } from '../types';

const FORMATS: { key: OutputFormat; label: string }[] = [
  { key: 'cbz', label: 'CBZ' },
  { key: 'pdf', label: 'PDF' },
  { key: 'images', label: 'Images' },
];

const STATUS_TEXT: Record<DownloadJob['status'], string> = {
  queued: 'Queued',
  downloading: 'Downloading…',
  paused: 'Paused',
  done: 'Saved',
  error: 'Failed — tap to retry',
  canceled: 'Canceled',
};

export function MangaScreen({ mangaId }: { mangaId: string }) {
  const { mangaCache, library, jobs, config, loadingManga, actions } = useApp();
  const nav = useNav();

  const manga = mangaCache[mangaId] ?? actions.getManga(mangaId);
  const entry = library.find((item) => item.mangaId === mangaId);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [range, setRange] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // Restored libraries only keep counts, so refetch when the chapter list is missing.
  useEffect(() => {
    if (!manga || manga.chapters.length === 0) {
      void actions.loadManga(mangaId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mangaId, manga?.chapters.length]);

  /**
   * chapterId → a short status line. Deliberately *not* page counts: this string
   * only changes on status transitions, so a downloading chapter does not churn
   * every row on the screen several times a second.
   */
  const statusByChapter = useMemo(() => {
    const map = new Map<string, string>();
    const newest = new Map<string, DownloadJob>();
    for (const job of jobs) {
      if (job.mangaId !== mangaId) continue;
      const existing = newest.get(job.chapterId);
      if (!existing || job.updatedAt > existing.updatedAt) newest.set(job.chapterId, job);
    }
    for (const [chapterId, job] of newest) {
      map.set(chapterId, STATUS_TEXT[job.status]);
    }
    return map;
  }, [jobs, mangaId]);

  const chapters = manga?.chapters ?? [];

  const selectedChapters = useMemo(
    () => chapters.filter((chapter) => selection.has(chapter.id)),
    [chapters, selection],
  );

  const toggle = useCallback((chapterId: string) => {
    // Haptics is a nicety: web and some devices don't implement it.
    try {
      void Haptics.selectionAsync?.().catch(() => {});
    } catch {
      // ignored on purpose
    }
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }, []);

  const openReader = useCallback(
    (chapterId: string) => nav.push({ name: 'reader', mangaId, chapterId }),
    [mangaId, nav],
  );

  const selectAll = useCallback(
    () => setSelection(new Set(chapters.map((chapter) => chapter.id))),
    [chapters],
  );
  const clearSelection = useCallback(() => setSelection(new Set()), []);

  const selectUnread = useCallback(() => {
    const maybe = (chapter: Chapter) => !entry?.chapters?.[chapter.id] && !statusByChapter.get(chapter.id);
    setSelection(new Set(chapters.filter(maybe).map((chapter) => chapter.id)));
  }, [chapters, entry?.chapters, statusByChapter]);

  const applyRange = useCallback(() => {
    if (!range.trim()) return;
    const indices = parseChapterSelection(range, chapters.length);
    if (indices.length === 0) {
      setMessage('That selection matched no chapters. Try “1-10” or “1,3,5-7”.');
      return;
    }
    setSelection(new Set(indices.map((index) => chapters[index].id)));
    setMessage(null);
  }, [chapters, range]);

  /** Newest-first is what you want most of the time, so offer it as a shortcut. */
  const selectLatest = useCallback(
    (count: number) => {
      const sorted = [...chapters].sort((a, b) => b.number - a.number).slice(0, count);
      setSelection(new Set(sorted.map((chapter) => chapter.id)));
    },
    [chapters],
  );

  const startDownload = useCallback(() => {
    if (!manga) return;
    const count = actions.enqueue(manga, selectedChapters, config.downloadFormat);
    if (count === 0) {
      setMessage('Those chapters are already downloaded or in progress.');
      return;
    }
    setSelection(new Set());
    nav.go('shelf', { shelfTab: 'downloads' });
  }, [actions, config.downloadFormat, manga, nav, selectedChapters]);

  if (!manga) {
    return (
      <Screen title="Loading…" onBack={nav.back}>
        <View style={styles.center}>
          <Text style={styles.dim}>{loadingManga ? 'Fetching series…' : 'Series not available'}</Text>
          {!loadingManga ? (
            <Button label="Try again" size="sm" onPress={() => void actions.loadManga(mangaId)} />
          ) : null}
        </View>
      </Screen>
    );
  }

  const offlineCount = Object.keys(entry?.chapters ?? {}).length;
  const offlineBytes = Object.values(entry?.chapters ?? {}).reduce(
    (sum, chapter) => sum + chapter.bytes,
    0,
  );
  const resumeChapter =
    (entry?.reading && chapters.find((chapter) => chapter.id === entry.reading?.chapterId)) ||
    chapters[chapters.length - 1];

  return (
    <Screen
      title={manga.title}
      subtitle={`${chapters.length} chapters · ${offlineCount} offline`}
      onBack={nav.back}
      showTabs={false}
      footer={
        <View style={styles.footerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.footerCount}>
              {selection.size > 0 ? `${selection.size} selected` : 'Select chapters'}
            </Text>
            <Text style={styles.footerHint}>
              {selection.size > 0
                ? `${config.downloadFormat.toUpperCase()} · saved on this device`
                : 'Tap rows, or use a range'}
            </Text>
          </View>
          <Button
            label={selection.size === 0 ? 'Download' : `Download ${selection.size}`}
            variant="primary"
            icon="download-outline"
            disabled={selection.size === 0}
            onPress={startDownload}
          />
        </View>
      }
    >
      <FlatList
        data={chapters}
        keyExtractor={(chapter) => chapter.id}
        contentContainerStyle={styles.content}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Image
                source={{ uri: manga.coverUrl }}
                style={styles.cover}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={manga.id}
                transition={140}
              />
              <View style={styles.heroBody}>
                <Text style={styles.heroTitle} numberOfLines={3}>
                  {manga.title}
                </Text>
                <Text style={styles.heroMeta} numberOfLines={2}>
                  {[manga.mangaType, manga.status, manga.authors.join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <View style={styles.chipRow}>
                  {manga.demo ? <Chip label="DEMO" tone="warning" icon="flask-outline" /> : null}
                  {offlineCount > 0 ? (
                    <Chip
                      label={`${offlineCount} offline · ${formatBytes(offlineBytes)}`}
                      tone="success"
                      icon="checkmark-circle"
                    />
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.heroActions}>
              <Button
                label={entry?.reading ? 'Continue' : 'Read latest'}
                variant="primary"
                icon="book-outline"
                onPress={() => resumeChapter && openReader(resumeChapter.id)}
                style={{ flex: 1 }}
              />
              <Button
                label="Queue"
                icon="arrow-down-circle-outline"
                onPress={() => nav.go('shelf', { shelfTab: 'downloads' })}
              />
            </View>

            {manga.synopsis ? (
              <Text style={styles.synopsis} numberOfLines={4}>
                {manga.synopsis}
              </Text>
            ) : null}

            <View style={styles.controlCard}>
              <View style={styles.controlRow}>
                <TextField
                  value={range}
                  onChangeText={setRange}
                  placeholder="Range · all, 1-10, 1,3,5-7"
                  icon="list-outline"
                  onSubmit={applyRange}
                  style={{ flex: 1 }}
                />
                <Button label="Apply" size="sm" onPress={applyRange} />
              </View>

              <View style={styles.quickRow}>
                <Chip label="All" icon="checkmark-done" onPress={selectAll} />
                <Chip label="Unread" icon="ellipse-outline" onPress={selectUnread} />
                <Chip label="Latest 5" icon="sparkles-outline" onPress={() => selectLatest(5)} />
                <Chip label="None" icon="close" onPress={clearSelection} />
              </View>

              <View style={styles.formatRow}>
                <Text style={styles.formatLabel}>Format</Text>
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
              </View>
            </View>

            {message ? (
              <Banner tone="warning" onDismiss={() => setMessage(null)}>
                {message}
              </Banner>
            ) : null}

            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>Chapters</Text>
              <Text style={styles.listHeaderMeta}>
                {selection.size > 0 ? `${selection.size} selected` : 'Tap to select'}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <ChapterRow
            chapter={item}
            selected={selection.has(item.id)}
            status={statusByChapter.get(item.id) ?? null}
            saved={Boolean(entry?.chapters?.[item.id])}
            onToggle={toggle}
            onRead={openReader}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="albums-outline"
            title="No chapters listed"
            body="atsu.moe returned this series without a chapter list. Pull it up again in a moment, or check the link."
          />
        }
        ListFooterComponent={
          chapters.length > 0 ? (
            <Text style={styles.footerNote}>
              Chapters are numbered as atsu.moe lists them · {chapters.length} total
            </Text>
          ) : undefined
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  dim: { ...type.body, color: colors.textDim },
  hero: { flexDirection: 'row', gap: spacing.lg, paddingTop: spacing.xs },
  cover: {
    width: 104,
    height: 104 / coverAspect,
    borderRadius: radius.md,
    backgroundColor: colors.input,
  },
  heroBody: { flex: 1, gap: 5 },
  heroTitle: { ...type.title, color: colors.text },
  heroMeta: { ...type.tiny, color: colors.textDim, fontWeight: '500', lineHeight: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  heroActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  synopsis: {
    ...type.small,
    color: colors.textDim,
    fontWeight: '400',
    lineHeight: 18,
    marginTop: spacing.lg,
  },
  controlCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  controlRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  formatRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  formatLabel: { ...type.tiny, color: colors.textFaint, fontWeight: '600' },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingBottom: spacing.sm,
  },
  listHeaderText: { ...type.section, color: colors.text },
  listHeaderMeta: { ...type.tiny, color: colors.textFaint, fontWeight: '600' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footerCount: { ...type.body, color: colors.text, fontWeight: '600' },
  footerHint: { ...type.tiny, color: colors.textFaint, fontWeight: '500', marginTop: 2 },
  footerNote: {
    ...type.tiny,
    color: colors.textFaint,
    fontWeight: '500',
    textAlign: 'center',
    paddingTop: spacing.xl,
  },
});

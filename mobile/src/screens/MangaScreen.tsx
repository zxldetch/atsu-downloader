import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  chapterLabel,
  formatBytes,
  formatChapterNumber,
  parseChapterSelection,
} from '../api/parse';
import { Banner, Button, Card, Chip, TextField } from '../components/ui';
import { Screen, useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, radius, spacing, type } from '../theme';
import type { Chapter, DownloadJob, LibraryEntry, OutputFormat } from '../types';

const FORMATS: { key: OutputFormat; label: string; hint: string }[] = [
  { key: 'cbz', label: 'CBZ', hint: 'One archive per chapter — best for most readers' },
  { key: 'pdf', label: 'PDF', hint: 'Works with any PDF viewer' },
  { key: 'images', label: 'Images', hint: 'Loose page files, handy for gallery export' },
];

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

  const jobsByChapter = useMemo(() => {
    const map = new Map<string, DownloadJob>();
    for (const job of jobs) {
      if (job.mangaId !== mangaId) continue;
      const existing = map.get(job.chapterId);
      if (!existing || job.updatedAt > existing.updatedAt) map.set(job.chapterId, job);
    }
    return map;
  }, [jobs, mangaId]);

  if (!manga) {
    return (
      <Screen title="Loading…" onBack={nav.back}>
        <View style={styles.center}>
          <Text style={styles.dim}>{loadingManga ? 'Fetching manga…' : 'Manga not available'}</Text>
        </View>
      </Screen>
    );
  }

  const chapters = manga.chapters;
  const offlineCount = Object.keys(entry?.chapters ?? {}).length;
  const selectedChapters = chapters.filter((chapter) => selection.has(chapter.id));

  const toggle = (chapterId: string) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });

  const selectAll = () => setSelection(new Set(chapters.map((chapter) => chapter.id)));
  const clear = () => setSelection(new Set());

  const applyRange = () => {
    if (!range.trim()) return;
    const indices = parseChapterSelection(range, chapters.length);
    if (indices.length === 0) {
      setMessage('That selection matched no chapters. Try “1-10” or “1,3,5-7”.');
      return;
    }
    setSelection(new Set(indices.map((index) => chapters[index].id)));
    setMessage(null);
  };

  const startDownload = () => {
    const count = actions.enqueue(manga, selectedChapters, config.downloadFormat);
    if (count === 0) {
      setMessage('Those chapters are already downloaded or in progress.');
      return;
    }
    setSelection(new Set());
    nav.push({ name: 'queue' });
  };

  const openReader = (chapter: Chapter) =>
    nav.push({ name: 'reader', mangaId, chapterId: chapter.id });

  const resumeChapter =
    (entry?.reading && chapters.find((chapter) => chapter.id === entry.reading?.chapterId)) ||
    chapters[0];

  return (
    <Screen
      title={manga.title}
      subtitle={`${chapters.length} chapters · ${offlineCount} offline`}
      onBack={nav.back}
      footer={
        <Button
          label={
            selectedChapters.length === 0
              ? 'Select chapters to download'
              : `Download ${selectedChapters.length} · ${config.downloadFormat.toUpperCase()}`
          }
          variant="primary"
          disabled={selectedChapters.length === 0}
          onPress={startDownload}
        />
      }
    >
      <FlatList
        data={chapters}
        keyExtractor={(chapter) => chapter.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Card style={styles.headerCard}>
              <View style={styles.headerRow}>
                <Image source={{ uri: manga.coverUrl }} style={styles.cover} contentFit="cover" />
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.title} numberOfLines={2}>
                    {manga.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[manga.mangaType, manga.status, manga.authors.join(', ')]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <View style={styles.chipRow}>
                    {manga.demo ? <Chip label="DEMO" tone="warning" /> : null}
                    {manga.genres.slice(0, 3).map((genre) => (
                      <Chip key={genre} label={genre} />
                    ))}
                  </View>
                </View>
              </View>
              {manga.synopsis ? (
                <Text style={styles.synopsis} numberOfLines={4}>
                  {manga.synopsis}
                </Text>
              ) : null}
              <View style={styles.actionRow}>
                <Button
                  label={entry?.reading ? 'Continue reading' : 'Read first chapter'}
                  size="sm"
                  variant="primary"
                  onPress={() => resumeChapter && openReader(resumeChapter)}
                  style={{ flex: 1 }}
                />
                <Button label="All" size="sm" onPress={selectAll} />
                <Button label="None" size="sm" onPress={clear} />
              </View>
            </Card>

            <Card style={{ marginTop: spacing.md }}>
              <Text style={styles.blockLabel}>Chapter range</Text>
              <View style={styles.searchRow}>
                <TextField
                  value={range}
                  onChangeText={setRange}
                  placeholder="all · 1-10 · 1,3,5-7"
                  onSubmit={applyRange}
                  style={{ flex: 1 }}
                />
                <Button label="Apply" size="md" onPress={applyRange} style={{ width: 80 }} />
              </View>

              <Text style={[styles.blockLabel, { marginTop: spacing.lg }]}>Output format</Text>
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
              <Text style={styles.hint}>
                {FORMATS.find((format) => format.key === config.downloadFormat)?.hint}
              </Text>
            </Card>

            {message ? (
              <View style={{ marginTop: spacing.md }}>
                <Banner tone="warning" onDismiss={() => setMessage(null)}>
                  {message}
                </Banner>
              </View>
            ) : null}

            <View style={styles.listHeader}>
              <Text style={styles.blockLabel}>Chapters</Text>
              <Text style={styles.selectionCount}>
                {selection.size > 0 ? `${selection.size} selected` : 'Tap to select'}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <ChapterRow
            chapter={item}
            selected={selection.has(item.id)}
            job={jobsByChapter.get(item.id)}
            saved={entry?.chapters?.[item.id]}
            onToggle={() => toggle(item.id)}
            onRead={() => openReader(item)}
          />
        )}
      />
    </Screen>
  );
}

function ChapterRow({
  chapter,
  selected,
  job,
  saved,
  onToggle,
  onRead,
}: {
  chapter: Chapter;
  selected: boolean;
  job?: DownloadJob;
  saved?: LibraryEntry['chapters'][string];
  onToggle: () => void;
  onRead: () => void;
}) {
  const status = describeStatus(job, saved);

  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.chapterRow,
        selected && styles.chapterSelected,
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={[styles.checkbox, selected && styles.checkboxOn]}>
        {selected ? <Text style={styles.checkGlyph}>✓</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.chapterTitle} numberOfLines={1}>
          {chapterLabel(chapter)}
        </Text>
        <Text style={styles.chapterMeta} numberOfLines={1}>
          {chapter.pageCount > 0 ? `${chapter.pageCount} pages` : 'Pages fetched at download'}
          {saved?.bytes ? ` · ${formatBytes(saved.bytes)}` : ''}
        </Text>
      </View>
      {status ? <Chip label={status.label} tone={status.tone} /> : null}
      <Pressable onPress={onRead} hitSlop={10} style={styles.readButton}>
        <Text style={styles.readGlyph}>▸</Text>
      </Pressable>
    </Pressable>
  );
}

function describeStatus(
  job: DownloadJob | undefined,
  saved: LibraryEntry['chapters'][string] | undefined,
): { label: string; tone: 'success' | 'accent' | 'warning' | 'error' } | null {
  if (job) {
    switch (job.status) {
      case 'downloading':
        return {
          label: `${Math.round((job.pagesDone / Math.max(1, job.pagesTotal)) * 100)}%`,
          tone: 'accent',
        };
      case 'queued':
        return { label: 'Queued', tone: 'warning' };
      case 'paused':
        return { label: 'Paused', tone: 'warning' };
      case 'error':
        return { label: 'Failed', tone: 'error' };
      case 'done':
        return { label: 'Offline', tone: 'success' };
      default:
        break;
    }
  }
  if (saved) return { label: 'Offline', tone: 'success' };
  return null;
}

export { formatChapterNumber };

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dim: { ...type.body, color: colors.textDim },
  headerCard: { gap: spacing.md },
  headerRow: { flexDirection: 'row', gap: spacing.md },
  cover: { width: 92, height: 132, borderRadius: radius.md, backgroundColor: colors.input },
  title: { ...type.title, color: colors.text },
  meta: { ...type.small, color: colors.textDim, fontWeight: '400' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  synopsis: { ...type.body, color: colors.textDim, lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  blockLabel: {
    ...type.small,
    color: colors.textDim,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  hint: { ...type.small, color: colors.textFaint, marginTop: spacing.sm, fontWeight: '400' },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  selectionCount: { ...type.small, color: colors.textFaint },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    marginBottom: spacing.sm,
  },
  chapterSelected: { borderColor: colors.accent, backgroundColor: 'rgba(88, 166, 255, 0.08)' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  checkGlyph: { color: '#fff', fontSize: 13, fontWeight: '800' },
  chapterTitle: { ...type.body, color: colors.text, fontWeight: '600' },
  chapterMeta: { ...type.small, color: colors.textFaint, fontWeight: '400', marginTop: 2 },
  readButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.input,
  },
  readGlyph: { color: colors.accent, fontSize: 14, marginLeft: 2 },
});

import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatBytes, parseChapterSelection } from '../api/parse';
import { ChapterRow } from '../components/cards';
import { Icon } from '../components/icons';
import { Banner, Button, Chip, EmptyState, Segmented, TextField } from '../components/ui';
import { confirmAsync } from '../lib/confirm';
import { announce } from '../lib/motion';
import { Screen, useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, coverAspect, radius, spacing, type, useThemeName, makeStyles } from '../theme';
import type { Chapter, DownloadJob, MangaInfo, OutputFormat } from '../types';

type ChapterFilter = 'all' | 'saved' | 'missing' | 'queued';

const STATUS_TEXT: Record<DownloadJob['status'], string> = {
  queued: 'Queued',
  downloading: 'Downloading…',
  paused: 'Paused',
  done: 'Saved',
  error: 'Failed — tap to retry',
  canceled: 'Canceled',
};

export function MangaScreen({ mangaId }: { mangaId: string }) {
  useThemeName();
  const { mangaCache, library, jobs, config, loadingManga, actions } = useApp();
  const nav = useNav();

  const onlineManga = mangaCache[mangaId] ?? actions.getManga(mangaId);
  const entry = library.find((item) => item.mangaId === mangaId);

  /**
   * A series you downloaded is still a series without a connection. When the
   * network fetch fails we rebuild enough of it from the library — title, cover,
   * and the chapters sitting on disk — so the library tab can be browsed and read
   * in aeroplane mode instead of dead-ending on "Series not available".
   */
  const offlineManga = useMemo<MangaInfo | null>(() => {
    if (!entry) return null;
    const saved = Object.values(entry.chapters);
    if (saved.length === 0) return null;
    return {
      id: entry.mangaId,
      title: entry.title,
      mangaType: 'Downloaded',
      synopsis: entry.synopsis,
      coverUrl: entry.coverUrl,
      genres: [],
      authors: entry.authors,
      status: '',
      scanlators: [],
      groups: [],
      chapters: saved
        .sort((a, b) => a.chapterNumber - b.chapterNumber)
        .map((chapter) => ({
          id: chapter.chapterId,
          title: chapter.chapterTitle,
          number: chapter.chapterNumber,
          index: 0,
          pageCount: chapter.pageCount,
          scanlationMangaId: '',
        })),
    };
  }, [entry]);

  const manga = onlineManga ?? offlineManga;

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [range, setRange] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [chapterFilter, setChapterFilter] = useState<ChapterFilter>('all');
  /**
   * Tapping a row used to always select it for download, so actually reading a
   * chapter meant aiming at a small play button. The list now has a mode:
   * read (tap = open) or download (tap = tick).
   */
  const [rowMode, setRowMode] = useState<'read' | 'download'>('read');
  const [ascending, setAscending] = useState(true);
  // 'auto' follows the biggest group; anything else is an explicit pick, which
  // is remembered per series so re-opening a manga lands on the same group.
  const [groupChoice, setGroupChoice] = useState<string>(
    () => config.groupChoice[mangaId] ?? 'auto',
  );

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
  const groups = manga?.groups ?? [];

  /** Groups that actually posted chapters, plus the explicit "all" view. */
  const activeGroupId = useMemo(() => {
    if (groups.length === 0) return 'all';
    if (groupChoice === 'all') return 'all';
    if (groups.some((group) => group.id === groupChoice)) return groupChoice;
    return groups[0].id;
  }, [groupChoice, groups]);

  /** The chapter list before any downloaded/queued filtering. */
  const groupChapters = useMemo(() => {
    if (activeGroupId === 'all') return chapters;
    return chapters.filter(
      (chapter) => (chapter.groupId ?? chapter.group ?? '') === activeGroupId,
    );
  }, [activeGroupId, chapters]);

  const chooseGroup = useCallback(
    (id: string) => {
      setGroupChoice(id);
      setSelection(new Set());
      actions.updateConfig({ groupChoice: { ...config.groupChoice, [mangaId]: id } });
    },
    [actions, config.groupChoice, mangaId],
  );

  const savedIds = useMemo(() => new Set(Object.keys(entry?.chapters ?? {})), [entry?.chapters]);

  /** Reading order: oldest first by default, which is how you binge. */
  const orderedChapters = useMemo(
    () =>
      [...groupChapters].sort((a, b) =>
        ascending ? a.number - b.number : b.number - a.number,
      ),
    [ascending, groupChapters],
  );

  const queuedIds = useMemo(() => new Set(statusByChapter.keys()), [statusByChapter]);

  const visibleChapters = useMemo(() => {
    switch (chapterFilter) {
      case 'saved':
        return orderedChapters.filter((chapter) => savedIds.has(chapter.id));
      case 'missing':
        return orderedChapters.filter((chapter) => !savedIds.has(chapter.id));
      case 'queued':
        return orderedChapters.filter(
          (chapter) => queuedIds.has(chapter.id) && !savedIds.has(chapter.id),
        );
      default:
        return orderedChapters;
    }
  }, [chapterFilter, orderedChapters, queuedIds, savedIds]);

  const missingChapters = useMemo(
    () => orderedChapters.filter((chapter) => !savedIds.has(chapter.id)),
    [orderedChapters, savedIds],
  );

  const selectedChapters = useMemo(
    () => groupChapters.filter((chapter) => selection.has(chapter.id)),
    [groupChapters, selection],
  );

  /** Pages in the selection — a better size hint than a bare chapter count. */
  const selectedPages = useMemo(
    () => selectedChapters.reduce((sum, chapter) => sum + (chapter.pageCount || 0), 0),
    [selectedChapters],
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

  /** Selection changes get a tick of haptics and a spoken count. */
  const choose = useCallback((ids: string[], label: string) => {
    setSelection(new Set(ids));
    void Haptics.selectionAsync().catch(() => {});
    announce(
      ids.length === 0 ? 'Selection cleared' : `${label}: ${ids.length} chapter${ids.length === 1 ? '' : 's'} selected`,
    );
  }, []);

  const selectAll = useCallback(
    () => choose(visibleChapters.map((chapter) => chapter.id), 'All'),
    [choose, visibleChapters],
  );
  const clearSelection = useCallback(() => choose([], 'None'), [choose]);

  const unreadChapters = useMemo(() => {
    const maybe = (chapter: Chapter) => !savedIds.has(chapter.id) && !queuedIds.has(chapter.id);
    return visibleChapters.filter(maybe);
  }, [queuedIds, savedIds, visibleChapters]);

  const selectUnread = useCallback(
    () => choose(unreadChapters.map((chapter) => chapter.id), 'Unread'),
    [choose, unreadChapters],
  );

  /** Every chapter that isn't on the device yet — one tap for a whole back catalogue. */
  const selectMissing = useCallback(
    () => choose(missingChapters.map((chapter) => chapter.id), 'Missing'),
    [choose, missingChapters],
  );

  const applyRange = useCallback(() => {
    if (!range.trim()) return;
    // Ranges follow the on-screen order, so "1-10" always means chapters 1 to 10.
    const indices = parseChapterSelection(range, orderedChapters.length);
    if (indices.length === 0) {
      setMessage('That selection matched no chapters. Try “1-10” or “1,3,5-7”.');
      return;
    }
    setSelection(new Set(indices.map((index) => orderedChapters[index].id)));
    setMessage(null);
  }, [orderedChapters, range]);

  /** Newest-first is what you want most of the time, so offer it as a shortcut. */
  const selectLatest = useCallback(
    (count: number) => {
      const sorted = [...groupChapters].sort((a, b) => b.number - a.number).slice(0, count);
      setSelection(new Set(sorted.map((chapter) => chapter.id)));
    },
    [groupChapters],
  );

  /** Long-press a downloaded chapter to free the space it takes. */
  const deleteDownload = useCallback(
    async (chapterId: string) => {
      const saved = entry?.chapters?.[chapterId];
      if (!saved) return;
      const ok = await confirmAsync(
        `Delete “${saved.chapterTitle}”?`,
        'The pages are removed from this device. Reading it again will stream from atsu.moe.',
        'Delete',
      );
      if (!ok) return;
      await actions.deleteChapter(mangaId, chapterId);
      setMessage(`${saved.chapterTitle} deleted from this device.`);
    },
    [actions, entry?.chapters, mangaId],
  );

  const startDownload = useCallback(() => {
    if (!manga) return;
    // One format, chosen for the user: a single CBZ per chapter.
    const count = actions.enqueue(manga, selectedChapters, 'cbz');
    if (count === 0) {
      setMessage('Those chapters are already downloaded or in progress.');
      return;
    }
    setSelection(new Set());
    nav.go('shelf', { shelfTab: 'downloads' });
  }, [actions, manga, nav, selectedChapters]);

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
        rowMode === 'download' ? (
          <View style={styles.footerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.footerCount}>
                {selection.size > 0 ? `${selection.size} selected` : 'Nothing selected'}
              </Text>
              <Text style={styles.footerHint}>
                {selection.size > 0
                  ? `${selectedPages} pages · CBZ · stays on this device`
                  : 'Tap chapters, or use a range'}
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
        ) : undefined
      }
    >
      <View style={{ flex: 1 }}>
      <FlatList
        data={visibleChapters}
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
                <Text style={styles.heroTitle} numberOfLines={4}>
                  {manga.title}
                </Text>
                <Text style={styles.heroSub} numberOfLines={2}>
                  {[manga.mangaType, manga.status].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>

            {/* atsu's tag pills: rounded rectangles, wrapping across rows. */}
            {manga.genres.length > 0 ? (
              <View style={styles.genreRow}>
                {manga.genres.slice(0, 6).map((genre) => (
                  <View key={genre} style={styles.genrePill}>
                    <Text style={styles.genreText}>{genre}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Stats line, like "☆ 6.7/10 · 👁 120.4K views · 📖 233 chapters". */}
            <View style={styles.statsRow}>
              <Icon name="albums-outline" size={15} color={colors.textDim} />
              <Text style={styles.statsText}>{chapters.length} chapters</Text>
              <Text style={styles.statsDot}>·</Text>
              <Icon name="download-outline" size={15} color={colors.textDim} />
              <Text style={styles.statsText}>
                {offlineCount > 0 ? `${offlineCount} offline · ${formatBytes(offlineBytes)}` : 'none offline'}
              </Text>
              {manga.demo ? (
                <>
                  <Text style={styles.statsDot}>·</Text>
                  <View style={styles.demoPill}>
                    <Text style={styles.demoPillText}>DEMO</Text>
                  </View>
                </>
              ) : null}
            </View>

            {manga.authors.length > 0 ? (
              <View style={styles.infoGrid}>
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>TYPE</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>
                    {manga.mangaType || '—'}
                  </Text>
                </View>
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>STATUS</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>
                    {manga.status || '—'}
                  </Text>
                </View>
                <View style={styles.infoCell}>
                  <Text style={styles.infoLabel}>AUTHOR</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>
                    {manga.authors.join(', ')}
                  </Text>
                </View>
              </View>
            ) : null}

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

            {rowMode === 'download' ? (
            <View style={styles.controlCard}>
              <View style={styles.controlRow}>
                <TextField
                  value={range}
                  onChangeText={setRange}
                  placeholder="Range · 1-10"
                  icon="list-outline"
                  onSubmit={applyRange}
                  style={{ flex: 1 }}
                />
                <Button label="Apply" size="sm" onPress={applyRange} />
              </View>

              {/* Every shortcut says how much it would pick, and lights up when
                  the current selection is exactly that set. */}
              <View style={styles.quickRow}>
                <Chip
                  label={`All ${visibleChapters.length}`}
                  icon="checkmark-done"
                  active={
                    visibleChapters.length > 0 &&
                    visibleChapters.every((chapter) => selection.has(chapter.id))
                  }
                  onPress={selectAll}
                />
                <Chip
                  label={`Missing ${missingChapters.length}`}
                  icon="cloud-download-outline"
                  active={
                    missingChapters.length > 0 &&
                    missingChapters.every((chapter) => selection.has(chapter.id))
                  }
                  onPress={selectMissing}
                />
                <Chip
                  label={`Unread ${unreadChapters.length}`}
                  icon="ellipse-outline"
                  active={
                    unreadChapters.length > 0 &&
                    unreadChapters.every((chapter) => selection.has(chapter.id))
                  }
                  onPress={selectUnread}
                />
                <Chip label="Latest 5" icon="sparkles-outline" onPress={() => selectLatest(5)} />
                <Chip label="Clear" icon="close" onPress={clearSelection} />
              </View>

            </View>
            ) : null}

            {groups.length > 1 ? (
              <View style={styles.groupBlock}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupTitle}>Scanlation group</Text>
                  <Text style={styles.groupHint}>
                    {activeGroupId === 'all'
                      ? 'Showing every group'
                      : `Downloads use ${groups.find((group) => group.id === activeGroupId)?.name ?? 'this group'}`}
                  </Text>
                </View>
                <View style={styles.groupRow}>
                  <Chip
                    label={`All ${chapters.length}`}
                    active={activeGroupId === 'all'}
                    onPress={() => chooseGroup('all')}
                  />
                  {groups.map((group) => (
                    <Chip
                      key={group.id}
                      label={`${group.name} ${group.chapterCount}`}
                      active={activeGroupId === group.id}
                      onPress={() => chooseGroup(group.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>
                Chapters
                <Text style={styles.listHeaderCount}>  {visibleChapters.length}</Text>
              </Text>
              <Pressable
                onPress={() => setAscending((value) => !value)}
                accessibilityRole="button"
                accessibilityLabel="Toggle chapter order"
                hitSlop={8}
                style={({ pressed }) => [styles.sortButton, pressed && { opacity: 0.6 }]}
              >
                <Icon name={ascending ? 'arrow-up' : 'arrow-down'} size={13} color={colors.textDim} />
                <Text style={styles.listHeaderMeta}>
                  {ascending ? 'Oldest first' : 'Newest first'}
                </Text>
              </Pressable>
            </View>

            <Segmented
              value={rowMode}
              onChange={(next) => {
                setRowMode(next);
                if (next === 'read') setSelection(new Set());
              }}
              options={[
                { key: 'read', label: 'Read' },
                { key: 'download', label: 'Download' },
              ]}
              style={{ marginTop: spacing.lg }}
            />

            <View style={styles.filterRow}>
              <Segmented
                value={chapterFilter}
                onChange={setChapterFilter}
                options={[
                  { key: 'all', label: 'All' },
                  { key: 'missing', label: `Unread ${missingChapters.length}` },
                  { key: 'saved', label: `Read ${savedIds.size}` },
                  { key: 'queued', label: `Queue ${queuedIds.size}` },
                ]}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <ChapterRow
            chapter={item}
            mode={rowMode}
            selected={selection.has(item.id)}
            status={statusByChapter.get(item.id) ?? null}
            saved={Boolean(entry?.chapters?.[item.id])}
            groupLabel={
              groups.length > 1 && activeGroupId === 'all' ? (item.group ?? null) : null
            }
            onPress={rowMode === 'download' ? toggle : openReader}
            onLongPress={entry?.chapters?.[item.id] ? deleteDownload : undefined}
          />
        )}
        onScrollBeginDrag={() => setMessage(null)}
        ListEmptyComponent={
          chapterFilter === 'all' ? (
            <EmptyState
              icon="albums-outline"
              title="No chapters listed"
              body="atsu.moe returned this series without a chapter list. Pull it up again in a moment, or check the link."
            />
          ) : (
            <EmptyState
              icon="funnel-outline"
              title="Nothing in this filter"
              body={
                chapterFilter === 'saved'
                  ? 'You have no downloaded chapters for this series yet.'
                  : chapterFilter === 'queued'
                    ? 'No chapters are queued or downloading right now.'
                    : 'Every chapter of this series is already on your device.'
              }
              action="Show all chapters"
              onAction={() => setChapterFilter('all')}
            />
          )
        }
        ListFooterComponent={
          chapters.length > 0 ? (
            <Text style={styles.footerNote}>
              {visibleChapters.length} of {groupChapters.length} chapters shown · numbered as atsu.moe
              lists them
            </Text>
          ) : undefined
        }
      />

      {/* Messages used to live in the list header, so you had to scroll up to
          read them. They now float over the list, always in view. */}
      {message ? (
        <View style={styles.toast} pointerEvents="box-none">
          <Banner tone="info" onDismiss={() => setMessage(null)}>
            {message}
          </Banner>
        </View>
      ) : null}
      </View>
    </Screen>
  );
}

const styles = makeStyles((colors) => ({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  dim: { ...type.body, color: colors.textDim },
  hero: { flexDirection: 'row', gap: spacing.lg, paddingTop: spacing.lg, alignItems: 'center' },
  cover: {
    width: 116,
    height: 116 / coverAspect,
    borderRadius: radius.md,
    backgroundColor: colors.input,
  },
  heroBody: { flex: 1, gap: 6, justifyContent: 'center' },
  heroTitle: { ...type.display, color: colors.text, fontSize: 29, lineHeight: 34 },
  heroSub: { ...type.small, color: colors.textDim, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  genrePill: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
  },
  genreText: { ...type.body, color: colors.text, fontWeight: '500', fontSize: 15 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: spacing.lg,
  },
  statsText: { ...type.body, color: colors.textDim, fontWeight: '500', fontSize: 15 },
  statsDot: { ...type.body, color: colors.textFaint, fontSize: 15 },
  demoPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: colors.warningSoft,
  },
  demoPillText: { ...type.tiny, color: colors.warning, fontSize: 10, letterSpacing: 0.6 },
  infoGrid: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  infoCell: { flexShrink: 1, gap: 4 },
  infoLabel: { ...type.tiny, color: colors.textFaint, fontWeight: '700', letterSpacing: 0.7 },
  infoValue: { ...type.small, color: colors.text, fontWeight: '500', fontSize: 15 },
  heroActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  synopsis: {
    ...type.body,
    color: colors.textDim,
    fontWeight: '400',
    fontSize: 16,
    lineHeight: 25,
    marginTop: spacing.xl,
  },
  // No translucent rectangle around the download tools any more: a hairline and
  // spacing group them without boxing the screen in.
  controlCard: {
    paddingVertical: spacing.md,
    marginTop: spacing.md,
    gap: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
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
  groupBlock: { marginTop: spacing.xl, gap: spacing.sm },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  groupTitle: { ...type.subtitle, color: colors.text, fontSize: 15 },
  groupHint: { ...type.tiny, color: colors.textFaint, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  listHeaderText: { ...type.section, color: colors.text },
  listHeaderCount: { ...type.section, color: colors.textFaint, fontWeight: '600' },
  listHeaderMeta: { ...type.tiny, color: colors.textFaint, fontWeight: '600' },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filterRow: { paddingBottom: spacing.md },
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.md,
  },
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
}));

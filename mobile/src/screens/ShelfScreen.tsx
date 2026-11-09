import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { formatEta, formatSpeed } from '../api/parse';
import { JobRow, SeriesCard } from '../components/cards';
import { Banner, Button, EmptyState, Segmented } from '../components/ui';
import { confirmAsync } from '../lib/confirm';
import * as storage from '../lib/storage';
import { Screen, useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, spacing, type, useThemeName, makeStyles } from '../theme';
import type { DownloadJob, LibraryEntry } from '../types';

type Segment = 'library' | 'downloads';
type Filter = 'all' | 'reading' | 'offline';

const GUTTER = spacing.lg;
const GAP = spacing.md;

export function ShelfScreen({ initialTab }: { initialTab?: Segment }) {
  useThemeName();
  const { library, jobs, actions } = useApp();
  const nav = useNav();
  const { width } = useWindowDimensions();
  const [segment, setSegment] = useState<Segment>(initialTab ?? 'library');
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const cardWidth = Math.max(120, (width - GUTTER * 2 - GAP) / 2);

  const activeCount = useMemo(
    () => jobs.filter((job) => ['queued', 'downloading', 'paused'].includes(job.status)).length,
    [jobs],
  );

  /** Aggregate throughput across every chapter downloading right now. */
  const throughput = useMemo(() => {
    const running = jobs.filter((job) => job.status === 'downloading');
    const pps = running.reduce((sum, job) => sum + (job.pagesPerSecond ?? 0), 0);
    const remaining = running.reduce(
      (sum, job) => sum + Math.max(0, job.pagesTotal - job.pagesDone),
      0,
    );
    return { pps, eta: pps > 0.01 ? remaining / pps : null, running: running.length };
  }, [jobs]);

  const visibleLibrary = useMemo(() => {
    const entries = [...library].sort((a, b) => {
      const aTime = a.reading?.updatedAt ?? Math.max(a.addedAt, ...chapterTimes(a));
      const bTime = b.reading?.updatedAt ?? Math.max(b.addedAt, ...chapterTimes(b));
      return bTime - aTime;
    });
    if (filter === 'reading') return entries.filter((entry) => entry.reading);
    if (filter === 'offline') return entries.filter((entry) => Object.keys(entry.chapters).length > 0);
    return entries;
  }, [library, filter]);

  const openManga = useCallback((mangaId: string) => nav.push({ name: 'manga', mangaId }), [nav]);

  const confirmRemove = useCallback(
    async (mangaId: string) => {
      const entry = library.find((item) => item.mangaId === mangaId);
      if (!entry) return;
      const ok = await confirmAsync(
        `Remove “${entry.title}”?`,
        'The downloaded chapters for this series are deleted from this device.',
        'Remove',
      );
      if (ok) await actions.removeFromLibrary(entry.mangaId);
    },
    [actions, library],
  );

  /** Deleting a finished download removes the pages, not just the queue row. */
  const confirmDeleteDownload = useCallback(
    async (id: string) => {
      const job = jobs.find((item) => item.id === id);
      if (!job) return;
      const ok = await confirmAsync(
        `Delete “${job.chapterTitle}”?`,
        'The downloaded pages are removed from this device. The chapter stays in the series, so you can download it again.',
        'Delete',
      );
      if (!ok) return;
      await actions.deleteChapter(job.mangaId, job.chapterId);
      actions.removeJob(job.id);
    },
    [actions, jobs],
  );

  const downloads = useMemo(
    () =>
      [...jobs].sort((a, b) => {
        const rank = (job: DownloadJob) =>
          job.status === 'downloading' ? 0 : job.status === 'queued' ? 1 : job.status === 'paused' ? 2 : 3;
        return rank(a) - rank(b) || b.createdAt - a.createdAt;
      }),
    [jobs],
  );

  /** Hand a finished archive to the share sheet / photo library. */
  const handleExport = useCallback(async (id: string) => {
    const job = jobs.find((entry) => entry.id === id);
    if (!job) return;
    try {
      if (!job.outputPath) throw new Error('Nothing saved for this chapter yet');
      if (job.format === 'images') {
        const files = await storage.listDir(job.outputPath);
        const saved = await storage.saveImagesToGallery(files.map((file) => file.path));
        setMessage(`Saved ${saved} page${saved === 1 ? '' : 's'} to your photo library.`);
        return;
      }
      await storage.exportFile(job.outputPath, {
        dialogTitle: `${job.mangaTitle} — chapter ${job.chapterNumber}`,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [jobs]);

  const offlineChapters = useMemo(
    () => library.reduce((sum, entry) => sum + Object.keys(entry.chapters).length, 0),
    [library],
  );

  const pauseAll = useCallback(() => actions.pauseAll(), [actions]);
  const resumeAll = useCallback(() => actions.resumeAll(), [actions]);
  const clearFinished = useCallback(() => actions.clearFinishedJobs(), [actions]);

  return (
    <Screen
      title="Your Bookmarks"
      subtitle={
        segment === 'library'
          ? `${library.length} series · ${offlineChapters} chapter${
              offlineChapters === 1 ? '' : 's'
            } offline`
          : `${activeCount} in progress · ${jobs.length} total`
      }
    >
      <View style={styles.segmentWrap}>
        <Segmented<Segment>
          options={[
            { key: 'library', label: 'Library', icon: 'albums-outline' },
            {
              key: 'downloads',
              label: activeCount > 0 ? `Downloads · ${activeCount}` : 'Downloads',
              icon: 'arrow-down-circle-outline',
            },
          ]}
          value={segment}
          onChange={setSegment}
        />
      </View>

      {message ? (
        <View style={{ paddingHorizontal: GUTTER }}>
          <Banner tone="info" onDismiss={() => setMessage(null)}>
            {message}
          </Banner>
        </View>
      ) : null}

      {segment === 'library' ? (
        <FlatList
          key="library"
          data={visibleLibrary}
          keyExtractor={(entry) => entry.mangaId}
          numColumns={2}
          columnWrapperStyle={visibleLibrary.length > 0 ? styles.column : undefined}
          contentContainerStyle={styles.content}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={40}
          windowSize={5}
          removeClippedSubviews
          renderItem={({ item }) => (
            <SeriesCard
              entry={item}
              width={cardWidth}
              onPress={openManga}
              onLongPress={confirmRemove}
            />
          )}
          ListHeaderComponent={
            library.length > 0 ? (
              <View style={styles.filterRow}>
                <Segmented<Filter>
                  options={[
                    { key: 'all', label: `All ${library.length}` },
                    { key: 'reading', label: 'Reading' },
                    { key: 'offline', label: 'Offline' },
                  ]}
                  value={filter}
                  onChange={setFilter}
                />
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState
              icon="bookmark-outline"
              title="Nothing saved yet"
              body="Series you load from Search appear here, with your reading progress and offline chapters."
              action="Add a series"
              onAction={() => nav.go('search')}
            />
          }
          ListFooterComponent={
            visibleLibrary.length > 0 ? (
              <Text style={styles.hint}>Tap a cover to open it · long-press to remove it</Text>
            ) : undefined
          }
        />
      ) : (
        <FlatList
          key="downloads"
          data={downloads}
          keyExtractor={(job) => job.id}
          contentContainerStyle={styles.content}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          renderItem={({ item }) => (
            <JobRow
              job={item}
              onPause={actions.pauseJob}
              onResume={actions.resumeJob}
              onCancel={actions.cancelJob}
              onRetry={actions.retryJob}
              onRemove={actions.removeJob}
              onDelete={confirmDeleteDownload}
              onExport={handleExport}
            />
          )}
          ListHeaderComponent={
            downloads.length > 0 ? (
              <View>
                <View style={styles.queueBar}>
                  <Button label="Pause all" size="sm" icon="pause" onPress={pauseAll} />
                  <Button label="Resume all" size="sm" icon="play" onPress={resumeAll} />
                  <Button
                    label="Clear finished"
                    size="sm"
                    variant="ghost"
                    onPress={clearFinished}
                  />
                </View>
                {throughput.running > 0 ? (
                  <Text style={styles.throughput}>
                    {throughput.running} chapter{throughput.running === 1 ? '' : 's'} downloading
                    {formatSpeed(throughput.pps) ? ` · ${formatSpeed(throughput.pps)}` : ''}
                    {formatEta(throughput.eta) ? ` · about ${formatEta(throughput.eta)}` : ''}
                  </Text>
                ) : null}
              </View>
            ) : undefined
          }
          ListEmptyComponent={
            <EmptyState
              icon="arrow-down-circle-outline"
              title="No downloads"
              body="Select chapters on a series page and they queue up here. Downloads resume where they stopped if you close the app."
              action="Browse your shelf"
              onAction={() => setSegment('library')}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.jobSeparator} />}
        />
      )}
    </Screen>
  );
}

/** Timestamps of a series' saved chapters, for shelf sorting. */
function chapterTimes(entry: LibraryEntry): number[] {
  const values = Object.values(entry.chapters).map((chapter) => chapter.updatedAt);
  return values.length > 0 ? values : [0];
}

const styles = makeStyles((colors) => ({
  segmentWrap: { paddingHorizontal: GUTTER, paddingBottom: spacing.md },
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing.xxxl },
  column: { gap: GAP, justifyContent: 'space-between' },
  filterRow: { paddingVertical: spacing.md },
  hint: {
    ...type.tiny,
    color: colors.textFaint,
    fontWeight: '500',
    textAlign: 'center',
    paddingTop: spacing.xl,
  },
  throughput: {
    ...type.tiny,
    color: colors.accent,
    fontWeight: '600',
    paddingBottom: spacing.sm,
  },
  queueBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    flexWrap: 'wrap',
  },
  jobSeparator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 66 },
}));

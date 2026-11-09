import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { formatRelativeTime } from '../api/parse';
import { JobRow, RailCard, SeriesCard } from '../components/cards';
import { Icon } from '../components/icons';
import { Banner, EmptyState, SectionHeader } from '../components/ui';
import { Screen, useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, radius, spacing, type } from '../theme';
import type { LibraryEntry } from '../types';

const GUTTER = spacing.lg;
const GAP = spacing.md;

export function HomeScreen() {
  const { library, jobs, config, lastError, loadingManga, actions } = useApp();
  const nav = useNav();
  const { width } = useWindowDimensions();

  const cardWidth = Math.max(120, (width - GUTTER * 2 - GAP) / 2);
  const railWidth = Math.min(132, Math.max(104, width * 0.29));

  const activeJobs = useMemo(
    () => jobs.filter((job) => ['queued', 'downloading', 'paused'].includes(job.status)),
    [jobs],
  );

  const continueReading = useMemo(
    () =>
      library
        .filter((entry) => entry.reading)
        .sort((a, b) => (b.reading?.updatedAt ?? 0) - (a.reading?.updatedAt ?? 0))
        .slice(0, 10),
    [library],
  );

  const openManga = useCallback(
    (mangaId: string) => nav.push({ name: 'manga', mangaId }),
    [nav],
  );

  const openReader = useCallback(
    (mangaId: string) => {
      const entry = library.find((item) => item.mangaId === mangaId);
      if (entry?.reading) {
        nav.push({ name: 'reader', mangaId, chapterId: entry.reading.chapterId });
      } else {
        nav.push({ name: 'manga', mangaId });
      }
    },
    [library, nav],
  );

  const gotoSearch = useCallback(() => nav.go('search'), [nav]);
  const gotoDownloads = useCallback(() => nav.go('shelf'), [nav]);

  const railMeta = useCallback((entry: LibraryEntry) => {
    if (entry.reading) {
      return `Page ${entry.reading.page}/${entry.reading.total}`;
    }
    const offline = Object.keys(entry.chapters).length;
    return offline > 0 ? `${offline} offline` : `${entry.chapterCount} chapters`;
  }, []);

  return (
    <Screen
      brand
      showTabs
      right={
        <Pressable
          onPress={gotoDownloads}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={
            activeJobs.length > 0 ? `${activeJobs.length} downloads in progress` : 'Downloads'
          }
          style={({ pressed }) => [styles.queueButton, pressed && { opacity: 0.6 }]}
        >
          <Icon
            name={activeJobs.length > 0 ? 'arrow-down-circle' : 'arrow-down-circle-outline'}
            size={23}
            color={activeJobs.length > 0 ? colors.accent : colors.text}
          />
          {activeJobs.length > 0 ? (
            <View style={styles.queueBadge}>
              <Text style={styles.queueBadgeText}>{activeJobs.length}</Text>
            </View>
          ) : null}
        </Pressable>
      }
    >
      <FlatList
        data={library}
        keyExtractor={(entry) => entry.mangaId}
        numColumns={2}
        columnWrapperStyle={library.length > 0 ? styles.column : undefined}
        contentContainerStyle={styles.content}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={40}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item }) => (
          <SeriesCard entry={item} width={cardWidth} onPress={openManga} />
        )}
        ListHeaderComponent={
          <View>
            <Pressable
              onPress={gotoSearch}
              accessibilityRole="button"
              accessibilityLabel="Search manga or paste a link"
              style={({ pressed }) => [styles.searchPill, pressed && { opacity: 0.8 }]}
            >
              <Icon name="search" size={17} color={colors.textFaint} />
              <Text style={styles.searchPillText}>Search manga or paste a link</Text>
              {loadingManga ? (
                <Text style={[styles.searchPillText, { color: colors.accent }]}>Loading…</Text>
              ) : null}
            </Pressable>

            {lastError ? <Banner onDismiss={actions.clearError}>{lastError}</Banner> : null}

            {continueReading.length > 0 ? (
              <>
                <SectionHeader
                  title="Jump back in"
                  action="Shelf"
                  onAction={() => nav.go('shelf')}
                />
                <FlatList
                  horizontal
                  data={continueReading}
                  keyExtractor={(entry) => entry.mangaId}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                  initialNumToRender={4}
                  maxToRenderPerBatch={4}
                  windowSize={3}
                  removeClippedSubviews
                  renderItem={({ item }) => (
                    <RailCard
                      mangaId={item.mangaId}
                      title={item.title}
                      coverUrl={item.coverUrl}
                      meta={railMeta(item)}
                      width={railWidth}
                      progress={
                        item.reading
                          ? { value: item.reading.page, total: Math.max(1, item.reading.total) }
                          : undefined
                      }
                      onPress={openReader}
                    />
                  )}
                />
              </>
            ) : null}

            {activeJobs.length > 0 ? (
              <>
                <SectionHeader
                  title="Downloading"
                  action="Open queue"
                  onAction={gotoDownloads}
                />
                <View style={styles.jobCard}>
                  {activeJobs.slice(0, 3).map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      onPause={actions.pauseJob}
                      onResume={actions.resumeJob}
                      onCancel={actions.cancelJob}
                      onRetry={actions.retryJob}
                      onRemove={actions.removeJob}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {library.length > 0 ? (
              <SectionHeader
                title="Your shelf"
                action="See all"
                onAction={() => nav.go('shelf')}
              />
            ) : null}

            {library.length === 0 ? (
              <View style={styles.emptyWrap}>
                <EmptyState
                  icon="library-outline"
                  title="Your shelf is empty"
                  body={
                    config.demoMode
                      ? 'Demo mode is on. Open Search to load one of the bundled series and try the queue, reader and exports.'
                      : 'Paste an atsu.moe link in Search to add a series, download chapters, and read them offline.'
                  }
                  action="Find something to read"
                  onAction={gotoSearch}
                />
              </View>
            ) : null}

            {library.length > 0 ? (
              <View style={styles.recentRow}>
                <Text style={styles.recentText}>
                  {library.length} series ·{' '}
                  {library.reduce((sum, entry) => sum + Object.keys(entry.chapters).length, 0)}{' '}
                  chapters offline
                  {library.length > 0
                    ? ` · updated ${formatRelativeTime(
                        Math.max(...library.map((entry) => entry.addedAt)),
                      )}`
                    : ''}
                </Text>
              </View>
            ) : null}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing.xxxl },
  column: { gap: GAP, justifyContent: 'space-between' },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  searchPillText: { ...type.body, color: colors.textFaint, flex: 1 },
  rail: { gap: spacing.md, paddingRight: spacing.lg },
  jobCard: { backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: spacing.xs },
  emptyWrap: { marginTop: spacing.xxl },
  recentRow: { paddingTop: spacing.xl },
  recentText: { ...type.tiny, color: colors.textFaint, fontWeight: '500' },
  queueButton: { padding: spacing.xs },
  queueBadge: {
    position: 'absolute',
    top: -3,
    right: -6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueBadgeText: { color: colors.onAccent, fontSize: 9, fontWeight: '800' },
});

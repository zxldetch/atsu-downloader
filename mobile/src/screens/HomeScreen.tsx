import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, Text, View, useWindowDimensions } from 'react-native';

import { formatChapterNumber, formatRelativeTime } from '../api/parse';
import { ContinueRow, JobRow, SeriesCard } from '../components/cards';
import { Icon } from '../components/icons';
import { UpdateNotice, useUpdateCheck } from '../components/UpdateNotice';
import { Banner, EmptyState, SectionHeader } from '../components/ui';
import { Screen, useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, radius, spacing, type, useThemeName, makeStyles } from '../theme';
import type { LibraryEntry } from '../types';

const GUTTER = spacing.lg;
const GAP = spacing.md;

export function HomeScreen() {
  useThemeName();
  const { library, jobs, config, lastError, loadingManga, actions } = useApp();
  const nav = useNav();
  const { width } = useWindowDimensions();
  const updates = useUpdateCheck();

  const cardWidth = Math.max(120, (width - GUTTER * 2 - GAP) / 2);


  const activeJobs = useMemo(
    () => jobs.filter((job) => ['queued', 'downloading', 'paused'].includes(job.status)),
    [jobs],
  );

  /**
   * "2 series · 1 chapter offline · updated 1m ago".
   *
   * The timestamp used to be the newest `addedAt`, which says when a series was
   * added rather than when anything happened; last activity is the reading
   * position, a download, or the add date, whichever is newest.
   */
  const shelfSummary = useMemo(() => {
    const chapters = library.reduce((sum, entry) => sum + Object.keys(entry.chapters).length, 0);

    let lastActivity = 0;
    for (const entry of library) {
      lastActivity = Math.max(lastActivity, entry.addedAt ?? 0, entry.reading?.updatedAt ?? 0);
      for (const chapter of Object.values(entry.chapters)) {
        lastActivity = Math.max(lastActivity, chapter.updatedAt ?? 0);
      }
    }

    const parts = [`${library.length} series`];
    // "0 chapters offline" is noise — say nothing until something is saved.
    if (chapters > 0) parts.push(`${chapters} chapter${chapters === 1 ? '' : 's'} offline`);
    if (lastActivity > 0) parts.push(`updated ${formatRelativeTime(lastActivity)}`);
    return parts.join(' · ');
  }, [library]);

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

  /** atsu puts the chapter + percentage above the title, timestamp on the right. */
  const continueLabel = useCallback((entry: LibraryEntry) => {
    const reading = entry.reading;
    if (!reading) return `${entry.chapterCount} chapters`;
    const number = reading.chapterId.match(/(?:ch|chapter)[-_]?([\d.]+)/i)?.[1];
    const percent = Math.round((reading.page / Math.max(1, reading.total)) * 100);
    return `Ch. ${number ? formatChapterNumber(Number(number)) : '?'} · ${percent}%`;
  }, []);

  return (
    <Screen
      brand
      showTabs
      right={
        <>
          <Pressable
            onPress={gotoSearch}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open search"
            style={({ pressed }) => [styles.queueButton, pressed && { opacity: 0.6 }]}
          >
            <Icon name="search" size={22} color={colors.text} />
          </Pressable>
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
        </>
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

            {updates.state?.update ? (
              <UpdateNotice
                state={updates.state}
                checking={updates.checking}
                onCheck={() => void updates.check()}
              />
            ) : null}

            {lastError ? <Banner onDismiss={actions.clearError}>{lastError}</Banner> : null}

            {continueReading.length > 0 ? (
              <>
                <SectionHeader
                  title="Continue Reading"
                  onAction={() => nav.go('shelf')}
                />
                {continueReading.slice(0, 4).map((entry) => (
                  <ContinueRow
                    key={entry.mangaId}
                    mangaId={entry.mangaId}
                    title={entry.title}
                    coverUrl={entry.coverUrl}
                    label={continueLabel(entry)}
                    time={formatRelativeTime(entry.reading?.updatedAt ?? entry.addedAt)}
                    progress={
                      entry.reading
                        ? { value: entry.reading.page, total: Math.max(1, entry.reading.total) }
                        : undefined
                    }
                    onPress={openReader}
                  />
                ))}
                <Pressable
                  onPress={() => nav.go('shelf')}
                  accessibilityRole="button"
                  accessibilityLabel="See all continue reading"
                  style={({ pressed }) => [styles.seeAll, pressed && { backgroundColor: colors.input }]}
                >
                  <Text style={styles.seeAllText}>See all</Text>
                  <Icon name="chevron-forward" size={16} color={colors.text} />
                </Pressable>
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
                subtitle={shelfSummary}
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

          </View>
        }
      />
    </Screen>
  );
}

const styles = makeStyles((colors) => ({
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing.xxxl },
  column: { gap: GAP, justifyContent: 'space-between' },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  searchPillText: { ...type.body, color: colors.textFaint, flex: 1 },
  rail: { gap: spacing.md, paddingRight: spacing.lg },
  jobCard: { backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: spacing.xs },
  emptyWrap: { marginTop: spacing.xxl },
  queueButton: { padding: spacing.xs },
  queueBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 24,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.accentText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueBadgeText: { color: '#1A1430', fontSize: 11, fontWeight: '800' },
  seeAll: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    marginTop: spacing.xs,
  },
  seeAllText: { ...type.subtitle, color: colors.text, fontSize: 15 },
}));

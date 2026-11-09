import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pageImageUrl } from '../api/client';
import { chapterLabel } from '../api/parse';
import { Icon } from '../components/icons';
import { ReaderSheet } from '../components/ReaderSheet';
import { Slider } from '../components/Slider';
import { Button } from '../components/ui';
import * as storage from '../lib/storage';
import { useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, makeStyles, radius, spacing, type } from '../theme';

interface ReaderPage {
  key: string;
  uri: string;
  aspect: number;
}

/**
 * The reader renders through a virtualised list in both modes.
 *
 * The first version mapped every page into a ScrollView, so a 60-page chapter
 * decoded 60 full-resolution images before the first one appeared — the single
 * biggest cause of the jank. Now only a few pages exist at a time, heights are
 * known up front so scrolling stays at 60fps, and the next two pages are
 * prefetched into the image cache.
 */
export function ReaderScreen({ mangaId, chapterId }: { mangaId: string; chapterId: string }) {
  const { mangaCache, library, config, actions } = useApp();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const manga = mangaCache[mangaId] ?? actions.getManga(mangaId);
  const chapter = manga?.chapters.find((entry) => entry.id === chapterId);
  const entry = library.find((item) => item.mangaId === mangaId);

  const [pages, setPages] = useState<ReaderPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'offline' | 'network'>('network');
  const [mode, setMode] = useState<'vertical' | 'paged'>(config.readerMode);
  const [chrome, setChrome] = useState(true);
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [autoScrollOn, setAutoScrollOn] = useState(config.autoScroll);
  const [scrubbing, setScrubbing] = useState(false);
  const offsetRef = useRef(0);
  const pausedUntil = useRef(0);
  const advancedRef = useRef(false);
  const listRef = useRef<FlatList<ReaderPage>>(null);
  const startedAt = useRef(
    entry?.reading?.chapterId === chapterId ? Math.max(0, (entry?.reading?.page ?? 1) - 1) : 0,
  );

  const load = useCallback(async () => {
    if (!manga) return;
    setLoading(true);
    setError(null);

    try {
      const dir = storage.chapterDir(mangaId, chapterId);
      const files = await storage.listDir(dir);

      if (files.length > 0) {
        const resolved: ReaderPage[] = [];
        for (const file of files) {
          resolved.push({ key: file.path, uri: await storage.uriFor(file.path), aspect: 0.7 });
        }
        setPages(resolved);
        setSource('offline');
        setLoading(false);
        return;
      }

      const remote = await actions.chapterPages(manga, {
        id: chapterId,
        title: chapter?.title ?? '',
        number: chapter?.number ?? 0,
        index: chapter?.index ?? 0,
        pageCount: chapter?.pageCount ?? 0,
        scanlationMangaId: '',
      });

      setPages(
        remote.map((page) => ({
          key: page.id,
          uri: pageImageUrl(page),
          aspect:
            page.aspectRatio || (page.width && page.height ? page.width / page.height : 0.7),
        })),
      );
      setSource('network');
      setLoading(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, chapterId, mangaId, manga?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pages.length === 0) return;
    actions.saveReadingProgress(mangaId, chapterId, index + 1, pages.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pages.length, chapterId, mangaId]);

  useEffect(() => {
    if (!config.keepScreenAwake) return;
    void activateKeepAwakeAsync().catch(() => {});
    return () => {
      try {
        deactivateKeepAwake();
      } catch {
        // Expo Go on web has no keep-awake; ignoring is correct.
      }
    };
  }, [config.keepScreenAwake]);

  // Warm the next couple of pages so a flick doesn't land on a blank frame.
  useEffect(() => {
    if (source !== 'network' || pages.length === 0) return;
    const upcoming = pages.slice(index + 1, index + 3).map((page) => page.uri);
    for (const uri of upcoming) void Image.prefetch(uri).catch(() => {});
  }, [index, pages, source]);

  // Auto-scroll: a small offset per tick, native-driven by the list itself so it
  // stays smooth. A touch pauses it for a moment instead of switching it off.
  useEffect(() => {
    if (!autoScrollOn || mode !== 'vertical' || pages.length === 0) return;
    const step = 1 + config.autoScrollSpeed;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      offsetRef.current += step;
      listRef.current?.scrollToOffset({ offset: offsetRef.current, animated: false });
    }, 48);
    return () => clearInterval(timer);
  }, [autoScrollOn, config.autoScrollSpeed, mode, pages.length]);

  /** Page heights, then the running offsets — exact `getItemLayout` for a mixed-height strip. */
  const layout = useMemo(() => {
    const heights = pages.map((page) => Math.round(width / Math.max(0.35, page.aspect)));
    const offsets: number[] = [];
    let running = 0;
    for (const h of heights) {
      offsets.push(running);
      running += h;
    }
    return { heights, offsets, total: running };
  }, [pages, width]);

  const goTo = useCallback(
    (next: number, animated = true) => {
      const clamped = Math.min(pages.length - 1, Math.max(0, next));
      setIndex(clamped);
      listRef.current?.scrollToOffset({
        offset: mode === 'paged' ? clamped * width : (layout.offsets[clamped] ?? 0),
        animated,
      });
    },
    [layout.offsets, mode, pages.length, width],
  );

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset =
      mode === 'paged' ? event.nativeEvent.contentOffset.x : event.nativeEvent.contentOffset.y;
    if (mode === 'vertical') offsetRef.current = offset;
    if (mode === 'paged') {
      setIndex(Math.min(pages.length - 1, Math.max(0, Math.round(offset / Math.max(1, width)))));
      return;
    }
    let candidate = 0;
    for (let i = 0; i < layout.offsets.length; i += 1) {
      if (layout.offsets[i] <= offset + height * 0.4) candidate = i;
      else break;
    }
    setIndex(candidate);
  };

  /** Reading order, not API order: atsu lists newest first, which would send
   *  "next chapter" backwards. */
  const orderedChapters = useMemo(
    () => [...(manga?.chapters ?? [])].sort((a, b) => a.number - b.number || a.index - b.index),
    [manga?.chapters],
  );

  const currentAt = useMemo(
    () => orderedChapters.findIndex((item) => item.id === chapterId),
    [chapterId, orderedChapters],
  );

  const nextChapter = currentAt >= 0 ? (orderedChapters[currentAt + 1] ?? null) : null;
  const prevChapter = currentAt > 0 ? (orderedChapters[currentAt - 1] ?? null) : null;

  /** Infinite mode gates every cross-chapter jump. */
  const infinite = config.autoAdvanceChapters;

  const openChapter = useCallback(
    (id: string) => {
      startedAt.current = 0;
      setIndex(0);
      advancedRef.current = false;
      nav.replace({ name: 'reader', mangaId, chapterId: id });
    },
    [mangaId, nav],
  );

  const canGoPrev = index > 0 || (infinite && !!prevChapter);
  const canGoNext = index < pages.length - 1 || (infinite && !!nextChapter);

  const stepPrev = useCallback(() => {
    if (index > 0) goTo(index - 1);
    else if (infinite && prevChapter) openChapter(prevChapter.id);
  }, [goTo, index, infinite, openChapter, prevChapter]);

  const stepNext = useCallback(() => {
    if (index < pages.length - 1) goTo(index + 1);
    else if (infinite && nextChapter) openChapter(nextChapter.id);
  }, [goTo, index, infinite, nextChapter, openChapter, pages.length]);

  const headerTitle = useMemo(() => (chapter ? chapterLabel(chapter) : 'Reading'), [chapter]);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Fetching pages…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.root, styles.center]}>
        <Icon name="alert-circle-outline" size={30} color={colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <Button label="Try again" size="sm" onPress={() => setAttempt((value) => value + 1)} />
        <Button label="Back" size="sm" variant="ghost" onPress={nav.back} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        key={mode}
        data={pages}
        keyExtractor={(page) => page.key}
        horizontal={mode === 'paged'}
        pagingEnabled={mode === 'paged'}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={64}
        initialScrollIndex={startedAt.current < pages.length ? startedAt.current : 0}
        getItemLayout={(_, itemIndex) =>
          mode === 'paged'
            ? { length: width, offset: width * itemIndex, index: itemIndex }
            : {
                length: layout.heights[itemIndex] ?? width,
                offset: layout.offsets[itemIndex] ?? 0,
                index: itemIndex,
              }
        }
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        onScrollBeginDrag={() => {
          // A touch pauses auto-scroll for 2.5s rather than switching it off.
          pausedUntil.current = Date.now() + 2500;
        }}
        onEndReachedThreshold={0.15}
        onEndReached={() => {
          if (!infinite || !nextChapter || advancedRef.current) return;
          if (mode !== 'vertical' || pages.length === 0) return;
          advancedRef.current = true;
          openChapter(nextChapter.id);
        }}
        onScrollToIndexFailed={() => listRef.current?.scrollToOffset({ offset: 0, animated: false })}
        contentContainerStyle={
          mode === 'vertical' ? { paddingBottom: insets.bottom + 72 } : undefined
        }
        renderItem={({ item, index: itemIndex }) => (
          <Pressable
            onPress={() => setChrome((value) => !value)}
            style={
              mode === 'paged'
                ? { width, height: '100%' }
                : { width, height: layout.heights[itemIndex] ?? Math.round(width / 0.7) }
            }
          >
            <Image
              source={{ uri: item.uri }}
              style={{ flex: 1, width: '100%' }}
              contentFit={mode === 'paged' ? 'contain' : 'cover'}
              cachePolicy="memory-disk"
              recyclingKey={item.key}
              transition={90}
            />
          </Pressable>
        )}
        ListFooterComponent={
          mode === 'vertical' ? (
            <View style={[styles.endCard, { paddingBottom: insets.bottom + 24 }]}>
              <Text style={styles.endText}>
                End of {chapter ? chapterLabel(chapter) : 'chapter'}
              </Text>
              {nextChapter ? (
                <Button
                  label={`Next chapter · ${chapterLabel(nextChapter)}`}
                  variant="primary"
                  icon="arrow-forward"
                  onPress={() => {
                    startedAt.current = 0;
                    setIndex(0);
                    nav.replace({ name: 'reader', mangaId, chapterId: nextChapter.id });
                  }}
                />
              ) : (
                <Button label="Back to series" size="sm" onPress={nav.back} />
              )}
            </View>
          ) : undefined
        }
      />

      {chrome ? (
        <>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={nav.back}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.headerButton}
            >
              <Icon name="arrow-back" size={20} color={colors.text} />
            </Pressable>
            {/* atsu floats a rounded title pill between the chrome buttons, and
                tapping it goes up to the series page. */}
            <Pressable
              onPress={() => nav.push({ name: 'manga', mangaId })}
              accessibilityRole="button"
              accessibilityLabel={`${manga?.title ?? headerTitle}, open series page`}
              style={styles.titlePill}
            >
              <Text style={styles.headerTitle} numberOfLines={1}>
                {manga?.title ?? headerTitle}
              </Text>
              <Text style={styles.headerMeta} numberOfLines={1}>
                {headerTitle} · {source === 'offline' ? 'offline' : 'streaming'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSheetOpen(true)}
              hitSlop={12}
              accessibilityLabel="Reader settings"
              accessibilityRole="button"
              style={styles.headerButton}
            >
              <Icon name="options-outline" size={19} color={colors.text} />
            </Pressable>
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <Slider
              value={pages.length > 1 ? index / (pages.length - 1) : 0}
              steps={Math.max(1, pages.length)}
              onChange={(ratio) =>
                // While dragging the list must follow the thumb exactly, so jump
                // without animation; the thumb is already the animation.
                goTo(Math.round(ratio * Math.max(0, pages.length - 1)), false)
              }
              onSlideStart={() => setScrubbing(true)}
              onSlideEnd={() => setScrubbing(false)}
              valueLabel={`${index + 1} / ${pages.length}`}
              label={undefined}
            />
            <View style={styles.footerRow}>
              <Pressable
                onPress={() => setAutoScrollOn((value) => !value)}
                hitSlop={10}
                accessibilityRole="switch"
                accessibilityState={{ checked: autoScrollOn }}
                accessibilityLabel="Auto-scroll"
                style={[styles.headerButton, autoScrollOn && styles.headerButtonOn]}
              >
                <Icon
                  name={autoScrollOn ? 'pause' : 'play'}
                  size={17}
                  color={colors.text}
                />
              </Pressable>
              <Pressable
                onPress={stepPrev}
                hitSlop={10}
                disabled={!canGoPrev}
                accessibilityLabel={index === 0 && prevChapter ? 'Previous chapter' : 'Previous page'}
                style={[styles.headerButton, !canGoPrev && { opacity: 0.35 }]}
              >
                <Icon name="arrow-back" size={19} color={colors.text} />
              </Pressable>
              <View style={styles.pagePill}>
                <Text style={styles.pageLabel}>
                  {chapter ? `Ch. ${chapter.number} · ` : ''}
                  {index + 1} / {pages.length}
                </Text>
              </View>
              <Pressable
                onPress={stepNext}
                hitSlop={10}
                disabled={!canGoNext}
                accessibilityLabel={
                  index >= pages.length - 1 && nextChapter ? 'Next chapter' : 'Next page'
                }
                style={[styles.headerButton, !canGoNext && { opacity: 0.35 }]}
              >
                <Icon name="arrow-forward" size={19} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={() => setSheetOpen(true)}
                hitSlop={10}
                accessibilityLabel="Reader settings"
                style={styles.headerButton}
              >
                <Icon name="options-outline" size={17} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <ReaderSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            mode={mode}
            onMode={(next) => {
              setMode(next);
              setIndex(index);
              actions.updateConfig({ readerMode: next });
            }}
            autoAdvance={config.autoAdvanceChapters}
            onAutoAdvance={(value) => actions.updateConfig({ autoAdvanceChapters: value })}
            autoScroll={autoScrollOn}
            onAutoScroll={(value) => {
              setAutoScrollOn(value);
              actions.updateConfig({ autoScroll: value });
            }}
            speed={config.autoScrollSpeed}
            onSpeed={(value) => actions.updateConfig({ autoScrollSpeed: value })}
            keepAwake={config.keepScreenAwake}
            onKeepAwake={(value) => actions.updateConfig({ keepScreenAwake: value })}
            onReset={() => {
              setAutoScrollOn(false);
              actions.updateConfig({
                autoAdvanceChapters: true,
                autoScroll: false,
                autoScrollSpeed: 4,
                keepScreenAwake: true,
                readerMode: 'vertical',
              });
              setMode('vertical');
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = makeStyles((colors) => ({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...type.small, color: colors.textDim },
  errorText: {
    ...type.body,
    color: colors.error,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  // The app's reader chrome: dark squares with white glyphs, no circles.
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(25,26,30,0.94)',
  },
  headerButtonOn: { backgroundColor: colors.accent },
  titlePill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    backgroundColor: 'rgba(13,14,18,0.94)',
  },
  headerTitle: { ...type.subtitle, color: colors.text, fontSize: 15, textAlign: 'center' },
  headerMeta: {
    ...type.tiny,
    color: colors.textDim,
    fontWeight: '500',
    fontSize: 10,
    marginTop: 1,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pagePill: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: 'rgba(25,26,30,0.94)',
  },
  pageLabel: {
    ...type.small,
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  endCard: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.bg,
  },
  endText: { ...type.small, color: colors.textDim },
}));

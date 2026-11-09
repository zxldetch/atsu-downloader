import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pageImageUrl } from '../api/client';
import { chapterLabel, formatChapterNumber } from '../api/parse';
import { Icon } from '../components/icons';
import { ReaderSheet } from '../components/ReaderSheet';
import { Slider } from '../components/Slider';
import { Button } from '../components/ui';
import {
  buildRows,
  firstPageOf,
  type ReaderPage,
  type ReaderRow,
  type ReaderSegment,
} from '../lib/readerRows';
import * as storage from '../lib/storage';
import { useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, makeStyles, spacing, type } from '../theme';

const SEAM_HEIGHT = 148;

/**
 * The reader renders through a virtualised list in both modes.
 *
 * The first version mapped every page into a ScrollView, so a 60-page chapter
 * decoded 60 full-resolution images before the first one appeared — the single
 * biggest cause of the jank. Now only a few pages exist at a time, heights are
 * known up front so scrolling stays at 60fps, and the next two pages are
 * prefetched into the image cache.
 *
 * Infinite mode appends the *next chapter's pages* onto the same list instead of
 * navigating to it, so the strip never ends mid-scroll and you never have to
 * press "next chapter" yourself.
 */
export function ReaderScreen({ mangaId, chapterId }: { mangaId: string; chapterId: string }) {
  const { mangaCache, library, config, actions } = useApp();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const manga = mangaCache[mangaId] ?? actions.getManga(mangaId);
  const chapter = manga?.chapters.find((entry) => entry.id === chapterId);
  const entry = library.find((item) => item.mangaId === mangaId);
  /** What the library remembers about this chapter, offline or not. */
  const stored = entry?.chapters?.[chapterId];

  /**
   * Enough to open the chapter. The series metadata comes from the network, but a
   * downloaded chapter carries its own number, title and page count in the
   * library — so a cold start in aeroplane mode still lands on the pages instead
   * of an error saying the chapter is gone.
   */
  const meta = useMemo(
    () =>
      chapter
        ? {
            id: chapter.id,
            title: chapter.title,
            number: chapter.number,
            index: chapter.index,
            pageCount: chapter.pageCount,
          }
        : stored
          ? {
              id: chapterId,
              title: stored.chapterTitle,
              number: stored.chapterNumber,
              index: 0,
              pageCount: stored.pageCount,
            }
          : null,
    [chapter, chapterId, stored],
  );

  const [segments, setSegments] = useState<ReaderSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [appending, setAppending] = useState(false);
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
  const listRef = useRef<FlatList<ReaderRow>>(null);
  const segmentsRef = useRef<ReaderSegment[]>([]);
  const appendingRef = useRef(false);
  /** Set when the next append should scroll to the new chapter's first page. */
  const jumpToNextRef = useRef(false);
  /** Where to land after a load: a page number, or the end of the chapter. */
  const startRef = useRef<number | 'end'>(
    entry?.reading?.chapterId === chapterId ? Math.max(0, (entry?.reading?.page ?? 1) - 1) : 0,
  );

  segmentsRef.current = segments;

  const loadSegment = useCallback(
    async (
      target: { id: string; title: string; number: number; index: number; pageCount: number },
      options: { allowNetwork?: boolean } = {},
    ): Promise<{ pages: ReaderPage[]; source: 'offline' | 'network' }> => {
      const dir = storage.chapterDir(mangaId, target.id);

      const readLocal = async (): Promise<ReaderPage[]> => {
        const files = await storage.listDir(dir);
        const pages: ReaderPage[] = [];
        for (const file of files) {
          // Only real images count: an archive sitting in the same folder used to
          // be handed to <Image> as if it were a page.
          if (!/\.(webp|jpe?g|png|gif|avif)$/i.test(file.path)) continue;
          pages.push({ key: file.path, uri: await storage.uriFor(file.path), aspect: 0.7 });
        }
        return pages;
      };

      let local = await readLocal();

      // Archive-only download (anything saved by a build before pages were kept):
      // unpack it once, then it behaves like any other offline chapter.
      if (local.length === 0) {
        const savedPath = entry?.chapters?.[target.id]?.savedPath;
        if (savedPath && /\.(cbz|zip)$/i.test(savedPath) && (await storage.exists(savedPath))) {
          try {
            await storage.extractArchive(savedPath, dir);
            local = await readLocal();
          } catch {
            // A corrupt archive is not fatal — fall through to the network path.
          }
        }
      }

      if (local.length > 0) return { pages: local, source: 'offline' };
      if (options.allowNetwork === false || !manga) throw new Error('offline');

      const remote = await actions.chapterPages(manga, {
        id: target.id,
        title: target.title,
        number: target.number,
        index: target.index,
        pageCount: target.pageCount,
        scanlationMangaId: '',
      });

      return {
        pages: remote.map((page) => ({
          key: page.id,
          uri: pageImageUrl(page),
          aspect:
            page.aspectRatio || (page.width && page.height ? page.width / page.height : 0.7),
        })),
        source: 'network',
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry?.chapters, mangaId, manga?.id],
  );

  /** Reading order, not API order: atsu lists newest first, which would send
   *  "next chapter" backwards. */
  const orderedChapters = useMemo(() => {
    const online = manga?.chapters ?? [];
    const list = online.length
      ? online
      : // Offline with no series metadata: walk the chapters that are actually on
        // the device, so "next chapter" still works through a downloaded run.
        Object.values(entry?.chapters ?? {}).map((saved) => ({
          id: saved.chapterId,
          title: saved.chapterTitle,
          number: saved.chapterNumber,
          index: 0,
          pageCount: saved.pageCount,
          scanlationMangaId: '',
        }));
    return [...list].sort((a, b) => a.number - b.number || a.index - b.index);
  }, [entry?.chapters, manga?.chapters]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      if (!meta) {
        setError('This chapter is not downloaded, and the series could not be loaded.');
        setLoading(false);
        return;
      }

      try {
        const loaded = await loadSegment(meta);
        if (cancelled) return;
        if (loaded.pages.length === 0) throw new Error('This chapter has no pages.');

        setSegments([
          {
            chapterId: meta.id,
            number: meta.number,
            label: chapterLabel(meta),
            pages: loaded.pages,
          },
        ]);
        setSource(loaded.source);
        const start = startRef.current;
        setIndex(
          start === 'end' ? loaded.pages.length - 1 : Math.min(start, loaded.pages.length - 1),
        );
        startRef.current = 0;
        setLoading(false);
      } catch (loadError) {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : String(loadError);
        setError(
          message === 'offline'
            ? 'This chapter is not on the device yet. Connect once and download it, then it reads offline for good.'
            : message,
        );
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, chapterId, mangaId, meta?.id]);

  /** Everything in the strip, seams included. */
  const rows = useMemo(() => buildRows(segments), [segments]);

  /** Page heights, then the running offsets — exact `getItemLayout` for a mixed strip. */
  const layout = useMemo(() => {
    const heights = rows.map((row) =>
      row.kind === 'page' ? Math.round(width / Math.max(0.35, row.page.aspect)) : SEAM_HEIGHT,
    );
    const offsets: number[] = [];
    let running = 0;
    for (const h of heights) {
      offsets.push(running);
      running += h;
    }
    return { heights, offsets, total: running };
  }, [rows, width]);

  const current = rows[Math.min(index, rows.length - 1)];

  useEffect(() => {
    if (!current || current.kind !== 'page') return;
    actions.saveReadingProgress(
      mangaId,
      current.chapterId,
      current.pageIndex + 1,
      current.total,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.key, mangaId]);

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
    if (source !== 'network' || rows.length === 0) return;
    const upcoming = rows
      .slice(index + 1, index + 3)
      .filter((row): row is Extract<ReaderRow, { kind: 'page' }> => row.kind === 'page')
      .map((row) => row.page.uri);
    for (const uri of upcoming) void Image.prefetch(uri).catch(() => {});
  }, [index, rows, source]);

  const goTo = useCallback(
    (next: number, animated = true) => {
      const clamped = Math.min(rows.length - 1, Math.max(0, next));
      setIndex(clamped);
      listRef.current?.scrollToOffset({
        offset: mode === 'paged' ? clamped * width : (layout.offsets[clamped] ?? 0),
        animated,
      });
    },
    [layout.offsets, mode, rows.length, width],
  );

  // Auto-scroll: a small offset per tick, native-driven by the list itself so it
  // stays smooth. A touch pauses it for a moment instead of switching it off.
  useEffect(() => {
    if (!autoScrollOn || mode !== 'vertical' || rows.length === 0) return;
    const step = 1 + config.autoScrollSpeed;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      offsetRef.current += step;
      listRef.current?.scrollToOffset({ offset: offsetRef.current, animated: false });
    }, 48);
    return () => clearInterval(timer);
  }, [autoScrollOn, config.autoScrollSpeed, mode, rows.length]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset =
      mode === 'paged' ? event.nativeEvent.contentOffset.x : event.nativeEvent.contentOffset.y;
    if (mode === 'vertical') offsetRef.current = offset;
    if (mode === 'paged') {
      setIndex(Math.min(rows.length - 1, Math.max(0, Math.round(offset / Math.max(1, width)))));
      return;
    }
    let candidate = 0;
    for (let i = 0; i < layout.offsets.length; i += 1) {
      if (layout.offsets[i] <= offset + height * 0.4) candidate = i;
      else break;
    }
    setIndex(candidate);
  };

  const nextAfter = useCallback(
    (id: string) => {
      const at = orderedChapters.findIndex((item) => item.id === id);
      return at >= 0 ? (orderedChapters[at + 1] ?? null) : null;
    },
    [orderedChapters],
  );

  const prevBefore = useCallback(
    (id: string) => {
      const at = orderedChapters.findIndex((item) => item.id === id);
      return at > 0 ? (orderedChapters[at - 1] ?? null) : null;
    },
    [orderedChapters],
  );

  const lastSegment = segments[segments.length - 1];
  const upcoming = lastSegment ? nextAfter(lastSegment.chapterId) : null;
  const previousChapter = prevBefore(segments[0]?.chapterId ?? chapterId);

  /** Infinite mode gates every cross-chapter jump. */
  const infinite = config.autoAdvanceChapters;

  const openChapter = useCallback(
    (id: string, where: 'start' | 'end' = 'start') => {
      startRef.current = where === 'end' ? 'end' : 0;
      setIndex(0);
      nav.replace({ name: 'reader', mangaId, chapterId: id });
    },
    [mangaId, nav],
  );

  /** Pull the next chapter onto the end of the strip. */
  const appendNext = useCallback(async () => {
    if (!infinite || appendingRef.current) return false;
    const last = segmentsRef.current[segmentsRef.current.length - 1];
    if (!last) return false;
    const meta = nextAfter(last.chapterId);
    if (!meta) return false;

    appendingRef.current = true;
    setAppending(true);
    try {
      const loaded = await loadSegment({
        id: meta.id,
        title: meta.title,
        number: meta.number,
        index: meta.index,
        pageCount: meta.pageCount,
      });
      if (loaded.pages.length === 0) return false;
      setSegments((active) =>
        active.some((segment) => segment.chapterId === meta.id)
          ? active
          : [
              ...active,
              {
                chapterId: meta.id,
                number: meta.number,
                label: chapterLabel(meta),
                pages: loaded.pages,
              },
            ],
      );
      return true;
    } catch {
      // A dead chapter (deleted, rate-limited) must not wedge the strip; the
      // footer keeps the manual "next chapter" button as the fallback.
      return false;
    } finally {
      appendingRef.current = false;
      setAppending(false);
    }
  }, [infinite, loadSegment, nextAfter]);

  // After an append triggered by the arrow, land on the new chapter's first page.
  useEffect(() => {
    if (!jumpToNextRef.current || segments.length < 2) return;
    jumpToNextRef.current = false;
    const newest = segments[segments.length - 1];
    const at = firstPageOf(rows, newest.chapterId);
    if (at >= 0) goTo(at, true);
  }, [segments, rows, goTo]);

  const canGoPrev = index > 0 || !!previousChapter;
  const canGoNext = index < rows.length - 1 || !!upcoming;

  const stepPrev = useCallback(() => {
    if (index > 0) goTo(index - 1);
    else if (previousChapter) openChapter(previousChapter.id, 'end');
  }, [goTo, index, openChapter, previousChapter]);

  const stepNext = useCallback(() => {
    if (index < rows.length - 1) {
      goTo(index + 1);
      return;
    }
    if (infinite && upcoming) {
      jumpToNextRef.current = true;
      void appendNext();
      return;
    }
    if (upcoming) openChapter(upcoming.id);
  }, [appendNext, goTo, index, infinite, openChapter, rows.length, upcoming]);

  const mangaTitle = manga?.title ?? entry?.title ?? null;
  const headerTitle = useMemo(
    () => (meta ? chapterLabel(meta) : 'Reading'),
    [meta?.id, meta?.number, meta?.title],
  );
  const activeLabel =
    current?.kind === 'page'
      ? `Chapter ${formatChapterNumber(current.chapterNumber)}`
      : (current?.kind === 'seam' ? current.next.replace(/^Next: /, '') : headerTitle);
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
        data={rows}
        keyExtractor={(row) => row.key}
        horizontal={mode === 'paged'}
        pagingEnabled={mode === 'paged'}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialScrollIndex={Math.min(index, Math.max(0, rows.length - 1))}
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
        onEndReachedThreshold={infinite ? 0.6 : 0.15}
        onEndReached={() => {
          // Infinite mode: keep the strip fed without the reader ever asking.
          if (!infinite || appendingRef.current) return;
          void appendNext();
        }}
        onScrollToIndexFailed={() => listRef.current?.scrollToOffset({ offset: 0, animated: false })}
        contentContainerStyle={
          mode === 'vertical' ? { paddingBottom: insets.bottom + 72 } : undefined
        }
        renderItem={({ item }) => {
          if (item.kind === 'seam') {
            return (
              <View style={[styles.seam, mode === 'paged' && { width }]}>
                <View style={styles.seamRule} />
                <Text style={styles.seamFinished}>{item.finished}</Text>
                {item.next ? <Text style={styles.seamNext}>{item.next}</Text> : null}
              </View>
            );
          }

          const rowHeight =
            mode === 'paged' ? height : Math.round(width / Math.max(0.35, item.page.aspect));

          return (
            <Pressable
              onPress={() => setChrome((value) => !value)}
              style={mode === 'paged' ? { width, height: '100%' } : { width, height: rowHeight }}
            >
              <Image
                source={{ uri: item.page.uri }}
                style={{ flex: 1, width: '100%' }}
                contentFit={mode === 'paged' ? 'contain' : 'cover'}
                cachePolicy="memory-disk"
                recyclingKey={item.page.key}
                transition={90}
              />
            </Pressable>
          );
        }}
        ListFooterComponent={
          mode === 'vertical' ? (
            <View style={[styles.endCard, { paddingBottom: insets.bottom + 24 }]}>
              {infinite && appending ? (
                <>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.endText}>Loading the next chapter…</Text>
                </>
              ) : upcoming && !infinite ? (
                <>
                  <Text style={styles.endText}>
                    End of {lastSegment ? lastSegment.label : 'chapter'}
                  </Text>
                  <Button
                    label={`Next chapter · ${chapterLabel(upcoming)}`}
                    variant="primary"
                    icon="arrow-forward"
                    onPress={() => openChapter(upcoming.id)}
                  />
                </>
              ) : upcoming ? (
                <Text style={styles.endText}>
                  Next: Chapter {formatChapterNumber(upcoming.number)}
                </Text>
              ) : (
                <>
                  <Text style={styles.endText}>
                    End of {lastSegment ? lastSegment.label : 'chapter'}
                  </Text>
                  <Button label="Back to series" size="sm" onPress={nav.back} />
                </>
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
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={styles.iconButton}
            >
              <Icon name="arrow-back" size={22} color={colors.text} />
            </Pressable>
            {/* atsu floats the title between the chrome buttons, and tapping it
                goes up to the series page. No pill behind it — just the text. */}
            <Pressable
              onPress={() => {
                // Offline, only the downloaded chapters exist — there is no series
                // page to open, so stay put instead of navigating to an error.
                if (manga) nav.push({ name: 'manga', mangaId });
              }}
              disabled={!manga}
              accessibilityRole="button"
              accessibilityLabel={
                manga
                  ? `${manga.title}, open series page`
                  : `${mangaTitle ?? headerTitle}, downloaded copy`
              }
              style={styles.titleWrap}
            >
              <Text style={styles.headerTitle} numberOfLines={1}>
                {mangaTitle ?? headerTitle}
              </Text>
              <Text style={styles.headerMeta} numberOfLines={1}>
                {activeLabel} · {source === 'offline' ? 'offline' : 'streaming'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSheetOpen(true)}
              hitSlop={14}
              accessibilityLabel="Reader settings"
              accessibilityRole="button"
              style={styles.iconButton}
            >
              <Icon name="options-outline" size={21} color={colors.text} />
            </Pressable>
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <Slider
              value={rows.length > 1 ? index / (rows.length - 1) : 0}
              steps={Math.max(1, rows.length)}
              onChange={(ratio) =>
                // While dragging the list must follow the thumb exactly, so jump
                // without animation; the thumb is already the animation.
                goTo(Math.round(ratio * Math.max(0, rows.length - 1)), false)
              }
              onSlideStart={() => setScrubbing(true)}
              onSlideEnd={() => setScrubbing(false)}
              valueLabel={`${index + 1} / ${rows.length}`}
              label={undefined}
            />
            <View style={styles.footerRow}>
              <Pressable
                onPress={() => setAutoScrollOn((value) => !value)}
                hitSlop={12}
                accessibilityRole="switch"
                accessibilityState={{ checked: autoScrollOn }}
                accessibilityLabel="Auto-scroll"
                style={styles.iconButton}
              >
                <Icon
                  name={autoScrollOn ? 'pause' : 'play'}
                  size={19}
                  color={autoScrollOn ? colors.accentText : colors.text}
                />
              </Pressable>
              <Pressable
                onPress={stepPrev}
                hitSlop={12}
                disabled={!canGoPrev}
                accessibilityLabel={index === 0 && previousChapter ? 'Previous chapter' : 'Previous page'}
                style={[styles.iconButton, !canGoPrev && { opacity: 0.3 }]}
              >
                <Icon name="arrow-back" size={21} color={colors.text} />
              </Pressable>
              <View style={styles.pageText}>
                <Text style={styles.pageLabel}>
                  {activeLabel.replace(/^Chapter /, 'Ch. ')}
                  {current?.kind === 'page' ? ` · ${current.pageIndex + 1} / ${current.total}` : ''}
                </Text>
                {scrubbing ? <Text style={styles.pageHint}>dragging</Text> : null}
              </View>
              <Pressable
                onPress={stepNext}
                hitSlop={12}
                disabled={!canGoNext}
                accessibilityLabel={
                  index >= rows.length - 1 && upcoming ? 'Next chapter' : 'Next page'
                }
                style={[styles.iconButton, !canGoNext && { opacity: 0.3 }]}
              >
                <Icon name="arrow-forward" size={21} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={() => setSheetOpen(true)}
                hitSlop={12}
                accessibilityLabel="Reader settings"
                style={styles.iconButton}
              >
                <Icon name="options-outline" size={19} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <ReaderSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            mode={mode}
            onMode={(next) => {
              setMode(next);
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

  // Flat chrome: a translucent band edge-to-edge, no boxes, no pills, no
  // shadows behind the buttons — the glyphs sit straight on the scrim.
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  iconButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...type.subtitle, color: colors.text, fontSize: 15, textAlign: 'center' },
  headerMeta: {
    ...type.tiny,
    color: colors.textDim,
    fontWeight: '500',
    fontSize: 10,
    marginTop: 1,
    textAlign: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  pageText: { flex: 1, alignItems: 'center' },
  pageLabel: {
    ...type.small,
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  pageHint: { ...type.tiny, color: colors.textFaint, fontSize: 9, marginTop: 1 },

  seam: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xxl,
    backgroundColor: '#000000',
  },
  seamRule: { width: 46, height: 1, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: spacing.sm },
  seamFinished: { ...type.small, color: colors.textDim, fontWeight: '500' },
  seamNext: { ...type.subtitle, color: colors.accentText, fontSize: 16, fontWeight: '700' },

  endCard: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.bg,
  },
  endText: { ...type.small, color: colors.textDim },
}));

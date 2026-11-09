import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pageImageUrl } from '../api/client';
import { chapterLabel } from '../api/parse';
import { Icon } from '../components/icons';
import { Button, ProgressBar } from '../components/ui';
import * as storage from '../lib/storage';
import { useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, radius, spacing, type } from '../theme';

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
    (next: number) => {
      const clamped = Math.min(pages.length - 1, Math.max(0, next));
      setIndex(clamped);
      listRef.current?.scrollToOffset({
        offset: mode === 'paged' ? clamped * width : (layout.offsets[clamped] ?? 0),
        animated: true,
      });
    },
    [layout.offsets, mode, pages.length, width],
  );

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset =
      mode === 'paged' ? event.nativeEvent.contentOffset.x : event.nativeEvent.contentOffset.y;
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

  const nextChapter = useMemo(() => {
    if (!manga) return null;
    const at = manga.chapters.findIndex((item) => item.id === chapterId);
    if (at < 0) return null;
    // atsu lists newest first in most series; "next" means the following entry.
    return manga.chapters[at + 1] ?? null;
  }, [chapterId, manga]);

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
            <Pressable onPress={nav.back} hitSlop={12} style={styles.headerButton}>
              <Icon name="chevron-back" size={20} color={colors.text} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {headerTitle}
              </Text>
              <Text style={styles.headerMeta} numberOfLines={1}>
                {manga?.title} · {source === 'offline' ? 'offline' : 'streaming'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setMode(mode === 'paged' ? 'vertical' : 'paged');
                setIndex(index);
              }}
              hitSlop={12}
              accessibilityLabel={mode === 'paged' ? 'Switch to vertical scroll' : 'Switch to paged'}
              style={styles.headerButton}
            >
              <Icon
                name={mode === 'paged' ? 'reorder-four-outline' : 'copy-outline'}
                size={19}
                color={colors.text}
              />
            </Pressable>
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
            <View style={styles.progressRow}>
              <Text style={styles.pageLabel}>
                {index + 1} / {pages.length}
              </Text>
              <View style={{ flex: 1 }}>
                <ProgressBar value={index + 1} total={Math.max(1, pages.length)} height={3} />
              </View>
              <Pressable
                onPress={() => goTo(index - 1)}
                hitSlop={10}
                disabled={index === 0}
                accessibilityLabel="Previous page"
                style={{ opacity: index === 0 ? 0.35 : 1 }}
              >
                <Icon name="chevron-back" size={20} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={() => goTo(index + 1)}
                hitSlop={10}
                disabled={index >= pages.length - 1}
                accessibilityLabel="Next page"
                style={{ opacity: index >= pages.length - 1 ? 0.35 : 1 }}
              >
                <Icon name="chevron-forward" size={20} color={colors.text} />
              </Pressable>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: { ...type.subtitle, color: colors.text, fontSize: 14 },
  headerMeta: { ...type.tiny, color: colors.textDim, fontWeight: '500', marginTop: 1 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pageLabel: {
    ...type.tiny,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    minWidth: 52,
  },
  endCard: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.bg,
  },
  endText: { ...type.small, color: colors.textDim },
});

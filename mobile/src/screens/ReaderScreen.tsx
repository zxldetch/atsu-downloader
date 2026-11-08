import { Image } from 'expo-image';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { pageImageUrl } from '../api/client';
import { chapterLabel } from '../api/parse';
import { Button } from '../components/ui';
import * as storage from '../lib/storage';
import { useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, radius, spacing, type } from '../theme';

interface ReaderPage {
  key: string;
  uri: string;
  aspect: number;
}

type Mode = 'vertical' | 'paged';

export function ReaderScreen({ mangaId, chapterId }: { mangaId: string; chapterId: string }) {
  const { mangaCache, library, actions } = useApp();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const manga = mangaCache[mangaId] ?? actions.getManga(mangaId);
  const chapter = manga?.chapters.find((entry) => entry.id === chapterId);
  const entry = library.find((item) => item.mangaId === mangaId);

  const [pages, setPages] = useState<ReaderPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'offline' | 'network'>('network');
  const [mode, setMode] = useState<Mode>('vertical');
  const [chrome, setChrome] = useState(true);
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const listRef = useRef<FlatList<ReaderPage>>(null);

  const startPage =
    entry?.reading?.chapterId === chapterId ? Math.max(0, (entry?.reading?.page ?? 1) - 1) : 0;

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
            page.aspectRatio ||
            (page.width && page.height ? page.width / page.height : 0.7),
        })),
      );
      setSource('network');
      setIndex(startPage);
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

  // Persist reading position, throttled to one write per page.
  useEffect(() => {
    if (pages.length === 0) return;
    actions.saveReadingProgress(mangaId, chapterId, index + 1, pages.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, pages.length]);

  const recomputeIndex = (offsetX: number) => {
    const next = Math.round(offsetX / Math.max(1, width));
    setIndex(Math.min(pages.length - 1, Math.max(0, next)));
  };

  const onPagedScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    recomputeIndex(event.nativeEvent.contentOffset.x);

  const goTo = (next: number) => {
    const clamped = Math.min(pages.length - 1, Math.max(0, next));
    setIndex(clamped);
    if (mode === 'paged') listRef.current?.scrollToIndex({ index: clamped, animated: true });
  };

  const headerTitle = useMemo(() => {
    if (!chapter) return 'Reading';
    return chapterLabel(chapter);
  }, [chapter]);

  return (
    <View style={styles.root}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Fetching pages…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Button label="Try again" size="sm" onPress={() => setAttempt((value) => value + 1)} />
        </View>
      ) : mode === 'paged' ? (
        <FlatList
          ref={listRef}
          data={pages}
          keyExtractor={(page) => page.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onPagedScroll}
          initialScrollIndex={startPage}
          getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
          renderItem={({ item }) => (
            <Pressable
              style={{ width, height: '100%', backgroundColor: '#000' }}
              onPress={() => setChrome((value) => !value)}
            >
              <Image source={{ uri: item.uri }} style={{ flex: 1 }} contentFit="contain" />
            </Pressable>
          )}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
          onScroll={(event) => {
            const y = event.nativeEvent.contentOffset.y;
            const approx = Math.floor(y / Math.max(1, width / 0.7));
            setIndex(Math.min(pages.length - 1, Math.max(0, approx)));
          }}
          scrollEventThrottle={120}
        >
          {pages.map((page) => (
            <Pressable key={page.key} onPress={() => setChrome((value) => !value)}>
              <Image
                source={{ uri: page.uri }}
                style={{ width, height: width / Math.max(0.35, page.aspect) }}
                contentFit="contain"
              />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {chrome ? (
        <>
          <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
            <Pressable onPress={nav.back} hitSlop={10} style={styles.headerButton}>
              <Text style={styles.headerGlyph}>‹</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {headerTitle}
              </Text>
              <Text style={styles.headerMeta} numberOfLines={1}>
                {manga?.title} · {source === 'offline' ? 'offline' : 'streaming'} ·{' '}
                {pages.length} pages
              </Text>
            </View>
            <Pressable
              onPress={() => setMode(mode === 'paged' ? 'vertical' : 'paged')}
              style={styles.headerButton}
              hitSlop={10}
            >
              <Text style={styles.headerGlyph}>{mode === 'paged' ? '☰' : '⇄'}</Text>
            </Pressable>
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
            <Pressable onPress={() => goTo(index - 1)} hitSlop={10} disabled={index === 0}>
              <Text style={[styles.navGlyph, index === 0 && styles.navDisabled]}>‹</Text>
            </Pressable>
            <Text style={styles.pageLabel}>
              {index + 1} / {pages.length}
            </Text>
            <Pressable
              onPress={() => goTo(index + 1)}
              hitSlop={10}
              disabled={index >= pages.length - 1}
            >
              <Text style={[styles.navGlyph, index >= pages.length - 1 && styles.navDisabled]}>
                ›
              </Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <View style={styles.modePill}>
              <Text style={styles.modePillText}>{mode === 'paged' ? 'PAGED' : 'SCROLL'}</Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05070a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...type.small, color: colors.textDim },
  errorText: { ...type.body, color: colors.error, textAlign: 'center', paddingHorizontal: spacing.xl },
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
    backgroundColor: colors.overlay,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerGlyph: { color: colors.text, fontSize: 18 },
  headerTitle: { ...type.subtitle, color: colors.text, fontSize: 14 },
  headerMeta: { ...type.small, color: colors.textDim, fontWeight: '400' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.overlay,
  },
  navGlyph: { color: colors.text, fontSize: 26, lineHeight: 28 },
  navDisabled: { color: colors.textFaint, opacity: 0.4 },
  pageLabel: { ...type.small, color: colors.text, fontVariant: ['tabular-nums'] },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modePillText: { ...type.small, color: colors.textDim, fontSize: 10, letterSpacing: 1 },
});

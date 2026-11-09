import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { looksLikeMangaTarget } from '../api/parse';
import { LibraryRow } from '../components/cards';
import { Icon, type IconName } from '../components/icons';
import { Banner, Button, Chip, EmptyState, SectionHeader, TextField } from '../components/ui';
import { searchCatalog, type CatalogHit } from '../lib/catalog';
import { Screen, useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, radius, spacing, type, useThemeName, makeStyles } from '../theme';
import type { LibraryEntry } from '../types';

/** Up to this many links (or titles) can be pasted at once. */
const MAX_BULK = 10;

export function SearchScreen() {
  useThemeName();
  const { library, config, loadingManga, lastError, actions } = useApp();
  const nav = useNav();
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const trimmed = query.trim();

  /** Online results from atsu.moe's own search. */
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const searchSeq = useRef(0);

  const demoIds = useMemo(
    () => new Set(actions.demoLibrary().map((manga) => manga.id)),
    [actions],
  );

  /**
   * Everything in the box that looks loadable — a URL, a bare id, or a demo id.
   * The *original text* is kept (not the parsed id) so the store can resolve
   * demo fixtures itself; on a live build the parser handles it either way.
   */
  const targets = useMemo(() => {
    const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
    const loadable = tokens.filter((token) => looksLikeMangaTarget(token, demoIds));
    return [...new Set(loadable)].slice(0, MAX_BULK);
  }, [demoIds, trimmed]);

  const results = useMemo(() => filterLibrary(library, trimmed), [library, trimmed]);

  /**
   * Titles typed as free text are looked up online; links and ids are not (those
   * go straight to the loader below). Demo mode never touches the network.
   */
  const isTitleQuery = targets.length === 0 && !trimmed.includes('\n') && trimmed.length >= 2;
  const shouldSearch = isTitleQuery && !config.demoMode;

  useEffect(() => {
    if (!shouldSearch) {
      setHits([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    const seq = searchSeq.current + 1;
    searchSeq.current = seq;
    setSearching(true);
    setSearchError(null);

    const timer = setTimeout(() => {
      searchCatalog(trimmed, { limit: 24 })
        .then((found) => {
          if (searchSeq.current !== seq) return;
          setHits(found);
        })
        .catch((error: unknown) => {
          if (searchSeq.current !== seq) return;
          setHits([]);
          setSearchError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (searchSeq.current === seq) setSearching(false);
        });
    }, 420);

    return () => clearTimeout(timer);
  }, [shouldSearch, trimmed]);

  const openManga = useCallback((mangaId: string) => nav.push({ name: 'manga', mangaId }), [nav]);

  const loadLinks = useCallback(async () => {
    setNote(null);
    let added = 0;
    let last: string | null = null;
    for (const target of targets) {
      const manga = await actions.loadManga(target);
      if (manga) {
        added += 1;
        last = manga.id;
      }
    }

    if (added === 0) return;
    if (added === 1 && last) {
      setQuery('');
      nav.push({ name: 'manga', mangaId: last });
      return;
    }
    setQuery('');
    setNote(`Added ${added} series to your shelf.`);
  }, [actions, nav, targets]);

  /** A title in the line list, resolved through search and added to the shelf. */
  const addByTitle = useCallback(
    async (title: string) => {
      const found = await searchCatalog(title, { limit: 1 });
      if (found.length === 0) return null;
      return actions.loadManga(found[0].id);
    },
    [actions],
  );

  /** "I have a list of manhwa" — one title per line, no links needed. */
  const importTitles = useCallback(async () => {
    const titles = query
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, MAX_BULK);

    if (titles.length === 0) return;
    setResolving(true);
    setNote(null);
    const missing: string[] = [];
    let added = 0;

    for (const title of titles) {
      try {
        const manga = await addByTitle(title);
        if (manga) added += 1;
        else missing.push(title);
      } catch {
        missing.push(title);
      }
    }

    setResolving(false);
    if (added > 0) setQuery('');
    setNote(
      added === 0
        ? `None of those ${titles.length} titles were found on atsu.moe.`
        : `Added ${added} of ${titles.length}${missing.length ? ` · not found: ${missing.join(', ')}` : ''}`,
    );
  }, [addByTitle, query]);

  const openHit = useCallback(
    async (hit: CatalogHit) => {
      const manga = await actions.loadManga(hit.id);
      if (manga) {
        setQuery('');
        nav.push({ name: 'manga', mangaId: manga.id });
      }
    },
    [actions, nav],
  );

  const titleList = useMemo(
    () =>
      query
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, MAX_BULK),
    [query],
  );

  return (
    <Screen title="Search" subtitle="Find a series by title, or paste its link">
      <FlatList
        data={results}
        keyExtractor={(entry) => entry.mangaId}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item }) => <LibraryRow entry={item} onPress={openManga} />}
        ListHeaderComponent={
          <View>
            <TextField
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                setNote(null);
              }}
              placeholder="atsu.moe link, or search your shelf"
              icon="search"
              onSubmit={() => void loadLinks()}
              keyboardType="url"
            />

            {targets.length > 0 ? (
              <View style={styles.linkCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.linkTitle}>
                    {targets.length === 1 ? 'Load this series' : `Load ${targets.length} series`}
                  </Text>
                  <Text style={styles.linkBody} numberOfLines={2}>
                    {targets.join('  ·  ')}
                  </Text>
                </View>
                <Button
                  label={targets.length === 1 ? 'Load' : `Load ${targets.length}`}
                  variant="primary"
                  onPress={() => void loadLinks()}
                  loading={loadingManga}
                />
              </View>
            ) : null}

            {lastError ? <Banner onDismiss={actions.clearError}>{lastError}</Banner> : null}
            {note ? (
              <Banner tone="info" onDismiss={() => setNote(null)}>
                {note}
              </Banner>
            ) : null}

            {config.demoMode && trimmed.length === 0 ? (
              <>
                <SectionHeader title="Demo series" />
                <View style={styles.chipRow}>
                  {actions.demoLibrary().map((manga) => (
                    <Chip
                      key={manga.id}
                      label={manga.title}
                      icon="flask-outline"
                      onPress={() => {
                        setQuery(manga.id);
                      }}
                    />
                  ))}
                </View>
                <Text style={styles.footnote}>
                  Demo mode is on, so these bundled series are served from the app instead of
                  atsu.moe. Switch it off in Settings to go live.
                </Text>
              </>
            ) : null}

            {titleList.length > 1 ? (
              <View style={styles.linkCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.linkTitle}>Add {titleList.length} titles</Text>
                  <Text style={styles.linkBody} numberOfLines={3}>
                    {titleList.join('  ·  ')}
                  </Text>
                </View>
                <Button
                  label="Add all"
                  variant="primary"
                  onPress={() => void importTitles()}
                  loading={resolving}
                />
              </View>
            ) : null}

            {trimmed.length > 0 && results.length > 0 ? (
              <SectionHeader title={`${results.length} on your shelf`} />
            ) : null}

            {shouldSearch ? (
              <View style={{ marginTop: spacing.md }}>
                <SectionHeader
                  title={searching ? 'Searching atsu.moe…' : `${hits.length} on atsu.moe`}
                />
                {searchError ? (
                  <Text style={styles.footnote}>Search failed · {searchError}</Text>
                ) : null}
                {!searching && !searchError && hits.length === 0 ? (
                  <Text style={styles.footnote}>
                    Nothing on atsu.moe matched “{trimmed}”. Try fewer words.
                  </Text>
                ) : null}
                {hits.map((hit) => (
                  <Pressable
                    key={hit.id}
                    onPress={() => void openHit(hit)}
                    style={({ pressed }) => [styles.hitRow, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${hit.title}`}
                  >
                    {hit.cover ? (
                      <Image source={{ uri: hit.cover }} style={styles.hitCover} contentFit="cover" />
                    ) : (
                      <View style={[styles.hitCover, styles.hitCoverEmpty]}>
                        <Icon name="image-outline" size={16} color={colors.textFaint} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hitTitle} numberOfLines={2}>
                        {hit.title}
                      </Text>
                      {hit.meta ? <Text style={styles.hitMeta}>{hit.meta}</Text> : null}
                    </View>
                    <Icon name="add-circle-outline" size={20} color={colors.accentText} />
                  </Pressable>
                ))}
              </View>
            ) : null}

            {trimmed.length > 0 && results.length === 0 && targets.length === 0 && !shouldSearch ? (
              <EmptyState
                icon="search-outline"
                title="Nothing matched"
                body="Type a title to search atsu.moe, paste a manga link, or put one title per line to add several at once."
              />
            ) : null}
          </View>
        }
        ListFooterComponent={
          trimmed.length === 0 ? (
            <View>
              <SectionHeader title="How adding works" />
              <View style={styles.helpCard}>
                {HELP_STEPS.map((step) => (
                  <View key={step.title} style={styles.helpRow}>
                    <Icon name={step.icon} size={16} color={colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.helpTitle}>{step.title}</Text>
                      <Text style={styles.helpBody}>{step.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : undefined
        }
      />
    </Screen>
  );
}

const HELP_STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'search',
    title: 'Type a title',
    body: 'Results come straight from atsu.moe. Tap one to put it on your shelf.',
  },
  {
    icon: 'list-outline',
    title: 'Or paste a whole list',
    body: 'One title per line, hit “Add all” — no links needed. Up to 10 at a time.',
  },
  {
    icon: 'link-outline',
    title: 'Links still work',
    body: 'atsu.moe/manga/OaKBx, or just the id, pasted on its own.',
  },
  {
    icon: 'cloud-download-outline',
    title: 'Download, then read offline',
    body: 'Pages stay on the phone, so a downloaded chapter reads with no connection.',
  },
];

/** Case-insensitive match over title, author and synopsis. */
function filterLibrary(library: LibraryEntry[], query: string): LibraryEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return library;
  // A pasted link/id is not a shelf query — the link card takes over.
  return library.filter(
    (entry) =>
      entry.title.toLowerCase().includes(needle) ||
      entry.authors.some((author) => author.toLowerCase().includes(needle)) ||
      entry.synopsis.toLowerCase().includes(needle),
  );
}

const styles = makeStyles((colors) => ({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  linkTitle: { ...type.body, color: colors.text, fontWeight: '600' },
  linkBody: { ...type.tiny, color: colors.textFaint, marginTop: 3, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  hitCover: {
    width: 38,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.input,
  },
  hitCoverEmpty: { alignItems: 'center', justifyContent: 'center' },
  hitTitle: { ...type.body, color: colors.text, fontWeight: '600', fontSize: 15 },
  hitMeta: { ...type.tiny, color: colors.textFaint, marginTop: 2 },
  footnote: {
    ...type.tiny,
    color: colors.textFaint,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: spacing.md,
  },
  helpCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg },
  helpRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  helpTitle: { ...type.body, color: colors.text, fontWeight: '600' },
  helpBody: { ...type.tiny, color: colors.textFaint, marginTop: 2, fontWeight: '500', lineHeight: 15 },
}));

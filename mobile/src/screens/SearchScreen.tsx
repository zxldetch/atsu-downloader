import { useCallback, useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';

import { looksLikeMangaTarget } from '../api/parse';
import { LibraryRow } from '../components/cards';
import { Icon, type IconName } from '../components/icons';
import { Banner, Button, Chip, EmptyState, SectionHeader, TextField } from '../components/ui';
import { Screen, useNav } from '../navigation';
import { useApp } from '../store/AppStore';
import { colors, radius, spacing, type, useThemeName, makeStyles } from '../theme';
import type { LibraryEntry } from '../types';

/** Up to this many links can be pasted at once. */
const MAX_BULK = 10;

export function SearchScreen() {
  useThemeName();
  const { library, config, loadingManga, lastError, actions } = useApp();
  const nav = useNav();
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const trimmed = query.trim();

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

  return (
    <Screen title="Search" subtitle="Paste a link to add a series to your shelf">
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

            {trimmed.length > 0 && results.length > 0 ? (
              <SectionHeader title={`${results.length} on your shelf`} />
            ) : null}

            {trimmed.length > 0 && results.length === 0 && targets.length === 0 ? (
              <EmptyState
                icon="search-outline"
                title="Nothing matched"
                body="Series are added by link: paste an atsu.moe manga URL and it lands on your shelf. The site's browse API isn't public, so there's no remote search here."
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
  { icon: 'link-outline', title: 'Copy a series link', body: 'atsu.moe/manga/OaKBx — or just the id.' },
  { icon: 'albums-outline', title: 'Pick your chapters', body: 'Tap rows, or type a range like 1-10 or 1,3,5-7.' },
  { icon: 'cloud-download-outline', title: 'Download, then read offline', body: 'CBZ by default; pages stay on the phone.' },
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

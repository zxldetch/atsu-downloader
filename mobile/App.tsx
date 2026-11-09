import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NavProvider, useNav } from './src/navigation';
import { HomeScreen } from './src/screens/HomeScreen';
import { MangaScreen } from './src/screens/MangaScreen';
import { ReaderScreen } from './src/screens/ReaderScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ShelfScreen } from './src/screens/ShelfScreen';
import { AppProvider, useApp } from './src/store/AppStore';
import { colors, spacing, type } from './src/theme';

function Router() {
  const { route } = useNav();
  const { hydrated } = useApp();

  if (!hydrated) {
    return (
      <View style={styles.boot}>
        <View style={styles.bootRow}>
          <Text style={styles.bootMark}>ATSU</Text>
          <View style={styles.bootDot} />
        </View>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.bootText}>Restoring your shelf…</Text>
      </View>
    );
  }

  switch (route.name) {
    case 'manga':
      return <MangaScreen mangaId={route.mangaId} />;
    case 'reader':
      return <ReaderScreen mangaId={route.mangaId} chapterId={route.chapterId} />;
    case 'search':
      return <SearchScreen />;
    case 'shelf':
      // Keyed by segment so tapping the Shelf tab always lands on the library,
      // even when the screen was last left on Downloads.
      return <ShelfScreen key={route.tab ?? 'library'} initialTab={route.tab} />;
    case 'settings':
      return <SettingsScreen />;
    case 'home':
    default:
      return <HomeScreen />;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavProvider>
          <StatusBar style="light" />
          <Router />
        </NavProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  bootRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: spacing.sm },
  bootMark: { ...type.brand, fontSize: 26, letterSpacing: 4, color: colors.text },
  bootDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 6 },
  bootText: { ...type.small, color: colors.textFaint, fontWeight: '500' },
});

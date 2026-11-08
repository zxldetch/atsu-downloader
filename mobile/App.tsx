import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NavProvider, useNav } from './src/navigation';
import { HomeScreen } from './src/screens/HomeScreen';
import { MangaScreen } from './src/screens/MangaScreen';
import { QueueScreen } from './src/screens/QueueScreen';
import { ReaderScreen } from './src/screens/ReaderScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AppProvider, useApp } from './src/store/AppStore';
import { colors, spacing, type } from './src/theme';

function Router() {
  const { route } = useNav();
  const { hydrated } = useApp();

  if (!hydrated) {
    return (
      <View style={styles.boot}>
        <Text style={styles.bootMark}>ATSU</Text>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.bootText}>Restoring library…</Text>
      </View>
    );
  }

  switch (route.name) {
    case 'manga':
      return <MangaScreen mangaId={route.mangaId} />;
    case 'queue':
      return <QueueScreen />;
    case 'reader':
      return <ReaderScreen mangaId={route.mangaId} chapterId={route.chapterId} />;
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
    gap: spacing.md,
  },
  bootMark: { ...type.display, color: colors.accent, letterSpacing: 6 },
  bootText: { ...type.small, color: colors.textDim },
});

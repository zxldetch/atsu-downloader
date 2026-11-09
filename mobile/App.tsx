import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BootSplash } from './src/components/BootSplash';
import { useReducedMotion } from './src/lib/motion';
import { NavProvider, useNav } from './src/navigation';
import { HomeScreen } from './src/screens/HomeScreen';
import { MangaScreen } from './src/screens/MangaScreen';
import { ReaderScreen } from './src/screens/ReaderScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ShelfScreen } from './src/screens/ShelfScreen';
import { AppProvider, useApp } from './src/store/AppStore';
import { colors, getPalette, setThemeName, type ThemeName } from './src/theme';

/** Accepts anything the persisted config might hold and falls back safely. */
function safeTheme(value: unknown): ThemeName {
  return value === 'dark' || value === 'light' || value === 'normal' ? value : 'normal';
}

/**
 * Cross-fades the current screen in when the route changes. Transform/opacity
 * only, so it stays on the native driver; skipped entirely with Reduce Motion.
 */
function Router({ themeKey }: { themeKey: ThemeName }) {
  const { route } = useNav();
  const { hydrated } = useApp();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const routeKey =
    route.name === 'manga'
      ? `manga:${route.mangaId}`
      : route.name === 'reader'
        ? `reader:${route.mangaId}:${route.chapterId}`
        : route.name === 'shelf'
          ? `shelf:${route.tab ?? 'library'}`
          : route.name;

  const previousKey = useRef(routeKey);

  useEffect(() => {
    if (previousKey.current === routeKey) return;
    previousKey.current = routeKey;
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress, reducedMotion, routeKey]);

  if (!hydrated) {
    // The splash overlay covers this frame; keep the tree mounted and empty.
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  const screen = (() => {
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
  })();

  return (
    // Keyed by theme so every screen below rebuilds its StyleSheets against the
    // new palette — the navigator itself stays mounted, so the route is kept.
    <Animated.View
      key={themeKey}
      style={{
        flex: 1,
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
        ],
      }}
    >
      {screen}
    </Animated.View>
  );
}

/**
 * Owns the theme. The palette is handed to `theme.ts` before children render, and
 * the navigator is keyed by theme so every lazily built StyleSheet is rebuilt —
 * the router keeps its route through the remount, so switching theme in Settings
 * leaves you on Settings.
 */
function Shell() {
  const { config, hydrated } = useApp();
  const theme = safeTheme(config.theme);
  const palette = getPalette(theme);

  // A module-level assignment (not state): it must be in place before the first
  // child of the keyed subtree renders.
  setThemeName(theme);

  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const pending = SystemUI.setBackgroundColorAsync?.(palette.bg);
    // Optional chaining may return undefined on platforms without the module.
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  }, [palette.bg]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <StatusBar style={palette.scheme === 'light' ? 'dark' : 'light'} />
      <NavProvider>
        <Router themeKey={theme} />
      </NavProvider>
      {/* Mounted above the keyed tree so a theme switch never replays it.
          Skipped under jest, where the animation clock never advances and the
          overlay would sit on top of every query. */}
      {splashDone || process.env.NODE_ENV === 'test' ? null : (
        <BootSplash ready={hydrated} onDone={() => setSplashDone(true)} />
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </SafeAreaProvider>
  );
}

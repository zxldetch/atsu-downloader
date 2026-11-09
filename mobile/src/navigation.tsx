/**
 * A deliberately tiny router with an atsu-style bottom tab bar.
 *
 * Four tabs (Home, Search, Shelf, Settings) plus two pushed screens (a series
 * and the reader). That is small enough that a navigation library would cost
 * more than it returns, and this keeps Expo Go, the APK and the web preview
 * behaving identically.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './components/icons';
import { useReducedMotion } from './lib/motion';
import { colors, radius, spacing, type, useThemeName, makeStyles } from './theme';

export type TabName = 'home' | 'search' | 'shelf' | 'settings';

export type Route =
  | { name: 'home' }
  | { name: 'search' }
  | { name: 'shelf'; tab?: 'library' | 'downloads' }
  | { name: 'settings' }
  | { name: 'manga'; mangaId: string }
  | { name: 'reader'; mangaId: string; chapterId: string };

const TABS: { key: TabName; label: string; icon: IconName; iconActive: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { key: 'search', label: 'Search', icon: 'search-outline', iconActive: 'search' },
  { key: 'shelf', label: 'Shelf', icon: 'bookmark-outline', iconActive: 'bookmark' },
  { key: 'settings', label: 'Settings', icon: 'person-outline', iconActive: 'person' },
];

export function tabOf(route: Route): TabName {
  switch (route.name) {
    case 'search':
      return 'search';
    case 'shelf':
      return 'shelf';
    case 'settings':
      return 'settings';
    default:
      return 'home';
  }
}

interface NavContextValue {
  route: Route;
  stack: Route[];
  push: (route: Route) => void;
  replace: (route: Route) => void;
  /** Switch tabs: resets the stack so the tab bar never grows history. */
  go: (tab: TabName, options?: { shelfTab?: 'library' | 'downloads' }) => void;
  back: () => void;
  canGoBack: boolean;
  isTabRoot: boolean;
  activeTab: TabName;
}

const NavContext = createContext<NavContextValue | null>(null);

const rootFor = (tab: TabName): Route => (tab === 'shelf' ? { name: 'shelf' } : { name: tab });

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const route = stack[stack.length - 1];

  const push = useCallback((next: Route) => {
    setStack((prev) => [...prev, next]);
  }, []);

  const replace = useCallback((next: Route) => {
    setStack((prev) => [...prev.slice(0, -1), next]);
  }, []);

  const go = useCallback((tab: TabName, options?: { shelfTab?: 'library' | 'downloads' }) => {
    setStack([tab === 'shelf' ? { name: 'shelf', tab: options?.shelfTab } : rootFor(tab)]);
  }, []);

  const back = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        back();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [back, stack.length]);

  const value = useMemo(
    () => ({
      route,
      stack,
      push,
      replace,
      go,
      back,
      canGoBack: stack.length > 1,
      isTabRoot: stack.length === 1,
      activeTab: tabOf(route),
    }),
    [route, stack, push, replace, go, back],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const context = useContext(NavContext);
  if (!context) throw new Error('useNav must be used inside <NavProvider>');
  return context;
}

export function TabBar() {
  useThemeName();
  const { activeTab, go } = useNav();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, TABS.findIndex((tab) => tab.key === activeTab));
  const slide = useRef(new Animated.Value(index)).current;

  // One highlight rectangle glides between tabs instead of blinking per icon.
  useEffect(() => {
    if (reducedMotion) {
      slide.setValue(index);
      return;
    }
    Animated.spring(slide, {
      toValue: index,
      useNativeDriver: true,
      stiffness: 340,
      damping: 34,
      mass: 0.7,
    }).start();
  }, [index, reducedMotion, slide]);

  const slot = width > 0 ? width / TABS.length : 0;

  return (
    <View
      style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {slot > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tabPillOn,
            {
              position: 'absolute',
              top: spacing.sm,
              left: 0,
              marginLeft: (slot - 56) / 2,
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: TABS.map((_, i) => i),
                    outputRange: TABS.map((_, i) => i * slot),
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      {/* atsu's bar is icon-only: filled and white when active, outline and grey otherwise. */}
      {TABS.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            onPress={() => go(tab.key)}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
          >
            <View style={styles.tabPill}>
              <Icon
                name={active ? tab.iconActive : tab.icon}
                size={23}
                color={active ? colors.text : colors.textFaint}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The shared page frame: dark background, an optional header, the content, an
 * optional sticky footer, and the tab bar on tab roots.
 */
export function Screen({
  title,
  subtitle,
  brand,
  onBack,
  right,
  children,
  footer,
  showTabs = true,
  contentStyle,
}: {
  title?: string;
  subtitle?: string;
  /** Show the ATSU wordmark instead of a title (Home). */
  brand?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showTabs?: boolean;
  contentStyle?: object;
}) {
  const { isTabRoot } = useNav();
  const insets = useSafeAreaInsets();
  const withTabs = showTabs && isTabRoot;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {brand ? (
        <View style={styles.brandHeader}>
          <View style={styles.brandRow}>
            <Text style={styles.brandMark} accessibilityRole="header">
            ATSU
          </Text>
            <View style={styles.brandDot} />
          </View>
          <View style={styles.headerActions}>{right}</View>
        </View>
      ) : null}

      {!brand && (title || onBack || right) ? (
        <View style={styles.header}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
            >
              <Icon name="chevron-back" size={22} color={colors.text} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            {title ? (
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View style={styles.headerActions}>{right}</View>
        </View>
      ) : null}

      <View style={[styles.body, contentStyle]}>{children}</View>

      {footer ? (
        <View style={[styles.footer, { paddingBottom: withTabs ? spacing.md : Math.max(insets.bottom, spacing.lg) }]}>
          {footer}
        </View>
      ) : null}

      {withTabs ? <TabBar /> : null}
    </SafeAreaView>
  );
}

export { Icon };
export type { IconName };

const styles = makeStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.bg },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  brandRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  brandMark: { ...type.brand, color: colors.text },
  brandDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    marginLeft: -6,
  },
  title: { ...type.title, color: colors.text, fontSize: 20 },
  subtitle: { ...type.small, color: colors.textFaint, marginTop: 2, fontWeight: '400' },
  headerActions: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  body: { flex: 1 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  // atsu lifts the active tab icon onto a soft rounded square instead of a label.
  tabPill: {
    width: 56,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPillOn: { backgroundColor: colors.card },
}));

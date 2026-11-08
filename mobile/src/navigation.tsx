/**
 * A deliberately tiny router.
 *
 * Five screens with no deep links do not justify a navigation dependency, and
 * this keeps the web preview and Expo Go builds identical.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from './components/ui';
import { colors, spacing, type } from './theme';

export type Route =
  | { name: 'home' }
  | { name: 'manga'; mangaId: string }
  | { name: 'queue' }
  | { name: 'reader'; mangaId: string; chapterId: string }
  | { name: 'settings' };

interface NavContextValue {
  route: Route;
  stack: Route[];
  push: (route: Route) => void;
  replace: (route: Route) => void;
  back: () => void;
  canGoBack: boolean;
}

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);

  const push = useCallback((route: Route) => {
    setStack((prev) => [...prev, route]);
  }, []);

  const replace = useCallback((route: Route) => {
    setStack((prev) => [...prev.slice(0, -1), route]);
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
      route: stack[stack.length - 1],
      stack,
      push,
      replace,
      back,
      canGoBack: stack.length > 1,
    }),
    [stack, push, replace, back],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const context = useContext(NavContext);
  if (!context) throw new Error('useNav must be used inside <NavProvider>');
  return context;
}

export function Screen({
  title,
  subtitle,
  onBack,
  right,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={styles.backButton} accessibilityRole="button">
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        ) : (
          <View style={styles.brand}>
            <Text style={styles.brandMark}>ATSU</Text>
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>{right}</View>
      </View>
      <View style={styles.body}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export { IconButton };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  brand: { minWidth: 40 },
  brandMark: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backGlyph: { color: colors.text, fontSize: 22, lineHeight: 24, marginTop: -2 },
  headerText: { flex: 1 },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.small, color: colors.textDim, marginTop: 1 },
  headerRight: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  body: { flex: 1 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.card,
  },
});

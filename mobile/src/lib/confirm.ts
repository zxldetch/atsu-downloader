import { Alert, Platform } from 'react-native';

/** Alert.alert is a no-op on react-native-web, so fall back to window.confirm. */
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = 'Confirm',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ok = typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`);
    return Promise.resolve(Boolean(ok));
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

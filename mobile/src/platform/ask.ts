import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * A native choice dialog (Alert). The web build has no Alert, so it falls back to the
 * browser's confirm boxes: first the main action, then the destructive one.
 */
export function ask(title: string, message: string, buttons: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const main = buttons.find((b) => b.style !== 'cancel' && b.style !== 'destructive');
  const destructive = buttons.find((b) => b.style === 'destructive');
  if (main && window.confirm(`${title}\n${message}\n\n확인을 누르면: ${main.text}`)) {
    main.onPress?.();
    return;
  }
  if (destructive && window.confirm(`${title}\n${message}\n\n확인을 누르면: ${destructive.text}`)) destructive.onPress?.();
}

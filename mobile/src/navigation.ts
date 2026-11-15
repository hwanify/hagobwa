import { router } from 'expo-router';

/**
 * Return to the tab screens without stacking a second copy of them.
 * `replace('/')` from a modal pushed a new (tabs) instance on top of the old one,
 * which showed up as two identical tab screens.
 */
export function goHome(): void {
  router.dismissTo('/');
}

/** Close the current modal, or go home if there is nothing to go back to. */
export function closeScreen(): void {
  if (router.canGoBack()) router.back();
  else goHome();
}

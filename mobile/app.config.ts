import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * EXPO_BASE_URL lets the web build live under a sub-path,
 * e.g. EXPO_BASE_URL=/app npx expo export --platform web
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});

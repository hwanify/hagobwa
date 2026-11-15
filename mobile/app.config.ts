import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json holds the config; this only adds the Apple Team ID, which the Screen Time
 * extensions need for signing. It comes from the APPLE_TEAM_ID env var (EAS environment
 * "production", set by the release workflow from the GitHub secret).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const appleTeamId = process.env.APPLE_TEAM_ID || process.env.EXPO_APPLE_TEAM_ID;
  return {
    ...(config as ExpoConfig),
    ios: { ...config.ios, ...(appleTeamId ? { appleTeamId } : {}) },
  };
};

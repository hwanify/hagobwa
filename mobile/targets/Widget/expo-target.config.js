/** Home screen widget: small = big minutes (B-5), medium = dark ring (B-3). */
/** @type {import('@kingstinct/expo-apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: 'widget',
  name: 'Widget',
  deploymentTarget: '17.0',
  colors: {
    $widgetBackground: '#1C1C1A',
    $accent: '#E0454A',
  },
  entitlements: {
    'com.apple.security.application-groups': ['group.com.hagobwa.app'],
  },
});

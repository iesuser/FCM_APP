const fs = require('fs');
const path = require('path');
const { withAndroidManifest } = require('@expo/config-plugins');

const ANDROID_PACKAGE = 'com.fcmapp.location';

const NOTIFICATION_CHANNEL = 'com.google.firebase.messaging.default_notification_channel_id';
const NOTIFICATION_COLOR = 'com.google.firebase.messaging.default_notification_color';

function withFirebaseNotificationManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const application = manifest.application?.[0];
    for (const item of application?.['meta-data'] ?? []) {
      const name = item.$?.['android:name'];
      if (name === NOTIFICATION_CHANNEL) {
        item.$['tools:replace'] = 'android:value';
      }
      if (name === NOTIFICATION_COLOR) {
        item.$['tools:replace'] = 'android:resource';
      }
    }

    return config;
  });
}

/** @param {{ config: import('expo/config').ExpoConfig }} context */
module.exports = ({ config }) => {
  const root = process.cwd();
  const androidServices = fs.existsSync(path.join(root, 'google-services.json'));
  const iosServices = fs.existsSync(path.join(root, 'GoogleService-Info.plist'));

  const configured = {
    ...config,
    name: 'FCM და ლოკაცია',
    slug: config.slug ?? 'FCM_APP',
    scheme: config.scheme ?? 'fcmapp',
    android: {
      ...config.android,
      package: ANDROID_PACKAGE,
      permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
      ...(androidServices ? { googleServicesFile: './google-services.json' } : {}),
    },
    ios: {
      ...config.ios,
      bundleIdentifier: ANDROID_PACKAGE,
      supportsTablet: true,
      infoPlist: {
        ...config.ios?.infoPlist,
        UIBackgroundModes: ['remote-notification'],
      },
      ...(iosServices ? { googleServicesFile: './GoogleService-Info.plist' } : {}),
    },
    plugins: [
      'expo-router',
      '@react-native-firebase/app',
      '@react-native-firebase/messaging',
      [
        'expo-build-properties',
        {
          ios: {
            useFrameworks: 'dynamic',
          },
        },
      ],
      [
        'expo-notifications',
        {
          color: '#1456C0',
          defaultChannel: 'default',
          enableBackgroundRemoteNotifications: true,
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'ლოკაცია საჭიროა კოორდინატების სერვერზე გასაგზავნად.',
          locationAlwaysAndWhenInUsePermission:
            'ლოკაცია საჭიროა კოორდინატების სერვერზე გასაგზავნად.',
        },
      ],
      ...(process.env.GOOGLE_MAPS_API_KEY
        ? [[
            'react-native-maps',
            { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY },
          ]]
        : []),
    ],
  };

  return withFirebaseNotificationManifest(configured);
};

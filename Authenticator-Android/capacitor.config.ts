import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.keyra.authenticator',
  appName: 'Keyra Authenticator',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    },
    StatusBar: {
      style: 'default',
      backgroundColor: '#ffffff'
    },
    PrivacyScreen: {
      // Disabled at startup — PrivacyManager enables it programmatically
      // based on the user's screenGuardian setting
      enable: false
    }
  }
};

export default config;

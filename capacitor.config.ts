import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.animesky.app',
  appName: 'Anime Sky',
  webDir: 'dist/public',
  server: {
    url: 'http://192.168.10.100:3000',
    cleartext: true
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#060814'
  }
};

export default config;

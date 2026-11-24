import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.animesky.app',
  appName: 'Anime Sky',
  webDir: 'dist',
  server: {
    url: 'http://192.168.10.100:3000',
    cleartext: true
  }
};

export default config;


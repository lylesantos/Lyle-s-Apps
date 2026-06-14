import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vibeplayer.app',
  appName: 'VibePlayer',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;

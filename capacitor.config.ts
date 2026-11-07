import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tv.topo.topotv',
  appName: 'TOPOTV',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
};

export default config;

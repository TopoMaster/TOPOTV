import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'tv.topo.topotv',
  appName: 'TOPOTV',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // iconos claros en las barras del sistema (la app siempre es oscura)
    SystemBars: { style: 'DARK' },
  },
};

export default config;

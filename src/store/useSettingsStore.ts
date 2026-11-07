import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AceBackendConfig, BackendStatus, PlaybackConfig } from '@/types';
import { checkBackendStatus } from '@/lib/aceApi';
import type { PlayerApp } from '@/lib/aceApi';

interface SettingsState {
  backendConfig: AceBackendConfig; backendStatus: BackendStatus;
  theme: 'dark' | 'light'; manualEpgUrl: string;
  preferredPlayer: PlayerApp;
  playback: PlaybackConfig;
  setBackendConfig: (cfg: Partial<AceBackendConfig>) => void;
  checkBackend: () => Promise<void>;
  setTheme: (t: 'dark' | 'light') => void;
  setManualEpgUrl: (url: string) => void;
  setPreferredPlayer: (p: PlayerApp) => void;
  setPlayback: (cfg: Partial<PlaybackConfig>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      backendConfig: { host: '127.0.0.1', port: 6878 },
      backendStatus: 'unknown', theme: 'dark', manualEpgUrl: '',
      preferredPlayer: 'vlc',
      playback: {
        vlcNetworkCachingMs: 3000,
        vlcLiveCachingMs: 3000,
        hlsLiveSyncDurationCount: 3,
        hlsMaxBufferLengthSec: 30,
        hlsManifestLoadingMaxRetry: 4,
        hlsFragLoadingMaxRetry: 6,
      },
      setBackendConfig: (cfg) => set(s => ({ backendConfig: { ...s.backendConfig, ...cfg } })),
      checkBackend: async () => { const status = await checkBackendStatus(get().backendConfig); set({ backendStatus: status }); },
      setTheme: (theme) => set({ theme }),
      setManualEpgUrl: (url) => set({ manualEpgUrl: url }),
      setPreferredPlayer: (preferredPlayer) => set({ preferredPlayer }),
      setPlayback: (cfg) => set(s => ({ playback: { ...s.playback, ...cfg } })),
    }),
    {
      name: 'acestream-tv-settings',
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsState> | undefined;
        return {
          ...currentState,
          ...persisted,
          playback: { ...currentState.playback, ...persisted?.playback },
        };
      },
    }
  )
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AceBackendConfig, BackendStatus, PlaybackConfig } from '@/types';
import { checkBackendStatus } from '@/lib/aceApi';
import type { PlayerApp } from '@/lib/aceApi';

export type TvMode = 'auto' | 'on' | 'off';

interface SettingsState {
  backendConfig: AceBackendConfig; backendStatus: BackendStatus;
  theme: 'dark' | 'light'; manualEpgUrl: string;
  preferredPlayer: PlayerApp;
  m3uSourceUrls: string[];
  /** Canales de TDT en abierto (lista incluida en la app) */
  includeTdt: boolean;
  /** Android: conectar WARP integrado al actualizar la agenda y apagarlo al terminar */
  warpAuto: boolean;
  /** Android: abrir la app del motor AceStream al iniciar TOPOTV si no está en marcha */
  engineAutoStart: boolean;
  /** Enlace privado (https) desde el que instalar el APK del motor, y token opcional si el sitio lo exige */
  engineApkUrl: string;
  engineApkToken: string;
  /** Modo TV: interfaz grande y navegable con mando. 'auto' lo activa solo en Android TV. */
  tvMode: TvMode;
  onboardingDone: boolean;
  playback: PlaybackConfig;
  setBackendConfig: (cfg: Partial<AceBackendConfig>) => void;
  checkBackend: () => Promise<void>;
  setTheme: (t: 'dark' | 'light') => void;
  setManualEpgUrl: (url: string) => void;
  setPreferredPlayer: (p: PlayerApp) => void;
  setM3uSourceUrls: (urls: string[]) => void;
  setIncludeTdt: (v: boolean) => void;
  setWarpAuto: (v: boolean) => void;
  setEngineAutoStart: (v: boolean) => void;
  setEngineApk: (url: string, token: string) => void;
  setTvMode: (m: TvMode) => void;
  setOnboardingDone: (v: boolean) => void;
  setPlayback: (cfg: Partial<PlaybackConfig>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      backendConfig: { host: '127.0.0.1', port: 6878 },
      backendStatus: 'unknown', theme: 'dark', manualEpgUrl: '',
      preferredPlayer: 'vlc',
      m3uSourceUrls: [],
      includeTdt: true, warpAuto: true, engineAutoStart: true, engineApkUrl: '', engineApkToken: '', tvMode: 'auto', onboardingDone: false,
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
      setM3uSourceUrls: (m3uSourceUrls) => set({ m3uSourceUrls }),
      setIncludeTdt: (includeTdt) => set({ includeTdt }),
      setWarpAuto: (warpAuto) => set({ warpAuto }),
      setEngineAutoStart: (engineAutoStart) => set({ engineAutoStart }),
      setEngineApk: (engineApkUrl, engineApkToken) => set({ engineApkUrl: engineApkUrl.trim(), engineApkToken: engineApkToken.trim() }),
      setTvMode: (tvMode) => set({ tvMode }),
      setOnboardingDone: (onboardingDone) => set({ onboardingDone }),
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

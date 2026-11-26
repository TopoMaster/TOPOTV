import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AceBackendConfig, BackendStatus, PlaybackConfig } from '@/types';
import { Capacitor } from '@capacitor/core';
import { checkBackendStatus } from '@/lib/aceApi';
import type { PlayerApp } from '@/lib/aceApi';

export type TvMode = 'auto' | 'on' | 'off';
export type FontScale = 'small' | 'normal' | 'large' | 'xl';
/** Temas de color (todos oscuros; el claro se retiró) */
export type ThemeId = 'gold' | 'emerald' | 'ocean' | 'sunset' | 'violet';
export const THEME_IDS: ThemeId[] = ['gold', 'emerald', 'ocean', 'sunset', 'violet'];
export type FontFamily = 'topotv' | 'system' | 'legible';

interface SettingsState {
  backendConfig: AceBackendConfig; backendStatus: BackendStatus;
  theme: ThemeId; manualEpgUrl: string;
  /** Fondo negro puro (pantallas OLED: más contraste y menos batería) */
  amoled: boolean;
  fontFamily: FontFamily;
  /** Traducir solo la guía, las fichas y las descripciones que estén en otro idioma */
  translateAuto: boolean;
  /** Idioma al que se traduce (y preferido para audio y subtítulos en Cine y series) */
  translateTo: string;
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
  /** Comprobar enlaces en segundo plano (Windows) y dejar los caídos al final */
  autoCheck: boolean;
  /** Ocultar (en vez de dejar al final) los canales cuyos enlaces están todos caídos */
  hideDead: boolean;
  /** Avisar en Windows de que hay una versión nueva en GitHub */
  autoUpdateCheck: boolean;
  /** Minutos de antelación del aviso de un evento marcado con la campana */
  reminderLead: number;
  /** Equipos o competiciones favoritos (se resaltan en Eventos y salen en la portada) */
  favTeams: string[];
  fontScale: FontScale;
  playback: PlaybackConfig;
  setBackendConfig: (cfg: Partial<AceBackendConfig>) => void;
  checkBackend: () => Promise<void>;
  setTheme: (t: ThemeId) => void;
  setAmoled: (v: boolean) => void;
  setFontFamily: (f: FontFamily) => void;
  setTranslate: (auto: boolean, to?: string) => void;
  setManualEpgUrl: (url: string) => void;
  setPreferredPlayer: (p: PlayerApp) => void;
  setM3uSourceUrls: (urls: string[]) => void;
  setIncludeTdt: (v: boolean) => void;
  setWarpAuto: (v: boolean) => void;
  setEngineAutoStart: (v: boolean) => void;
  setEngineApk: (url: string, token: string) => void;
  setTvMode: (m: TvMode) => void;
  setOnboardingDone: (v: boolean) => void;
  setAutoCheck: (v: boolean) => void;
  setHideDead: (v: boolean) => void;
  setAutoUpdateCheck: (v: boolean) => void;
  setReminderLead: (m: number) => void;
  setFavTeams: (t: string[]) => void;
  setFontScale: (f: FontScale) => void;
  setPlayback: (cfg: Partial<PlaybackConfig>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      backendConfig: { host: '127.0.0.1', port: 6878 },
      backendStatus: 'unknown', theme: 'gold', amoled: false, fontFamily: 'topotv', translateAuto: true, translateTo: 'es', manualEpgUrl: '',
      preferredPlayer: Capacitor.isNativePlatform() ? 'native' : 'browser',   // Android: el integrado; Windows: dentro de la app (VLC si el formato no es compatible)
      
      m3uSourceUrls: [],
      includeTdt: true, warpAuto: true, engineAutoStart: true, engineApkUrl: '', engineApkToken: '', tvMode: 'auto', onboardingDone: false,
      autoCheck: true, hideDead: false, autoUpdateCheck: true, reminderLead: 10, favTeams: [], fontScale: 'normal',
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
      setAmoled: (amoled) => set({ amoled }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setTranslate: (translateAuto, to) => set(s => ({ translateAuto, translateTo: to ?? s.translateTo })),
      setManualEpgUrl: (url) => set({ manualEpgUrl: url }),
      setPreferredPlayer: (preferredPlayer) => set({ preferredPlayer }),
      setM3uSourceUrls: (m3uSourceUrls) => set({ m3uSourceUrls }),
      setIncludeTdt: (includeTdt) => set({ includeTdt }),
      setWarpAuto: (warpAuto) => set({ warpAuto }),
      setEngineAutoStart: (engineAutoStart) => set({ engineAutoStart }),
      setEngineApk: (engineApkUrl, engineApkToken) => set({ engineApkUrl: engineApkUrl.trim(), engineApkToken: engineApkToken.trim() }),
      setTvMode: (tvMode) => set({ tvMode }),
      setOnboardingDone: (onboardingDone) => set({ onboardingDone }),
      setAutoCheck: (autoCheck) => set({ autoCheck }),
      setHideDead: (hideDead) => set({ hideDead }),
      setAutoUpdateCheck: (autoUpdateCheck) => set({ autoUpdateCheck }),
      setReminderLead: (reminderLead) => set({ reminderLead }),
      setFavTeams: (favTeams) => set({ favTeams }),
      setFontScale: (fontScale) => set({ fontScale }),
      setPlayback: (cfg) => set(s => ({ playback: { ...s.playback, ...cfg } })),
    }),
    {
      name: 'acestream-tv-settings',
      // v2: el reproductor por defecto de Windows pasa a ser el de la app (antes VLC); se cambia una sola vez
      version: 2,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        if (version < 2 && p.preferredPlayer === 'vlc' && !Capacitor.isNativePlatform()) p.preferredPlayer = 'browser';
        return p as SettingsState;
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsState> | undefined;
        return {
          ...currentState,
          ...persisted,
          playback: { ...currentState.playback, ...persisted?.playback },
          // los antiguos «dark»/«light» pasan al tema por defecto
          theme: THEME_IDS.includes(persisted?.theme as ThemeId) ? persisted!.theme as ThemeId : currentState.theme,
        };
      },
    }
  )
);

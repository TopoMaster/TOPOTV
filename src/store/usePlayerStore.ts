import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import type { Channel, PlayerState, Stream } from '@/types';
import { openInPlayer, requestPlay } from '@/lib/aceApi';
import { useSettingsStore } from './useSettingsStore';
import { useHistoryStore } from './useHistoryStore';

interface PlayerStore extends PlayerState {
  play: (channel: Channel, stream?: Stream) => Promise<void>;
  stop: () => void;
  setStream: (stream: Stream) => void;
  setStatus: (status: PlayerState['status'], errorMessage?: string | null) => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  channel: null, stream: null, status: 'idle', errorMessage: null, startedAt: null,
  play: async (channel, stream) => {
    const target = stream ?? channel.streams[0];
    if (!target) { set({ status: 'error', errorMessage: 'No hay streams disponibles' }); return; }
    set({ channel, stream: target, status: 'connecting', errorMessage: null, startedAt: new Date() });
    const { backendConfig, preferredPlayer, playback } = useSettingsStore.getState();
    const player = Capacitor.isNativePlatform() ? 'browser' : preferredPlayer;
    const result = await requestPlay(target, backendConfig);
    if (!result.ok) { set({ status: 'error', errorMessage: result.error ?? 'Error de conexión' }); return; }
    const opened = await openInPlayer(target, backendConfig, player, playback);
    if (!opened.ok) { set({ status: 'error', errorMessage: opened.error ?? 'No se pudo abrir el reproductor' }); return; }
    useHistoryStore.getState().push(channel);
    // En modo navegador, <PlayerOverlay/> pasa a 'playing' cuando el vídeo arranca
    if (player !== 'browser') set({ status: 'playing' });
  },
  stop: () => set({ channel: null, stream: null, status: 'idle', errorMessage: null, startedAt: null }),
  setStream: (stream) => set({ stream }),
  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),
}));

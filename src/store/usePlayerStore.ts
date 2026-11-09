import { create } from 'zustand';
import type { Channel, PlayerState, Stream } from '@/types';
import { openInPlayer, requestPlay } from '@/lib/aceApi';
import { useSettingsStore } from './useSettingsStore';
import { useHistoryStore } from './useHistoryStore';
import { orderStreams, useHealthStore } from './useHealthStore';

interface PlayerStore extends PlayerState {
  /** Enlaces ya probados en esta reproducción (para no repetir al saltar al siguiente) */
  tried: string[];
  play: (channel: Channel, stream?: Stream) => Promise<void>;
  /** Pasa al siguiente enlace del canal (los que se sabe que funcionan, primero). Devuelve false si no quedan. */
  playNext: () => Promise<boolean>;
  /** El enlace actual no arranca: lo anota como caído y prueba el siguiente. Si se pasa `failedAceId`, se ignora cuando ya no es el enlace actual (avisos repetidos de un mismo fallo). */
  reportFailure: (message?: string, failedAceId?: string) => Promise<void>;
  stop: () => void;
  setStream: (stream: Stream) => void;
  setStatus: (status: PlayerState['status'], errorMessage?: string | null) => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  let failing = false;   // evita que dos errores seguidos del mismo enlace salten dos veces
  /** Abre un enlace concreto con el reproductor elegido. */
  async function open(channel: Channel, target: Stream) {
    set({ channel, stream: target, status: 'connecting', errorMessage: null, startedAt: new Date() });
    const { backendConfig, preferredPlayer, playback } = useSettingsStore.getState();
    const result = await requestPlay(target, backendConfig);
    if (!result.ok) { set({ status: 'error', errorMessage: result.error ?? 'Error de conexión' }); return false; }
    const opened = await openInPlayer(target, backendConfig, preferredPlayer, playback);
    if (!opened.ok) { set({ status: 'error', errorMessage: opened.error ?? 'No se pudo abrir el reproductor' }); return false; }
    useHistoryStore.getState().push(channel);
    // En modo navegador, <PlayerOverlay/> pasa a 'playing' cuando el vídeo arranca
    if (preferredPlayer !== 'browser') set({ status: 'playing' });
    return true;
  }

  return {
    channel: null, stream: null, status: 'idle', errorMessage: null, startedAt: null, tried: [],
    play: async (channel, stream) => {
      useHealthStore.getState().touchPlay();
      // sin enlace elegido a mano: el que se sabe que funciona va primero y los caídos, al final
      const target = stream ?? orderStreams(channel.streams, useHealthStore.getState().streams)[0];
      if (!target) { set({ status: 'error', errorMessage: 'No hay streams disponibles' }); return; }
      set({ tried: [target.aceId] });
      await open(channel, target);
    },
    playNext: async () => {
      const { channel, tried } = get();
      if (!channel) return false;
      const next = orderStreams(channel.streams, useHealthStore.getState().streams).find(s => !tried.includes(s.aceId));
      if (!next) return false;
      set({ tried: [...tried, next.aceId] });
      useHealthStore.getState().touchPlay();
      return open(channel, next);
    },
    reportFailure: async (message, failedAceId) => {
      const { stream } = get();
      if (failedAceId && stream?.aceId !== failedAceId) return;   // ese fallo ya se gestionó
      if (failing) return;
      failing = true;
      try {
      if (stream && !stream.direct) useHealthStore.getState().mark(stream.aceId, false);
      const { channel, tried } = get();
      const hasNext = !!channel && orderStreams(channel.streams, useHealthStore.getState().streams).some(s => !tried.includes(s.aceId));
      if (hasNext) { await get().playNext(); return; }
      set({ status: 'error', errorMessage: message ?? 'Se probaron todos los enlaces del canal y ninguno arranca. Inténtalo más tarde.' });
      } finally { failing = false; }
    },
    stop: () => set({ channel: null, stream: null, status: 'idle', errorMessage: null, startedAt: null, tried: [] }),
    setStream: stream => set({ stream }),
    setStatus: (status, errorMessage = null) => set({ status, errorMessage }),
  };
});

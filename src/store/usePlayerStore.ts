import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import type { Channel, PlayerState, Stream } from '@/types';
import { openInPlayer, requestPlay } from '@/lib/aceApi';
import { startTorrent, stopTorrents, torrentId, torrentStatus } from '@/lib/torrent';
import { useSettingsStore } from './useSettingsStore';
import { useHistoryStore } from './useHistoryStore';
import { useProgressStore } from './useProgressStore';
import { orderStreams, useHealthStore } from './useHealthStore';

interface PlayerStore extends PlayerState {
  /** Enlaces ya probados en esta reproducción (para no repetir al saltar al siguiente) */
  tried: string[];
  /** Texto de progreso mientras se prepara (p. ej. «Buscando fuentes del torrent…») */
  detail: string | null;
  /** Segundo por el que reanudar (películas y episodios de addons) */
  resumeAt: number;
  play: (channel: Channel, stream?: Stream) => Promise<void>;
  /** Pasa al siguiente enlace del canal (los que se sabe que funcionan, primero). Devuelve false si no quedan. */
  playNext: () => Promise<boolean>;
  /** El enlace actual no arranca: lo anota como caído y prueba el siguiente. Si se pasa `failedAceId`, se ignora cuando ya no es el enlace actual (avisos repetidos de un mismo fallo). */
  reportFailure: (message?: string, failedAceId?: string) => Promise<void>;
  stop: () => void;
  setStream: (stream: Stream) => void;
  setStatus: (status: PlayerState['status'], errorMessage?: string | null) => void;
}

const mb = (n: number) => `${(n / 1048576).toFixed(n > 1e8 ? 0 : 1)} MB`;

export const usePlayerStore = create<PlayerStore>((set, get) => {
  let failing = false;   // evita que dos errores seguidos del mismo enlace salten dos veces
  let openId = 0;        // descarta respuestas tardías si el usuario ya eligió otra cosa

  /** Los torrents se abren con el motor de Windows: devuelve el enlace local ya listo para reproducir. */
  async function resolveTorrent(target: Stream, my: number): Promise<Stream | null> {
    if (!target.torrent) return target;
    if (Capacitor.isNativePlatform()) { set({ status: 'error', errorMessage: 'Los torrents solo se pueden reproducir en la app de Windows (necesitan su motor de torrents).' }); return null; }
    try {
      const url = await startTorrent(target.torrent, st => { if (my === openId) set({ detail: st.peers > 0 || st.downloaded > 0 ? `Torrent: ${st.peers} pares · ${mb(st.downloaded)}` : 'Buscando fuentes del torrent…' }); });
      if (my !== openId) return null;
      return { ...target, url, direct: true };
    } catch (e) {
      if (my === openId) set({ status: 'error', errorMessage: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }

  /** Mientras el torrent no da vídeo: enseña pares y descargado y, si en 90 s no llega nada, salta al siguiente enlace. */
  function watchTorrent(target: Stream, my: number) {
    if (!target.torrent) return;
    const id = torrentId(target.torrent);
    const t0 = Date.now();
    const timer = setInterval(async () => {
      if (my !== openId || get().status !== 'connecting') { clearInterval(timer); return; }
      try {
        const st = await torrentStatus(id);
        if (my !== openId || get().status !== 'connecting') return;
        set({ detail: st.peers > 0 || st.downloaded > 0 ? `Torrent: ${st.peers} pares · ${mb(st.downloaded)} descargados` : 'Buscando fuentes del torrent…' });
        if (Date.now() - t0 > 90000 && st.downloaded < 1048576) { clearInterval(timer); void get().reportFailure('El torrent no recibe datos (no hay fuentes disponibles). Prueba otro enlace.', target.aceId); }
      } catch { /* sin estado: se reintenta */ }
    }, 2000);
  }

  /** Abre un enlace concreto con el reproductor elegido. */
  async function open(channel: Channel, target: Stream) {
    const my = ++openId;
    if (get().stream?.torrent && get().stream?.aceId !== target.aceId) void stopTorrents();   // se deja el torrent anterior
    const saved = channel.vod ? useProgressStore.getState().get(channel.vod.type, channel.vod.videoId) : undefined;
    set({ channel, stream: target, status: 'connecting', errorMessage: null, startedAt: new Date(), detail: target.torrent ? 'Buscando fuentes del torrent…' : null, resumeAt: saved && saved.dur > 0 && saved.pos / saved.dur < 0.95 ? saved.pos : 0 });
    const resolved = await resolveTorrent(target, my);
    if (!resolved) return false;
    if (resolved !== target) set({ stream: resolved });
    if (target.torrent) watchTorrent(target, my);
    const { backendConfig, preferredPlayer, playback } = useSettingsStore.getState();
    const result = await requestPlay(resolved, backendConfig);
    if (!result.ok) { set({ status: 'error', errorMessage: result.error ?? 'Error de conexión' }); return false; }
    const opened = await openInPlayer(resolved, backendConfig, preferredPlayer, playback, { title: channel.name, resumeMs: get().resumeAt * 1000, subtitles: channel.vod?.subtitles });
    if (!opened.ok) { set({ status: 'error', errorMessage: opened.error ?? 'No se pudo abrir el reproductor' }); return false; }
    if (!target.torrent) set({ detail: null });
    // reproductor integrado de Android: al cerrarse devuelve dónde se quedó y si falló (entonces se salta al siguiente enlace)
    if (opened.done) void opened.done.then(r => {
      if (my !== openId) return;
      if (channel.vod && r.duration > 0) useProgressStore.getState().save({ type: channel.vod.type, id: channel.vod.id, videoId: channel.vod.videoId, addon: channel.vod.addon, title: channel.vod.title, poster: channel.vod.poster, pos: r.position / 1000, dur: r.duration / 1000 });
      if (r.error && r.position < 5000) { void get().reportFailure(`No se pudo reproducir (${r.error}).`, resolved.aceId); return; }
      get().stop();
    });
    useHistoryStore.getState().push(channel);
    // En modo navegador, <PlayerOverlay/> pasa a 'playing' cuando el vídeo arranca
    if (preferredPlayer !== 'browser') set({ status: 'playing' });
    return true;
  }

  return {
    channel: null, stream: null, status: 'idle', errorMessage: null, startedAt: null, tried: [], detail: null, resumeAt: 0,
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
    stop: () => {
      openId++;
      if (get().stream?.torrent) void stopTorrents();
      set({ channel: null, stream: null, status: 'idle', errorMessage: null, startedAt: null, tried: [], detail: null, resumeAt: 0 });
    },
    setStream: stream => set({ stream }),
    setStatus: (status, errorMessage = null) => set({ status, errorMessage }),
  };
});

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Channel, Stream } from '@/types';

/**
 * Estado de los enlaces: lo que sabemos de cada stream por haberlo comprobado (en segundo plano o al reproducir).
 * Un resultado vale 24 h; pasado ese tiempo el enlace vuelve a «sin comprobar».
 */
export type StreamHealth = 'ok' | 'dead' | 'unknown';
interface Entry { ok: boolean; at: number; }
const TTL = 24 * 3600e3;
const MAX_ENTRIES = 4000;

interface HealthState {
  streams: Record<string, Entry>;
  /** Último momento en que el usuario reprodujo algo (la comprobación en segundo plano se aparta mientras ve la tele) */
  lastPlayAt: number;
  mark: (aceId: string, ok: boolean) => void;
  touchPlay: () => void;
  clear: () => void;
}

export const useHealthStore = create<HealthState>()(
  persist(
    (set, get) => ({
      streams: {}, lastPlayAt: 0,
      mark: (aceId, ok) => {
        const streams = { ...get().streams, [aceId]: { ok, at: Date.now() } };
        const keys = Object.keys(streams);
        if (keys.length > MAX_ENTRIES) for (const k of keys.sort((a, b) => streams[a].at - streams[b].at).slice(0, keys.length - MAX_ENTRIES)) delete streams[k];
        set({ streams });
      },
      touchPlay: () => set({ lastPlayAt: Date.now() }),
      clear: () => set({ streams: {} }),
    }),
    { name: 'topotv-health', partialize: s => ({ streams: s.streams, lastPlayAt: s.lastPlayAt }) },
  ),
);

export function streamHealth(streams: Record<string, Entry>, s: Stream): StreamHealth {
  if (s.direct) return 'ok';
  const e = streams[s.aceId];
  if (!e || Date.now() - e.at > TTL) return 'unknown';
  return e.ok ? 'ok' : 'dead';
}

/** Mejores enlaces primero: funcionan → sin comprobar → caídos (mantiene el orden original dentro de cada grupo). */
export function orderStreams(streams: Stream[], map: Record<string, Entry>): Stream[] {
  const rank = { ok: 0, unknown: 1, dead: 2 } as const;
  return streams.map((s, i) => ({ s, i, r: rank[streamHealth(map, s)] })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.s);
}

/** ¿Están todos los enlaces del canal caídos (comprobados en las últimas 24 h)? */
export function channelDead(channel: Channel, map: Record<string, Entry>): boolean {
  return channel.streams.length > 0 && channel.streams.every(s => streamHealth(map, s) === 'dead');
}

/** Canales con los caídos al final, respetando el orden original del resto. */
export function sortAlive(channels: Channel[], map: Record<string, Entry>): Channel[] {
  const dead = channels.filter(c => channelDead(c, map));
  return dead.length ? [...channels.filter(c => !dead.includes(c)), ...dead] : channels;
}

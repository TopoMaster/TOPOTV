import { create } from 'zustand';
import type { Channel, Stream } from '@/types';
import { probeStream } from '@/lib/probe';
import { useSettingsStore } from './useSettingsStore';
import { useHealthStore } from './useHealthStore';
import { usePlayerStore } from './usePlayerStore';

export type CheckStatus = 'pending' | 'checking' | 'online' | 'offline' | 'timeout';
export interface CheckRow { key: string; channelId: string; channelName: string; group: string; streamLabel: string; aceId: string; status: CheckStatus; ms?: number }

interface CheckerState {
  rows: CheckRow[];
  running: boolean;
  /** En pausa porque estás viendo un canal (para no quitarle motor ni red) */
  paused: boolean;
  done: number;
  /** Enlaces que se están comprobando ahora mismo (botón de la ficha del canal) */
  checking: Record<string, boolean>;
  /** Comprueba todas las opciones de los canales indicados, en segundo plano (sigue aunque cambies de página) */
  start: (channels: Channel[], opts: { timeoutMs: number; parallel: number }) => void;
  stop: () => void;
  clear: () => void;
  /** Comprueba unos enlaces sueltos ahora (ficha del canal) y deja anotado el resultado */
  checkStreams: (streams: Stream[], timeoutMs?: number) => Promise<void>;
}

let runId = 0;

export const useCheckerStore = create<CheckerState>((set, get) => ({
  rows: [], running: false, paused: false, done: 0, checking: {},

  start: (channels, { timeoutMs, parallel }) => {
    const my = ++runId;
    const rows: CheckRow[] = channels.flatMap(c => c.streams.map(s => ({ key: `${c.id}|${s.aceId}`, channelId: c.id, channelName: c.name, group: c.group, streamLabel: s.label, aceId: s.aceId, status: 'pending' as CheckStatus })));
    const byKey = new Map<string, Stream>(channels.flatMap(c => c.streams.map(s => [`${c.id}|${s.aceId}`, s] as [string, Stream])));
    set({ rows, running: true, paused: false, done: 0 });
    let next = 0;
    const update = (i: number, patch: Partial<CheckRow>) => set(st => (my === runId ? { rows: st.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : {}));
    const worker = async () => {
      while (my === runId) {
        // mientras ves un canal se espera (el comprobador no le quita motor ni red)
        while (my === runId && usePlayerStore.getState().status !== 'idle') { if (!get().paused) set({ paused: true }); await new Promise(r => setTimeout(r, 2000)); }
        if (get().paused) set({ paused: false });
        const i = next++;
        if (i >= rows.length || my !== runId) return;
        const stream = byKey.get(rows[i].key)!;
        update(i, { status: 'checking' });
        const { backendConfig } = useSettingsStore.getState();
        const r = await probeStream(stream, backendConfig, timeoutMs);
        if (my !== runId) return;
        update(i, { status: r.ok ? 'online' : r.timeout ? 'timeout' : 'offline', ms: r.ms });
        if (!stream.direct) useHealthStore.getState().mark(stream.aceId, r.ok);
        set(st => ({ done: st.done + 1 }));
      }
    };
    void Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, 4)) }, worker)).then(() => { if (my === runId) set({ running: false, paused: false }); });
  },
  stop: () => { runId++; set(st => ({ running: false, paused: false, rows: st.rows.map(r => (r.status === 'checking' ? { ...r, status: 'pending' } : r)) })); },
  clear: () => { if (!get().running) set({ rows: [], done: 0 }); },

  checkStreams: async (streams, timeoutMs = 20000) => {
    const { backendConfig } = useSettingsStore.getState();
    set(st => ({ checking: { ...st.checking, ...Object.fromEntries(streams.map(s => [s.aceId, true])) } }));
    // de tres en tres, para no saturar el motor con un canal que tenga muchos enlaces
    const queue = [...streams];
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        const r = await probeStream(s, backendConfig, timeoutMs);
        if (!s.direct) useHealthStore.getState().mark(s.aceId, r.ok);
        const id = s.aceId;
        set(st => { const c = { ...st.checking }; delete c[id]; return { checking: c }; });
      }
    }));
  },
}));

import { create } from 'zustand';
import type { Channel } from '@/types';
import { canon } from '@/lib/ciriacoNative';
import { crossGuide, type ChannelGuide, type GuideCross } from '@/lib/epgEvents';
import { useCiriacoStore } from './useCiriacoStore';
import { useEPGStore } from './useEPGStore';
import { useM3UStore } from './useM3UStore';

/**
 * Cruza la guía de hoy de los canales de tus listas con la agenda (ver lib/epgEvents.ts).
 * Se recalcula al abrir Eventos, cuando cambian la agenda, las listas o la guía, y cada 10 minutos.
 */
interface GuideEventsState {
  cross: GuideCross;
  /** id de canal → canal (de tus listas) */
  channels: Map<string, Channel>;
  busy: boolean;
  computedAt: number;
  compute: (force?: boolean) => Promise<void>;
}

let lastKey = '';
const EMPTY: GuideCross = { related: {}, extra: {} };

export const useGuideEventsStore = create<GuideEventsState>((set, get) => ({
  cross: EMPTY, channels: new Map(), busy: false, computedAt: 0,
  compute: async (force = false) => {
    if (get().busy) return;
    const epg = useEPGStore.getState();
    const data = useCiriacoStore.getState().data;
    const all = useM3UStore.getState().allChannels.filter(c => !c.vod && c.streams.length > 0);
    if (!all.length) return;
    const key = `${epg.status}|${data?.fetchedAt ?? ''}|${all.length}`;
    if (!force && key === lastKey && Date.now() - get().computedAt < 10 * 60000) return;
    lastKey = key;
    set({ busy: true });
    try {
      const channels = new Map(all.map(c => [c.id, c]));
      // la guía de hoy de cada canal (si no hay guía, solo se relaciona por el nombre del canal)
      const guides: ChannelGuide[] = [];
      if (epg.status === 'ready') {
        let i = 0;
        const worker = async () => {
          while (i < all.length) {
            const ch = all[i++];
            const s = await useEPGStore.getState().getScheduleForChannel(ch).catch(() => null);
            guides.push({ channel: ch, events: s?.events ?? [] });
          }
        };
        await Promise.all(Array.from({ length: 6 }, worker));
      } else {
        for (const ch of all) guides.push({ channel: ch, events: [] });
      }
      set({ cross: crossGuide(data, guides, canon), channels, computedAt: Date.now() });
    } finally { set({ busy: false }); }
  },
}));

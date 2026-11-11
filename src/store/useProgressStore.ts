import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Por dónde vas en cada película o episodio (de los addons), para «Seguir viendo». */
export interface Progress {
  key: string; type: string; id: string; videoId: string; addon: string;
  title: string; poster?: string; pos: number; dur: number; at: number;
}
interface ProgressState {
  items: Record<string, Progress>;
  save: (p: Omit<Progress, 'at' | 'key'>) => void;
  get: (type: string, videoId: string) => Progress | undefined;
  remove: (key: string) => void;
}
const MAX = 60;
export const progressKey = (type: string, videoId: string) => `${type}:${videoId}`;

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      items: {},
      save: p => {
        if (!(p.dur > 0)) return;
        const key = progressKey(p.type, p.videoId);
        const items = { ...get().items, [key]: { ...p, key, at: Date.now() } };
        const keys = Object.keys(items);
        if (keys.length > MAX) for (const k of keys.sort((a, b) => items[a].at - items[b].at).slice(0, keys.length - MAX)) delete items[k];
        set({ items });
      },
      get: (type, videoId) => get().items[progressKey(type, videoId)],
      remove: key => { const items = { ...get().items }; delete items[key]; set({ items }); },
    }),
    { name: 'topotv-progress' },
  ),
);

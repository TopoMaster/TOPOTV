import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Channel, Group, M3UMeta, ParsedM3U } from '@/types';
import { loadM3UFromFile, loadM3UFromUrl } from '@/lib/m3uParser';

interface M3UState {
  meta: M3UMeta | null; groups: Group[]; allChannels: Channel[];
  isLoading: boolean; error: string | null; lastSource: string | null;
  loadFromFile: (file: File) => Promise<void>;
  loadFromUrl: (url: string) => Promise<void>;
  setData: (parsed: ParsedM3U) => void;
  reset: () => void;
  getGroup: (slugOrTitle: string) => Group | undefined;
  getChannel: (id: string) => Channel | undefined;
  searchChannels: (query: string) => Channel[];
}

export const useM3UStore = create<M3UState>()(
  persist(
    (set, get) => ({
      meta: null, groups: [], allChannels: [], isLoading: false, error: null, lastSource: null,
      setData: (parsed) => set({ meta: parsed.meta, groups: parsed.groups, allChannels: parsed.allChannels, error: null, lastSource: parsed.meta.source }),
      loadFromFile: async (file) => {
        set({ isLoading: true, error: null });
        try { const p = await loadM3UFromFile(file); get().setData(p); }
        catch (err) { set({ error: err instanceof Error ? err.message : 'Error' }); }
        finally { set({ isLoading: false }); }
      },
      loadFromUrl: async (url) => {
        set({ isLoading: true, error: null });
        try { const p = await loadM3UFromUrl(url); get().setData(p); }
        catch (err) { set({ error: err instanceof Error ? err.message : 'Error' }); }
        finally { set({ isLoading: false }); }
      },
      reset: () => set({ meta: null, groups: [], allChannels: [], error: null, lastSource: null }),
      getGroup: (s) => get().groups.find(g => g.id === s || g.title === s),
      getChannel: (id) => get().allChannels.find(c => c.id === id),
      searchChannels: (query) => {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        return get().allChannels.filter(c => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
      },
    }),
    { name: 'acestream-tv-m3u', partialize: (s) => ({ lastSource: s.lastSource }) as any }
  )
);

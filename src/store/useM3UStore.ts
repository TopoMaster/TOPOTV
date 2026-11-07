import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Channel, Group, M3UMeta, ParsedM3U } from '@/types';
import { withDefaultSources } from '@/lib/ciriaco';
import { useSettingsStore } from './useSettingsStore';
import { loadM3UFromFile, loadM3UFromUrl, mergeM3ULists } from '@/lib/m3uParser';

interface M3UState {
  meta: M3UMeta | null; groups: Group[]; allChannels: Channel[];
  isLoading: boolean; error: string | null; lastSource: string | null;
  loadFromFile: (file: File) => Promise<void>;
  loadFromUrl: (url: string) => Promise<void>;
  loadFromUrls: (urls: string[]) => Promise<void>;
  reloadSources: () => Promise<void>;
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
        await get().loadFromUrls([url]);
      },
      reloadSources: async () => { await get().loadFromUrls(withDefaultSources(useSettingsStore.getState().m3uSourceUrls)); },
      loadFromUrls: async (urls) => {
        const uniqueUrls = [...new Set(urls.map(url => url.trim()).filter(Boolean))];
        if (!uniqueUrls.length) { set({ error: 'Añade al menos una URL M3U.' }); return; }
        set({ isLoading: true, error: null });
        try {
          const results = await Promise.all(uniqueUrls.map(async url => {
            try { return { url, parsed: await loadM3UFromUrl(url), error: null }; }
            catch (err) { return { url, parsed: null, error: err instanceof Error ? err.message : 'Error' }; }
          }));
          const parsed = results.flatMap(result => result.parsed ? [result.parsed] : []);
          if (!parsed.length) throw new Error(results.map(result => `${result.url}: ${result.error}`).join('\n'));
          get().setData(mergeM3ULists(parsed));
          const failedCount = results.length - parsed.length;
          if (failedCount) set({ error: `${failedCount} de ${results.length} fuentes no se pudieron cargar.` });
        }
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

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Channel } from '@/types';
const MAX = 20;
interface HistoryEntry { channel: Channel; watchedAt: string; }
interface HistoryState {
  entries: HistoryEntry[];
  push: (channel: Channel) => void; remove: (channelId: string) => void; clear: () => void;
}
export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      push: (channel) => { const filtered = get().entries.filter(e => e.channel.id !== channel.id); set({ entries: [{ channel, watchedAt: new Date().toISOString() }, ...filtered].slice(0, MAX) }); },
      remove: (channelId) => set({ entries: get().entries.filter(e => e.channel.id !== channelId) }),
      clear: () => set({ entries: [] }),
    }),
    { name: 'acestream-tv-history' }
  )
);

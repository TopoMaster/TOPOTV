import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Avisos de eventos: «avísame antes de que empiece». La clave es la misma que usa el grabador (fecha hora título). */
export interface Reminder { key: string; title: string; at: number; sport: string; notified: boolean; }

interface ReminderState {
  items: Reminder[];
  add: (r: Omit<Reminder, 'notified'>) => void;
  remove: (key: string) => void;
  markNotified: (key: string) => void;
  prune: () => void;
}

export const useReminderStore = create<ReminderState>()(
  persist(
    (set, get) => ({
      items: [],
      add: r => { if (!get().items.some(i => i.key === r.key)) set({ items: [...get().items, { ...r, notified: false }] }); },
      remove: key => set({ items: get().items.filter(i => i.key !== key) }),
      markNotified: key => set({ items: get().items.map(i => i.key === key ? { ...i, notified: true } : i) }),
      prune: () => set({ items: get().items.filter(i => i.at > Date.now() - 6 * 3600e3) }),
    }),
    { name: 'topotv-reminders' },
  ),
);

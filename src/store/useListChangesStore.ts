import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ListChange { label: string; added: number; removed: number; names: string[]; at: number }
interface ListChangesState {
  items: ListChange[];
  /** Una lista solo tiene un aviso: el último sustituye al anterior. */
  push: (c: Omit<ListChange, 'at'>) => void;
  dismiss: (label: string) => void;
  clear: () => void;
}

export const useListChangesStore = create<ListChangesState>()(
  persist(
    (set, get) => ({
      items: [],
      push: c => set({ items: [...get().items.filter(i => i.label !== c.label), { ...c, at: Date.now() }].slice(-4) }),
      dismiss: label => set({ items: get().items.filter(i => i.label !== label) }),
      clear: () => set({ items: [] }),
    }),
    { name: 'topotv-list-changes' },
  ),
);

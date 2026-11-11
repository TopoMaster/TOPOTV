import { create } from 'zustand';
import type { Channel } from '@/types';

/** Multivista: hasta cuatro canales a la vez (para seguir varios partidos). No se guarda al cerrar. */
export const MAX_MULTI = 4;
interface MultiState {
  items: Channel[];
  add: (c: Channel) => boolean;
  remove: (id: string) => void;
  clear: () => void;
}
export const useMultiStore = create<MultiState>((set, get) => ({
  items: [],
  add: c => {
    const { items } = get();
    if (items.some(i => i.id === c.id)) return true;
    if (items.length >= MAX_MULTI) return false;
    set({ items: [...items, c] });
    return true;
  },
  remove: id => set({ items: get().items.filter(i => i.id !== id) }),
  clear: () => set({ items: [] }),
}));

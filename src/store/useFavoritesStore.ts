import { create } from 'zustand';
import { persist } from 'zustand/middleware';
interface FavoritesState {
  ids: Set<string>; toggle: (id: string) => void; isFavorite: (id: string) => boolean; clear: () => void;
}
export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: new Set(),
      toggle: (id) => { const ids = new Set(get().ids); if (ids.has(id)) ids.delete(id); else ids.add(id); set({ ids }); },
      isFavorite: (id) => get().ids.has(id),
      clear: () => set({ ids: new Set() }),
    }),
    {
      name: 'acestream-tv-favorites',
      storage: {
        getItem: (name) => { const s = localStorage.getItem(name); if (!s) return null; const p = JSON.parse(s); return { ...p, state: { ...p.state, ids: new Set(p.state.ids ?? []) } }; },
        setItem: (name, value) => { localStorage.setItem(name, JSON.stringify({ ...value, state: { ...value.state, ids: [...value.state.ids] } })); },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

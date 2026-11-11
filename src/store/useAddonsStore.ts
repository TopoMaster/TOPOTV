import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { installAddon, type Addon } from '@/lib/stremio';

interface AddonsState {
  addons: Addon[];
  /** Instala (o actualiza) un addon a partir de su dirección. Lanza si no es válido. */
  install: (input: string) => Promise<Addon>;
  remove: (base: string) => void;
  toggle: (base: string) => void;
}

export const useAddonsStore = create<AddonsState>()(
  persist(
    (set, get) => ({
      addons: [],
      install: async input => {
        const addon = await installAddon(input);
        const rest = get().addons.filter(a => a.base !== addon.base);
        set({ addons: [...rest, addon] });
        return addon;
      },
      remove: base => set({ addons: get().addons.filter(a => a.base !== base) }),
      toggle: base => set({ addons: get().addons.map(a => a.base === base ? { ...a, enabled: !a.enabled } : a) }),
    }),
    { name: 'topotv-addons' },
  ),
);

/** ¿Hay algún addon activo con catálogos o enlaces que mostrar en «Cine y series»? */
export const hasLibrary = (addons: Addon[]) => addons.some(a => a.enabled && (a.manifest.catalogs ?? []).length > 0);

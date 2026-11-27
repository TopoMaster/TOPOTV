import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_ADDON_URLS, installAddon, normalizeAddonUrl, type Addon } from '@/lib/stremio';

interface AddonsState {
  addons: Addon[];
  /** Instala (o actualiza) un addon a partir de su dirección. Lanza si no es válido. */
  install: (input: string) => Promise<Addon>;
  remove: (base: string) => void;
  toggle: (base: string) => void;
  /** Deja instalados los catálogos que vienen de serie (Cinemeta y Streaming Catalogs). Si no hay red, se reintenta en el siguiente arranque. */
  ensureDefaults: () => Promise<void>;
}

export const useAddonsStore = create<AddonsState>()(
  persist(
    (set, get) => ({
      addons: [],
      install: async input => {
        const addon = await installAddon(input);
        const previous = get().addons.find(a => a.base === addon.base);
        const merged = previous?.builtin ? { ...addon, builtin: true } : addon;
        set({ addons: [...get().addons.filter(a => a.base !== addon.base), merged] });
        return merged;
      },
      remove: base => set({ addons: get().addons.filter(a => a.base !== base || a.builtin) }),   // el incluido de serie no se borra
      toggle: base => set({ addons: get().addons.map(a => a.base === base ? { ...a, enabled: !a.enabled } : a) }),
      ensureDefaults: async () => {
        for (const { url, id } of DEFAULT_ADDON_URLS) {
          const base = normalizeAddonUrl(url).base;
          // si ya lo tienes (aunque con otra configuración: p. ej. tu Streaming Catalogs), se usa el tuyo y no se duplica
          const same = get().addons.filter(a => a.base === base || a.manifest?.id === id);
          if (same.length) {
            const keep = same.find(a => a.base !== base) ?? same[0];
            set({ addons: get().addons.filter(a => !same.includes(a) || a === keep).map(a => a === keep ? { ...a, builtin: true } : a) });
            continue;
          }
          try { await get().install(url); set({ addons: get().addons.map(a => a.base === base ? { ...a, builtin: true } : a) }); }
          catch { /* sin red: se reintenta en el siguiente arranque */ }
        }
      },
    }),
    { name: 'topotv-addons' },
  ),
);


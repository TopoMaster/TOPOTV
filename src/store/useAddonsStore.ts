import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_ADDON_URL, installAddon, normalizeAddonUrl, type Addon } from '@/lib/stremio';

interface AddonsState {
  addons: Addon[];
  /** Instala (o actualiza) un addon a partir de su dirección. Lanza si no es válido. */
  install: (input: string) => Promise<Addon>;
  remove: (base: string) => void;
  toggle: (base: string) => void;
  /** Deja instalado el catálogo que viene de serie (Cinemeta). Si no hay red, se reintenta en el siguiente arranque. */
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
        const base = normalizeAddonUrl(DEFAULT_ADDON_URL).base;
        const existing = get().addons.find(a => a.base === base);
        if (existing) { if (!existing.builtin) set({ addons: get().addons.map(a => a.base === base ? { ...a, builtin: true } : a) }); return; }
        try { await get().install(DEFAULT_ADDON_URL).then(() => set({ addons: get().addons.map(a => a.base === base ? { ...a, builtin: true } : a) })); }
        catch { /* sin red: se reintenta en el siguiente arranque */ }
      },
    }),
    { name: 'topotv-addons' },
  ),
);


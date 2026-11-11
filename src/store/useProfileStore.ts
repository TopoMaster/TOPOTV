import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Perfiles: cada persona tiene sus favoritos, historial, avisos, progreso y addons. Los demás ajustes son comunes.
 * Al cambiar de perfil se guardan los datos del actual, se cargan los del elegido y se recarga la app.
 * El PIN (opcional) solo protege entrar en ese perfil; es un freno para los niños, no una caja fuerte.
 */
export interface Profile { id: string; name: string; color: string; pinHash?: string }
const DATA_KEYS = ['acestream-tv-favorites', 'acestream-tv-history', 'topotv-reminders', 'topotv-progress', 'topotv-addons'] as const;
const COLORS = ['#e2c97e', '#6ea8fe', '#7dd3a8', '#f08fa0', '#b794f4', '#f6ad55'];
const slot = (id: string) => `topotv-profile-data:${id}`;

async function sha(pin: string, id: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${id}:${pin}`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Guarda los datos de este perfil aparte y deja vacíos los de uso diario. */
function stash(id: string) {
  const map: Record<string, string> = {};
  for (const k of DATA_KEYS) { try { const v = localStorage.getItem(k); if (v !== null) map[k] = v; } catch { /* sin almacenamiento */ } }
  try { localStorage.setItem(slot(id), JSON.stringify(map)); } catch { /* sin espacio */ }
}
function restore(id: string) {
  let map: Record<string, string> = {};
  try { map = JSON.parse(localStorage.getItem(slot(id)) ?? '{}'); } catch { /* perfil nuevo */ }
  for (const k of DATA_KEYS) { try { if (map[k] !== undefined) localStorage.setItem(k, map[k]); else localStorage.removeItem(k); } catch { /* sin almacenamiento */ } }
}

interface ProfileState {
  profiles: Profile[];
  activeId: string;
  add: (name: string) => void;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  setPin: (id: string, pin: string | null) => Promise<void>;
  /** Cambia de perfil (pide el PIN si lo tiene) y recarga la app. Devuelve false si el PIN no coincide. */
  switchTo: (id: string, pin?: string) => Promise<boolean>;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: [{ id: 'main', name: 'Principal', color: COLORS[0] }],
      activeId: 'main',
      add: name => {
        const n = name.trim().slice(0, 24);
        if (!n) return;
        const id = Date.now().toString(36);
        set({ profiles: [...get().profiles, { id, name: n, color: COLORS[get().profiles.length % COLORS.length] }] });
      },
      remove: id => {
        if (id === get().activeId || get().profiles.length <= 1) return;   // no se borra el perfil en uso
        try { localStorage.removeItem(slot(id)); } catch { /* ya no existe */ }
        set({ profiles: get().profiles.filter(p => p.id !== id) });
      },
      rename: (id, name) => set({ profiles: get().profiles.map(p => p.id === id ? { ...p, name: name.trim().slice(0, 24) || p.name } : p) }),
      setPin: async (id, pin) => {
        const pinHash = pin ? await sha(pin, id) : undefined;
        set({ profiles: get().profiles.map(p => p.id === id ? { ...p, pinHash } : p) });
      },
      switchTo: async (id, pin) => {
        const target = get().profiles.find(p => p.id === id);
        if (!target || id === get().activeId) return true;
        if (target.pinHash && (!pin || (await sha(pin, id)) !== target.pinHash)) return false;
        stash(get().activeId);
        restore(id);
        set({ activeId: id });
        setTimeout(() => location.reload(), 150);
        return true;
      },
    }),
    { name: 'topotv-profiles' },
  ),
);

import type { Channel } from '@/types';

/**
 * Novedades de una lista de canales: compara los enlaces de la lista con los de la última vez que se cargó
 * (se guarda solo una huella en este dispositivo) y dice cuántos canales hay nuevos o quitados.
 * La primera vez que se ve una lista no avisa: solo la memoriza.
 */
export interface ListDiff { added: number; removed: number; names: string[] }
const MAX_IDS = 6000;

/** Huella corta de la dirección: así no se guarda la dirección (que puede llevar claves) como nombre de clave. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export function compareWithSnapshot(url: string, channels: Channel[]): ListDiff | null {
  const key = `topotv-list-snap:${hash(url)}`;
  const names = new Map<string, string>();   // enlace → nombre del canal
  for (const c of channels) for (const s of c.streams) if (names.size < MAX_IDS) names.set(s.aceId, c.name);
  let previous: Set<string> | null = null;
  try { const raw = localStorage.getItem(key); if (raw) previous = new Set(JSON.parse(raw) as string[]); } catch { /* huella ilegible: se trata como primera vez */ }
  try { localStorage.setItem(key, JSON.stringify([...names.keys()])); } catch { /* sin espacio */ }
  if (!previous || names.size === 0) return null;
  const added = [...names.keys()].filter(id => !previous!.has(id));
  const removed = [...previous].filter(id => !names.has(id));
  if (!added.length && !removed.length) return null;
  const newNames = [...new Set(added.map(id => names.get(id)!))];
  return { added: newNames.length, removed: removed.length, names: newNames.slice(0, 3) };
}

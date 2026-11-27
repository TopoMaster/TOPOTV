/** Copia de seguridad de tus datos de TOPOTV: favoritos, historial, ajustes, equipos, avisos, addons y listas.
 *  En Windows incluye también las listas de la carpeta de listas, para pasarlas al móvil con un solo archivo. */
import { FOLDER_PREFIX, folderInfo } from '@/lib/folderLists';
import type { LocalList } from '@/lib/localLists';
const KEYS = ['acestream-tv-settings', 'acestream-tv-favorites', 'acestream-tv-history', 'topotv-reminders', 'topotv-progress', 'topotv-addons', 'topotv-profiles', 'topotv-local-lists'] as const;
const FORMAT = 'topotv-backup';

export async function buildBackup(): Promise<string> {
  const data: Record<string, unknown> = {};
  for (const k of KEYS) {
    try { const v = localStorage.getItem(k); if (v) data[k] = JSON.parse(v); } catch { /* clave ilegible: se omite */ }
  }
  // Windows: las listas de la carpeta van como listas guardadas (en el móvil quedan en «Desde archivo»)
  const info = await folderInfo();
  if (info?.files.length) {
    const lists: LocalList[] = Array.isArray(data['topotv-local-lists']) ? [...data['topotv-local-lists'] as LocalList[]] : [];
    for (const f of info.files) {
      try {
        const r = await fetch(FOLDER_PREFIX + encodeURIComponent(f.name), { signal: AbortSignal.timeout(10000) });
        if (!r.ok) continue;
        const text = await r.text();
        const item: LocalList = { id: `carpeta-${f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: f.name, text, addedAt: new Date().toISOString(), channels: (text.match(/^#EXTINF/gm) ?? []).length };
        const i = lists.findIndex(l => l.name === f.name);
        if (i >= 0) lists[i] = item; else lists.push(item);
      } catch { /* esa lista no se pudo leer */ }
    }
    data['topotv-local-lists'] = lists;
  }
  return JSON.stringify({ format: FORMAT, version: 1, savedAt: new Date().toISOString(), data }, null, 1);
}

export async function downloadBackup() {
  const blob = new Blob([await buildBackup()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `topotv-copia-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Restaura una copia. Solo se aceptan las claves de TOPOTV conocidas; devuelve cuántos apartados se restauraron. */
export function restoreBackup(text: string): number {
  let parsed: { format?: string; data?: Record<string, unknown> };
  try { parsed = JSON.parse(text); } catch { throw new Error('El archivo no es una copia de TOPOTV (no se puede leer).'); }
  if (parsed.format !== FORMAT || !parsed.data || typeof parsed.data !== 'object') throw new Error('El archivo no es una copia de TOPOTV.');
  let n = 0;
  for (const k of KEYS) {
    const v = parsed.data[k];
    if (v && typeof v === 'object') { localStorage.setItem(k, JSON.stringify(v)); n++; }
  }
  if (!n) throw new Error('La copia está vacía.');
  return n;
}

/** Copia de seguridad de tus datos de TOPOTV: favoritos, historial, ajustes, equipos y avisos. */
const KEYS = ['acestream-tv-settings', 'acestream-tv-favorites', 'acestream-tv-history', 'topotv-reminders'] as const;
const FORMAT = 'topotv-backup';

export function buildBackup(): string {
  const data: Record<string, unknown> = {};
  for (const k of KEYS) {
    try { const v = localStorage.getItem(k); if (v) data[k] = JSON.parse(v); } catch { /* clave ilegible: se omite */ }
  }
  return JSON.stringify({ format: FORMAT, version: 1, savedAt: new Date().toISOString(), data }, null, 1);
}

export function downloadBackup() {
  const blob = new Blob([buildBackup()], { type: 'application/json' });
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

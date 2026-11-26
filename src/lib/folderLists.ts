/**
 * Carpeta de listas (solo Windows): las .m3u que dejes en Documentos\TOPOTV\Listas se cargan solas con las demás
 * fuentes cada vez que TOPOTV actualiza. Así, si vas renovando tu lista, basta con sustituir el archivo.
 * Las sirve el servicio local del sistema (puerto 3008), que solo atiende a la propia app.
 */
import { Capacitor } from '@capacitor/core';

const SYS = 'http://localhost:3008';
export const FOLDER_PREFIX = `${SYS}/lists/file?name=`;
export interface FolderInfo { dir: string; files: { name: string; size: number; mtime: string }[] }

export async function folderInfo(): Promise<FolderInfo | null> {
  if (Capacitor.isNativePlatform()) return null;
  try {
    const r = await fetch(`${SYS}/lists`, { signal: AbortSignal.timeout(2500) });
    return r.ok ? await r.json() as FolderInfo : null;
  } catch { return null; }
}
export async function folderListUrls(): Promise<string[]> {
  const info = await folderInfo();
  return (info?.files ?? []).map(f => FOLDER_PREFIX + encodeURIComponent(f.name));
}
export function folderListName(url: string): string | null {
  return url.startsWith(FOLDER_PREFIX) ? decodeURIComponent(url.slice(FOLDER_PREFIX.length)) : null;
}
export async function openListsFolder() {
  try { await fetch(`${SYS}/lists/open`, { method: 'POST', signal: AbortSignal.timeout(3000) }); } catch { /* sin servicio */ }
}

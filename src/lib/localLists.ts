/**
 * Listas M3U cargadas desde un archivo: se guardan en este dispositivo y se recargan con las demás
 * fuentes (antes se perdían al pulsar «Actualizar» o en la recarga automática de cada hora).
 * Cargar otra vez un archivo con el mismo nombre sustituye al anterior.
 */
const KEY = 'topotv-local-lists';
export const LOCAL_PREFIX = 'topotv://archivo/';

export interface LocalList { id: string; name: string; text: string; addedAt: string; channels: number }

export function getLocalLists(): LocalList[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function write(lists: LocalList[]) {
  try { localStorage.setItem(KEY, JSON.stringify(lists)); }
  catch { throw new Error('No hay espacio en este dispositivo para guardar la lista. Quita alguna lista guardada y vuelve a probar.'); }
}
export function saveLocalList(name: string, text: string, channels: number): LocalList {
  const lists = getLocalLists();
  const old = lists.find(l => l.name === name);
  const item: LocalList = { id: old?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, text, addedAt: new Date().toISOString(), channels };
  write([...lists.filter(l => l.id !== item.id), item]);
  return item;
}
export function removeLocalList(id: string) { write(getLocalLists().filter(l => l.id !== id)); }
export const localListUrls = () => getLocalLists().map(l => LOCAL_PREFIX + l.id);
export function localListFor(url: string): LocalList | null {
  if (!url.startsWith(LOCAL_PREFIX)) return null;
  return getLocalLists().find(l => l.id === url.slice(LOCAL_PREFIX.length)) ?? null;
}

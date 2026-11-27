import { Capacitor } from '@capacitor/core';

/** Cliente del motor de torrents de la app de Windows (tools/torrent-server.cjs, puerto 3009; usa peerflix). */
const T = 'http://localhost:3009';
export interface TorrentSpec { infoHash: string; fileIdx?: number; trackers?: string[] }
export interface TorrentStatus { id: string; state: 'starting' | 'ready' | 'error'; url?: string; name?: string; size?: number; peers: number; downloaded: number; speed: number; error?: string }

export async function torrentAvailable(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return true;   // en Android los reproduce el motor AceStream (Ace Serve)
  try { return (await fetch(`${T}/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

async function call<T2>(path: string, init?: RequestInit, ms = 8000): Promise<T2> {
  const r = await fetch(T + path, { ...init, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(ms) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Motor de torrents HTTP ${r.status}`);
  return j as T2;
}

/** Arranca el torrent y espera a tener el archivo de vídeo listo para ver. Devuelve la dirección local que se reproduce. */
export async function startTorrent(spec: TorrentSpec, onStatus?: (s: TorrentStatus) => void): Promise<string> {
  const first = await call<TorrentStatus>('/start', { method: 'POST', body: JSON.stringify(spec) }, 20000);
  for (let i = 0; i < 150; i++) {
    let st: TorrentStatus;
    // una consulta que tarda (p. ej. justo al arrancar, mientras se procesan las guías) no es un fallo: se vuelve a preguntar
    try { st = i === 0 ? first : await call<TorrentStatus>(`/status/${first.id}`); }
    catch (e) { if (/timed? ?out|abort/i.test(String((e as Error)?.message ?? e))) { await new Promise(r => setTimeout(r, 1000)); continue; } throw e; }
    onStatus?.(st);
    if (st.state === 'ready' && st.url) return st.url;
    if (st.state === 'error') throw new Error(st.error || 'No se pudo abrir el torrent');
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('El torrent tarda demasiado en encontrar fuentes. Prueba otro enlace.');
}
/** Identificador que usa el motor para un torrent (el mismo que calcula tools/torrent-server.cjs). */
export const torrentId = (t: TorrentSpec) => `${t.infoHash.toLowerCase()}${Number.isInteger(t.fileIdx) ? '-' + t.fileIdx : ''}`;
export const torrentStatus = (id: string) => call<TorrentStatus>(`/status/${id}`);
export const stopTorrents = () => call<{ ok: boolean }>('/stop-all', { method: 'POST' }).catch(() => undefined);

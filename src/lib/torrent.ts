import { Capacitor } from '@capacitor/core';

/** Cliente del motor de torrents de la app de Windows (tools/torrent-server.cjs, puerto 3009; usa peerflix). */
const T = 'http://localhost:3009';
export interface TorrentSpec { infoHash: string; fileIdx?: number; trackers?: string[] }
export interface TorrentStatus { id: string; state: 'starting' | 'ready' | 'error'; url?: string; name?: string; size?: number; peers: number; downloaded: number; speed: number; error?: string }

export async function torrentAvailable(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return false;
  try { return (await fetch(`${T}/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

async function call<T2>(path: string, init?: RequestInit): Promise<T2> {
  const r = await fetch(T + path, { ...init, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Motor de torrents HTTP ${r.status}`);
  return j as T2;
}

/** Arranca el torrent y espera a tener el archivo de vídeo listo para ver. Devuelve la dirección local que se reproduce. */
export async function startTorrent(spec: TorrentSpec, onStatus?: (s: TorrentStatus) => void): Promise<string> {
  const first = await call<TorrentStatus>('/start', { method: 'POST', body: JSON.stringify(spec) });
  for (let i = 0; i < 150; i++) {
    const st = i === 0 ? first : await call<TorrentStatus>(`/status/${first.id}`);
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

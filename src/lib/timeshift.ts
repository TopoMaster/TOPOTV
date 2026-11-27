import { Capacitor } from '@capacitor/core';

/**
 * Pausar y rebobinar el directo (solo Windows): el servicio local tools/timeshift-server.cjs (puerto 3010) va guardando
 * el canal que ves en una carpeta caché y da al reproductor una lista con todo lo guardado. Se configura en Ajustes.
 */
const TS = 'http://127.0.0.1:3010';
export interface Timeshift { id: string; playlist: string; startedAt: number }
export interface TimeshiftOptions { channelId: string; name: string; minutes: number; gb: number; keep: boolean }
export interface CacheInfo { dir: string; bytes: number; channels: { channelId: string; name: string; seconds: number; bytes: number; recording: boolean }[] }

const post = (path: string, body?: unknown, ms = 8000) => fetch(TS + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(ms) });

/** Empieza a guardar el canal (src = HLS del motor). Devuelve null si no hay servicio o el canal no da vídeo. */
export async function startTimeshift(src: string, opts: TimeshiftOptions): Promise<Timeshift | null> {
  if (Capacitor.isNativePlatform()) return null;
  try { const r = await post('/start', { src, ...opts }, 95000); return r.ok ? await r.json() as Timeshift : null; } catch { return null; }
}
export function stopTimeshift(id: string) { void post('/stop', { id }).catch(() => {}); }
export async function timeshiftCache(): Promise<CacheInfo | null> {
  if (Capacitor.isNativePlatform()) return null;
  try { const r = await fetch(`${TS}/cache`, { signal: AbortSignal.timeout(3000) }); return r.ok ? await r.json() as CacheInfo : null; } catch { return null; }
}
export async function clearTimeshiftCache() { try { await post('/cache/clear'); } catch { /* sin servicio */ } }
export async function openTimeshiftCache() { try { await post('/cache/open'); } catch { /* sin servicio */ } }

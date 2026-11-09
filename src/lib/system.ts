import { Capacitor } from '@capacitor/core';

/** Servicio del sistema de la app de Windows (tools/system-server.cjs): actualizaciones, registro y diagnóstico. */
const SYS = 'http://localhost:3008';

export interface UpdateInfo { current: string; latest: string; newer: boolean; asset: { name: string; size: number } | null; page: string; notes: string; }
export interface UpdateProgress { phase: 'idle' | 'downloading' | 'ready' | 'error'; percent: number; error: string; }

export async function systemAvailable(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return false;
  try { return (await fetch(`${SYS}/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
export async function checkUpdate(): Promise<UpdateInfo> {
  const r = await fetch(`${SYS}/update/check`, { signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as UpdateInfo;
}
export async function startUpdate(): Promise<UpdateProgress> {
  const r = await fetch(`${SYS}/update/install`, { method: 'POST', signal: AbortSignal.timeout(5000) });
  return r.json();
}
export async function updateProgress(): Promise<UpdateProgress> {
  const r = await fetch(`${SYS}/update/status`, { signal: AbortSignal.timeout(3000) });
  return r.json();
}
export async function diagnostic(): Promise<string> {
  const r = await fetch(`${SYS}/diagnostic`, { signal: AbortSignal.timeout(15000) });
  return r.text();
}
export async function openLog(): Promise<void> {
  await fetch(`${SYS}/log/open`, { method: 'POST', signal: AbortSignal.timeout(4000) });
}

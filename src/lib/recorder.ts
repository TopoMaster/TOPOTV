import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Grabador de eventos. En Windows habla con tools/recorder.cjs (puerto 3007); en Android con el plugin
 * nativo RecorderPlugin (servicio en segundo plano + alarma). El contrato de las funciones es el mismo.
 */
const REC = 'http://localhost:3007';
const isNative = () => Capacitor.isNativePlatform();
interface RecorderNative {
  list(): Promise<{ dir: string; recordings: Recording[] }>;
  schedule(input: ScheduleInput): Promise<Recording>;
  cancel(o: { id: string }): Promise<Recording>;
  remove(o: { id: string }): Promise<void>;
  open(o: { id: string }): Promise<void>;
}
const Native = registerPlugin<RecorderNative>('Recorder');
const nativeError = (e: unknown): never => { throw new Error(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)); };

export type RecStatus = 'scheduled' | 'recording' | 'done' | 'failed' | 'cancelled' | 'missed';
export interface Recording {
  id: string; key: string; title: string; sport: string; start: number; end: number;
  status: RecStatus; file: string; bytes: number; error: string; linkCount: number;
}
export interface ScheduleInput { title: string; sport: string; key: string; start: number; end: number; hashes: string[]; host: string; port: number; }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(REC + path, { ...init, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(6000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Grabador HTTP ${r.status}`);
  return data as T;
}

export async function recorderAvailable(): Promise<boolean> {
  if (isNative()) return true;
  try { return (await fetch(`${REC}/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
export const listRecordings = () => isNative() ? Native.list().catch(nativeError) : call<{ dir: string; recordings: Recording[] }>('/recordings');
export const scheduleRecording = (input: ScheduleInput) => isNative() ? Native.schedule(input).catch(nativeError) : call<Recording>('/recordings', { method: 'POST', body: JSON.stringify(input) });
export const cancelRecording = (id: string) => isNative() ? Native.cancel({ id }).catch(nativeError) : call<Recording>(`/recordings/${id}/cancel`, { method: 'POST' });
export const openRecording = (id: string) => isNative() ? Native.open({ id }).then(() => ({ ok: true })).catch(nativeError) : call<{ ok: boolean }>(`/recordings/${id}/open`, { method: 'POST' });
export const deleteRecording = (id: string) => isNative() ? Native.remove({ id }).then(() => ({ ok: true })).catch(nativeError) : call<{ ok: boolean }>(`/recordings/${id}`, { method: 'DELETE' });
export const openRecordingsFolder = () => call<{ ok: boolean }>('/recordings/open-folder', { method: 'POST' });

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

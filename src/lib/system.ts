import { Capacitor } from '@capacitor/core';
import { checkBackendStatus } from '@/lib/aceApi';
import { installApkFromUrl } from '@/lib/engineAndroid';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useHealthStore } from '@/store/useHealthStore';

/**
 * Sistema: actualizaciones, diagnóstico y registro.
 * En Windows lo da el servicio local tools/system-server.cjs (puerto 3008); en Android se hace dentro de la app
 * (mira GitHub y, si hay versión nueva, descarga el APK y abre el instalador de Android).
 */
declare const __APP_VERSION__: string;
const SYS = 'http://localhost:3008';
const REPO = 'TopoMaster/TOPOTV';
const APK_RE = /^TOPOTV-v\d+\.\d+\.\d+\.apk$/;
const isNative = () => Capacitor.isNativePlatform();
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

export interface UpdateInfo { current: string; latest: string; newer: boolean; asset: { name: string; size: number } | null; page: string; notes: string; }
export interface UpdateProgress { phase: 'idle' | 'downloading' | 'ready' | 'error'; percent: number; error: string; }

const semver = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
export function isNewer(a: string, b: string): boolean {
  const x = semver(a), y = semver(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

/* ── Android: todo dentro de la app ── */
let nativeUrl = '';
const nativeUp: UpdateProgress = { phase: 'idle', percent: 0, error: '' };

async function nativeCheck(): Promise<UpdateInfo> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
  const rel = await r.json() as { tag_name?: string; html_url?: string; body?: string; assets?: { name: string; size: number; browser_download_url: string }[] };
  const latest = String(rel.tag_name ?? '').replace(/^v/, '');
  const asset = (rel.assets ?? []).find(a => APK_RE.test(a.name));
  nativeUrl = asset?.browser_download_url ?? '';
  return { current: APP_VERSION, latest, newer: !!latest && !!asset && isNewer(latest, APP_VERSION), asset: asset ? { name: asset.name, size: asset.size } : null, page: rel.html_url ?? '', notes: String(rel.body ?? '').slice(0, 1500) };
}

function nativeStart(): UpdateProgress {
  if (nativeUp.phase === 'downloading') return nativeUp;
  Object.assign(nativeUp, { phase: 'downloading', percent: 0, error: '' });
  void (async () => {
    if (!nativeUrl) { try { await nativeCheck(); } catch (e) { Object.assign(nativeUp, { phase: 'error', error: e instanceof Error ? e.message : String(e) }); return; } }
    const r = await installApkFromUrl(nativeUrl, pct => { if (pct !== null) nativeUp.percent = pct; });
    if (r.ok) Object.assign(nativeUp, { phase: 'ready', percent: 100 });
    else Object.assign(nativeUp, { phase: 'error', error: r.needsPermission ? 'Activa «Permitir desde esta fuente» para TOPOTV en la pantalla que se ha abierto, vuelve y pulsa de nuevo.' : (r.error ?? 'No se pudo descargar la actualización') });
  })();
  return nativeUp;
}

async function nativeDiagnostic(): Promise<string> {
  const { backendConfig, autoCheck, preferredPlayer } = useSettingsStore.getState();
  const engine = await checkBackendStatus(backendConfig);
  const health = Object.values(useHealthStore.getState().streams);
  return [
    `TOPOTV ${APP_VERSION} (Android)`,
    navigator.userAgent,
    `Motor AceStream (${backendConfig.host}:${backendConfig.port}): ${engine === 'online' ? 'responde' : 'NO responde'}`,
    `Reproductor: ${preferredPlayer} · comprobación de enlaces: ${autoCheck ? 'activada' : 'desactivada'}`,
    `Enlaces comprobados: ${health.length} (${health.filter(e => e.ok).length} funcionan)`,
    `Hora del dispositivo: ${new Date().toLocaleString('es-ES')}`,
  ].join('\n');
}

/* ── API común ── */
export async function systemAvailable(): Promise<boolean> {
  if (isNative()) return true;
  try { return (await fetch(`${SYS}/health`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
export async function checkUpdate(): Promise<UpdateInfo> {
  if (isNative()) return nativeCheck();
  const r = await fetch(`${SYS}/update/check`, { signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as UpdateInfo;
}
export async function startUpdate(): Promise<UpdateProgress> {
  if (isNative()) return nativeStart();
  const r = await fetch(`${SYS}/update/install`, { method: 'POST', signal: AbortSignal.timeout(5000) });
  return r.json();
}
export async function updateProgress(): Promise<UpdateProgress> {
  if (isNative()) return { ...nativeUp };
  const r = await fetch(`${SYS}/update/status`, { signal: AbortSignal.timeout(3000) });
  return r.json();
}
export async function diagnostic(): Promise<string> {
  if (isNative()) return nativeDiagnostic();
  const r = await fetch(`${SYS}/diagnostic`, { signal: AbortSignal.timeout(15000) });
  return r.text();
}
export async function openLog(): Promise<void> {
  if (isNative()) return;
  await fetch(`${SYS}/log/open`, { method: 'POST', signal: AbortSignal.timeout(4000) });
}

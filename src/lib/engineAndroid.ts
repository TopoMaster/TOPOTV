import { checkBackendStatus } from '@/lib/aceApi';
import { registerPlugin } from '@capacitor/core';
import { ExternalPlayer, isAndroidTv } from '@/lib/externalPlayer';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { AceBackendConfig } from '@/types';

/**
 * Control del motor AceStream en Android. El motor es software propietario que vive en otra app
 * (TOPOTV no lo redistribuye dentro): aquí se detecta cuál hay instalada, se enciende y se espera
 * a que responda en el puerto del motor.
 *
 * Con Ace Serve no hace falta abrir su pantalla ni pulsar START: al recibir un enlace acestream://
 * enciende el motor en segundo plano y después «pasa» el vídeo a un reproductor. TOPOTV se ofrece
 * para recogerlo (EngineHandoffActivity) y vuelve al frente; la reproducción la sigue haciendo TOPOTV.
 */
export interface EngineApp { pkg: string; name: string }
const ENGINE_APPS: EngineApp[] = [
  { pkg: 'org.free.aceserve', name: 'Ace Serve' },
  { pkg: 'org.acestream.media', name: 'Ace Stream Media' },
  { pkg: 'org.acestream.media.atv', name: 'Ace Stream Media (TV)' },
  { pkg: 'org.acestream.core', name: 'Ace Stream Engine' },
  { pkg: 'org.acestream.core.atv', name: 'Ace Stream Engine (TV)' },
  { pkg: 'org.acestream.engine', name: 'Ace Stream Engine' },
];

export async function findEngineApp(): Promise<EngineApp | null> {
  for (const app of ENGINE_APPS) {
    try { if ((await ExternalPlayer.isInstalled({ package: app.pkg })).installed) return app; } catch { /* siguiente */ }
  }
  return null;
}

const WOKE_KEY = 'topotv-engine-woke';
/** ¿Ya se encendió alguna vez el motor desde TOPOTV? (entonces Android ya sabe que el vídeo vuelve a TOPOTV) */
export function engineWokeBefore(): boolean { try { return localStorage.getItem(WOKE_KEY) === '1'; } catch { return false; } }
export function engineWakeMessage(): string {
  return engineWokeBefore() ? 'Encendiendo el motor AceStream…' : 'Encendiendo el motor AceStream… Si Android pregunta con qué abrir, elige «TOPOTV» y «Siempre».';
}

/** Id de relleno para encender el motor cuando todavía no se va a ver nada (no corresponde a ningún contenido). */
const WAKE_ID = '0'.repeat(40);
let waking: Promise<{ ok: boolean; app: EngineApp | null; error?: string }> | null = null;

/**
 * Enciende el motor y espera (hasta ~90 s: en móviles lentos Ace Serve tarda en arrancar) a que responda. Con Ace Serve se usa el enlace acestream://
 * del canal que se va a ver (así el motor ya empieza a buscarlo); con las apps oficiales se abre la app.
 * Si ya se está encendiendo, se espera a ese mismo intento.
 */
export function startEngineApp(cfg: AceBackendConfig, aceId?: string): Promise<{ ok: boolean; app: EngineApp | null; error?: string }> {
  if (!waking) waking = doStart(cfg, aceId).finally(() => { waking = null; });
  return waking;
}
async function doStart(cfg: AceBackendConfig, aceId?: string): Promise<{ ok: boolean; app: EngineApp | null; error?: string }> {
  if ((await checkBackendStatus(cfg)) === 'online') return { ok: true, app: await findEngineApp() };
  const app = await findEngineApp();
  if (!app) return { ok: false, app: null, error: 'Falta el motor AceStream. Instálalo en Ajustes → Motor y reproducción.' };
  try {
    if (app.pkg === 'org.free.aceserve') await ExternalPlayer.openAceLink({ id: /^[0-9a-f]{40}$/i.test(aceId ?? '') ? aceId! : WAKE_ID, package: app.pkg });
    else await ExternalPlayer.launchApp({ package: app.pkg });
  } catch (e) { return { ok: false, app, error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }; }
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if ((await checkBackendStatus(cfg)) === 'online') {
      try { localStorage.setItem(WOKE_KEY, '1'); } catch { /* sin almacenamiento */ }
      return { ok: true, app };
    }
  }
  return { ok: false, app, error: `${app.name} no llegó a encender el motor. Ábrelo, pulsa START y vuelve a TOPOTV.` };
}

/** Android no deja cerrar apps ajenas: se abre su pantalla de información para «Forzar detención». */
export async function openEngineAppSettings(app: EngineApp) {
  try { await ExternalPlayer.openAppSettings({ package: app.pkg }); } catch { /* sin acción */ }
}

/* ── Instalación del motor oficial ────────────────────────────── */
interface ApkInstaller {
  hasBundled(): Promise<{ bundled: boolean; arm64: boolean }>;
  installBundled(): Promise<{ opened: boolean }>;
  pickAndInstall(): Promise<{ opened: boolean }>;
  abi(): Promise<{ abi: string }>;
  install(o: { url: string; token?: string }): Promise<{ opened: boolean }>;
  addListener(name: 'progress', cb: (p: { bytes: number; total: number }) => void): Promise<{ remove: () => void }>;
}
const Installer = registerPlugin<ApkInstaller>('ApkInstaller');
export const ENGINE_DOCS_URL = 'https://docs.acestream.net/products/';

/** Enlace oficial (docs.acestream.net/products) del motor «Ace Stream Engine» para esta arquitectura. */
async function engineDownloadUrl(): Promise<string> {
  const { abi } = await Installer.abi();
  const tv = await isAndroidTv();
  return `https://download.acestream.media/products/${tv ? 'android-tv' : 'android'}/acestream-core/${abi}/latest`;
}

/** Convierte enlaces de «compartir» de Google Drive y Dropbox en enlaces de descarga directa. */
function directDownloadUrl(raw: string): string {
  const url = raw.trim();
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
  if (drive) return `https://drive.usercontent.google.com/download?id=${drive[1]}&export=download&confirm=t`;
  if (/dropbox\.com\//.test(url)) return url.replace(/([?&])dl=0/, '$1dl=1').replace(/^(https:\/\/www\.dropbox\.com\/[^?]+)$/, '$1?dl=1');
  return url;
}

/** ¿Lleva esta versión de TOPOTV el motor dentro y es compatible con este móvil? */
async function bundledEngineAvailable(): Promise<boolean> {
  try { const r = await Installer.hasBundled(); return r.bundled && r.arm64; } catch { return false; }
}

/**
 * Instala el motor, por orden: el enlace privado configurado en Ajustes; el APK incluido en la app
 * (assets/engine/aceserve.apk, solo en compilaciones locales); o la descarga oficial de AceStream.
 * Android nunca instala en silencio: el usuario confirma en su diálogo.
 */
export async function installEngine(onProgress: (pct: number | null) => void): Promise<{ ok: boolean; needsPermission?: boolean; error?: string }> {
  const message = (e: unknown) => e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  const { engineApkUrl, engineApkToken } = useSettingsStore.getState();
  // 1) enlace privado del usuario (Ajustes → Motor AceStream)
  if (engineApkUrl) {
    const sub = await Installer.addListener('progress', p => onProgress(p.total > 0 ? Math.round(100 * p.bytes / p.total) : null));
    try { await Installer.install({ url: directDownloadUrl(engineApkUrl), token: engineApkToken || undefined }); return { ok: true }; }
    catch (e) { const msg = message(e); if (msg.includes('NEEDS_PERMISSION')) return { ok: false, needsPermission: true }; return { ok: false, error: msg }; }
    finally { sub.remove(); }
  }
  // 2) el APK incluido en la app, si lo hay
  if (await bundledEngineAvailable()) {
    try { await Installer.installBundled(); return { ok: true }; }
    catch (e) { if (message(e).includes('NEEDS_PERMISSION')) return { ok: false, needsPermission: true }; /* otro fallo: se prueba la descarga */ }
  }
  const sub = await Installer.addListener('progress', p => onProgress(p.total > 0 ? Math.round(100 * p.bytes / p.total) : null));
  try {
    await Installer.install({ url: await engineDownloadUrl() });
    return { ok: true };
  } catch (e) {
    const msg = message(e);
    return msg.includes('NEEDS_PERMISSION') ? { ok: false, needsPermission: true } : { ok: false, error: msg };
  } finally { sub.remove(); }
}

/** Elegir el APK del motor desde el almacenamiento del móvil (p. ej. descargado de tu repositorio privado) e instalarlo. */
export async function installEngineFromFile(): Promise<{ ok: boolean; needsPermission?: boolean; cancelled?: boolean; error?: string }> {
  try { await Installer.pickAndInstall(); return { ok: true }; }
  catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    if (msg.includes('NEEDS_PERMISSION')) return { ok: false, needsPermission: true };
    if (msg.includes('CANCELLED')) return { ok: false, cancelled: true };
    return { ok: false, error: msg };
  }
}

/** Descarga un APK desde un enlace https (p. ej. una release de GitHub) y abre el instalador de Android. */
export async function installApkFromUrl(url: string, onProgress: (pct: number | null) => void): Promise<{ ok: boolean; needsPermission?: boolean; error?: string }> {
  const sub = await Installer.addListener('progress', p => onProgress(p.total > 0 ? Math.round(100 * p.bytes / p.total) : null));
  try { await Installer.install({ url }); return { ok: true }; }
  catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    return msg.includes('NEEDS_PERMISSION') ? { ok: false, needsPermission: true } : { ok: false, error: msg };
  } finally { sub.remove(); }
}

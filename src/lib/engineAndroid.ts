import { checkBackendStatus } from '@/lib/aceApi';
import { registerPlugin } from '@capacitor/core';
import { ExternalPlayer, isAndroidTv } from '@/lib/externalPlayer';
import type { AceBackendConfig } from '@/types';

/**
 * Control del motor AceStream en Android. El motor es software propietario que vive en otra app
 * (TOPOTV no puede llevarlo dentro): aquí se detecta cuál hay instalada, se abre para encenderlo
 * y se espera a que responda en el puerto del motor.
 */
export interface EngineApp { pkg: string; name: string }
export const ENGINE_APPS: EngineApp[] = [
  { pkg: 'org.free.aceserve', name: 'Ace Serve' },
  { pkg: 'org.acestream.media', name: 'Ace Stream Media' },
  { pkg: 'org.acestream.media.atv', name: 'Ace Stream Media (TV)' },
  { pkg: 'org.acestream.core', name: 'Ace Stream Engine' },
  { pkg: 'org.acestream.core.atv', name: 'Ace Stream Engine (TV)' },
  { pkg: 'org.acestream.engine', name: 'Ace Stream Engine' },
];
export const ENGINE_STORE_URL = 'https://play.google.com/store/apps/details?id=org.acestream.media';

export async function findEngineApp(): Promise<EngineApp | null> {
  for (const app of ENGINE_APPS) {
    try { if ((await ExternalPlayer.isInstalled({ package: app.pkg })).installed) return app; } catch { /* siguiente */ }
  }
  return null;
}

/** Abre la app del motor y espera (hasta ~45 s) a que responda. */
export async function startEngineApp(cfg: AceBackendConfig): Promise<{ ok: boolean; app: EngineApp | null; error?: string }> {
  if ((await checkBackendStatus(cfg)) === 'online') return { ok: true, app: await findEngineApp() };
  const app = await findEngineApp();
  if (!app) return { ok: false, app: null, error: 'No hay ninguna app con el motor AceStream instalada.' };
  try { await ExternalPlayer.launchApp({ package: app.pkg }); }
  catch (e) { return { ok: false, app, error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }; }
  for (let i = 0; i < 45; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if ((await checkBackendStatus(cfg)) === 'online') return { ok: true, app };
  }
  return { ok: false, app, error: `${app.name} se abrió pero el motor no responde en ${cfg.host}:${cfg.port}. Ábrelo y comprueba que esté en marcha.` };
}

/** Android no deja cerrar apps ajenas: se abre su pantalla de información para «Forzar detención». */
export async function openEngineAppSettings(app: EngineApp) {
  try { await ExternalPlayer.openAppSettings({ package: app.pkg }); } catch { /* sin acción */ }
}

/* ── Instalación del motor oficial ────────────────────────────── */
interface ApkInstaller {
  hasBundled(): Promise<{ bundled: boolean; arm64: boolean }>;
  installBundled(): Promise<{ opened: boolean }>;
  abi(): Promise<{ abi: string }>;
  install(o: { url: string }): Promise<{ opened: boolean }>;
  addListener(name: 'progress', cb: (p: { bytes: number; total: number }) => void): Promise<{ remove: () => void }>;
}
const Installer = registerPlugin<ApkInstaller>('ApkInstaller');
export const ENGINE_DOCS_URL = 'https://docs.acestream.net/products/';

/** Enlace oficial (docs.acestream.net/products) del motor «Ace Stream Engine» para esta arquitectura. */
export async function engineDownloadUrl(): Promise<string> {
  const { abi } = await Installer.abi();
  const tv = await isAndroidTv();
  return `https://download.acestream.media/products/${tv ? 'android-tv' : 'android'}/acestream-core/${abi}/latest`;
}

/** ¿Lleva esta versión de TOPOTV el motor dentro y es compatible con este móvil? */
export async function bundledEngineAvailable(): Promise<boolean> {
  try { const r = await Installer.hasBundled(); return r.bundled && r.arm64; } catch { return false; }
}

/**
 * Instala el motor: si TOPOTV lo lleva incluido (assets/engine/aceserve.apk) se instala ese;
 * si no (o el móvil no es de 64 bits) se descarga el oficial de la web de AceStream.
 * Android nunca instala en silencio: el usuario confirma en su diálogo.
 */
export async function installEngine(onProgress: (pct: number | null) => void): Promise<{ ok: boolean; needsPermission?: boolean; error?: string }> {
  const message = (e: unknown) => e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
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

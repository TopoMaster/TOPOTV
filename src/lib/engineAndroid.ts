import { checkBackendStatus } from '@/lib/aceApi';
import { ExternalPlayer } from '@/lib/externalPlayer';
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

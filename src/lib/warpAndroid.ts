import { registerPlugin } from '@capacitor/core';

interface WarpPlugin {
  connect(): Promise<{ connected: boolean }>;
  disconnect(): Promise<{ connected: boolean }>;
  status(): Promise<{ connected: boolean; registered: boolean }>;
}

/** Cloudflare WARP integrado (WarpPlugin.java): VPN por aplicación, solo para el tráfico de TOPOTV. */
export const Warp = registerPlugin<WarpPlugin>('Warp');

const message = (e: unknown) => e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);

/** Conecta WARP. Devuelve null si fue bien o el motivo si no se pudo (para seguir sin él). */
export async function warpUp(): Promise<string | null> {
  try { await Warp.connect(); return null; }
  catch (e) {
    const m = message(e);
    return m.includes('VPN_DENIED') ? 'Permiso de VPN denegado.' : m;
  }
}
export async function warpDown(): Promise<void> {
  try { await Warp.disconnect(); } catch { /* ya estaba apagado */ }
}
export async function warpState(): Promise<{ connected: boolean; registered: boolean }> {
  try { return await Warp.status(); } catch { return { connected: false, registered: false }; }
}

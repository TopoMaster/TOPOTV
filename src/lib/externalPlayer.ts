import { registerPlugin } from '@capacitor/core';

interface ExternalPlayerPlugin {
  open(options: { url: string; title?: string; package?: string; chooser?: boolean }): Promise<{ opened: boolean }>;
  isInstalled(options?: { package?: string }): Promise<{ installed: boolean }>;
}

/** Plugin nativo de Android (ExternalPlayerPlugin.java): abre el stream en VLC. */
export const ExternalPlayer = registerPlugin<ExternalPlayerPlugin>('ExternalPlayer');

export async function openInAndroidVlc(url: string, title: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await ExternalPlayer.open({ url, title });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    if (msg.includes('NOT_INSTALLED')) {
      // Sin VLC: ofrece el selector de Android con cualquier reproductor de vídeo instalado.
      try { await ExternalPlayer.open({ url, title, chooser: true }); return { ok: true }; } catch { /* sin reproductores */ }
      return { ok: false, error: 'VLC no está instalado en este dispositivo. Instálalo desde Google Play (VLC for Android) o elige el reproductor «Navegador» en Ajustes.' };
    }
    return { ok: false, error: msg };
  }
}

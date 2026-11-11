import { registerPlugin } from '@capacitor/core';

/** Reproductor integrado de Android (PlayerActivity, Media3/ExoPlayer). La promesa termina cuando se cierra. */
export interface NativeResult { position: number; duration: number; ended: boolean; error: string }
interface NativePlayerPlugin {
  play(o: { url: string; title?: string; position?: number; mime?: string; subtitles?: { url: string; lang: string }[] }): Promise<NativeResult>;
}
const Plugin = registerPlugin<NativePlayerPlugin>('NativePlayer');

export function startNativePlayback(o: { url: string; title?: string; resumeMs?: number; subtitles?: { url: string; lang: string }[] }): Promise<NativeResult> {
  return Plugin.play({ url: o.url, title: o.title, position: o.resumeMs && o.resumeMs > 0 ? Math.round(o.resumeMs) : 0, subtitles: o.subtitles ?? [] })
    .catch(e => ({ position: 0, duration: 0, ended: false, error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }));
}

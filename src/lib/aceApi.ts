import type { AceBackendConfig, BackendStatus, PlaybackConfig, Stream } from '@/types';
const DEFAULT: AceBackendConfig = { host: '127.0.0.1', port: 6878 };
export function baseUrl(cfg=DEFAULT) { return `http://${cfg.host}:${cfg.port}`; }
export async function checkBackendStatus(cfg=DEFAULT): Promise<BackendStatus> {
  try { const r=await fetch(`${baseUrl(cfg)}/webui/api/service?method=get_version`,{signal:AbortSignal.timeout(3000)}); return r.ok?'online':'offline'; } catch { return 'offline'; }
}
export function buildStreamUrl(aceId: string, cfg=DEFAULT) { return `${baseUrl(cfg)}/ace/getstream?id=${aceId}`; }
export interface PlayResult { ok: boolean; url: string; error?: string; }
/** Solo comprueba que el motor responde. NO abre el stream: getstream bloquea hasta encontrar peers y rompía la reproducción. */
export async function requestPlay(stream: Stream, cfg=DEFAULT): Promise<PlayResult> {
  const url=buildStreamUrl(stream.aceId,cfg);
  const st=await checkBackendStatus(cfg);
  if(st==='online') return {ok:true,url};
  return {ok:false,url,error:`El motor AceStream no responde en ${cfg.host}:${cfg.port}. Arranca AceStream (Docker/APK) y revisa Ajustes.`};
}
export function buildHlsUrl(aceId: string, cfg=DEFAULT) { return `${baseUrl(cfg)}/ace/manifest.m3u8?id=${aceId}`; }
export type PlayerApp='vlc'|'browser';
export async function openInPlayer(stream: Stream, cfg=DEFAULT, player: PlayerApp='vlc', playback?: PlaybackConfig): Promise<{ok:boolean;method:string;error?:string}> {
  if(player==='browser') return {ok:true,method:'browser'}; // lo reproduce <PlayerOverlay/> con hls.js
  const streamUrl=buildStreamUrl(stream.aceId,cfg);
  try {
    const params = new URLSearchParams({ url: streamUrl });
    if (playback) {
      params.set('networkCaching', String(playback.vlcNetworkCachingMs));
      params.set('liveCaching', String(playback.vlcLiveCachingMs));
    }
    const res=await fetch(`http://localhost:3002/open?${params}`,{signal:AbortSignal.timeout(4000)});
    const data=await res.json();
    if(data.ok) return {ok:true,method:'vlc-helper'};
    return {ok:false,method:'vlc-helper',error:data.error||'VLC Helper no pudo abrir VLC (¿VLC instalado?).'};
  } catch {
    return {ok:false,method:'vlc-helper',error:'VLC Helper no responde en localhost:3002. Ejecuta setup.bat (o node tools/vlc-helper.cjs) o cambia a reproductor Navegador en Ajustes.'};
  }
}
export async function copyStreamUrl(stream: Stream, cfg=DEFAULT) { await navigator.clipboard.writeText(buildStreamUrl(stream.aceId,cfg)); }

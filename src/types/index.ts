/** direct = emisión HLS normal (p. ej. TDT) que no pasa por el motor AceStream; aceId es solo una clave única. */
export interface Stream {
  aceId: string; url: string; label: string; provider: string; direct?: boolean;
  /** Torrent de un addon: se abre con el motor de torrents de Windows y `url` se rellena al estar listo */
  torrent?: { infoHash: string; fileIdx?: number; trackers?: string[] };
}
/** Película o episodio de un addon de Stremio (para reanudar y volver a su ficha) */
export interface VodInfo { type: string; id: string; videoId: string; addon: string; poster?: string; title: string; subtitles?: { url: string; lang: string }[] }
export interface Channel { id: string; tvgId: string; name: string; rawName: string; logo: string; group: string; streams: Stream[]; vod?: VodInfo; }
export interface Group { id: string; title: string; logo: string; channels: Channel[]; }
export interface M3UMeta { epgUrls: string[]; refreshInterval: number; loadedAt: Date; source: string; }
export interface ParsedM3U { meta: M3UMeta; groups: Group[]; allChannels: Channel[]; }
type PlaybackStatus = 'idle' | 'connecting' | 'playing' | 'error' | 'buffering';
export interface PlayerState { channel: Channel | null; stream: Stream | null; status: PlaybackStatus; errorMessage: string | null; startedAt: Date | null; }
export type BackendStatus = 'unknown' | 'online' | 'offline';
export interface AceBackendConfig { host: string; port: number; }
export interface PlaybackConfig {
  vlcNetworkCachingMs: number;
  vlcLiveCachingMs: number;
  hlsLiveSyncDurationCount: number;
  hlsMaxBufferLengthSec: number;
  hlsManifestLoadingMaxRetry: number;
  hlsFragLoadingMaxRetry: number;
}
export interface EPGEvent { channelId: string; title: string; description: string; startTime: Date; endTime: Date; category?: string; poster?: string; }
export interface EPGSchedule { channelId: string; events: EPGEvent[]; }

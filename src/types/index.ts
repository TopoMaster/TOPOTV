export interface Stream { aceId: string; url: string; label: string; provider: string; }
export interface Channel { id: string; tvgId: string; name: string; rawName: string; logo: string; group: string; streams: Stream[]; }
export interface Group { id: string; title: string; logo: string; channels: Channel[]; }
export interface M3UMeta { epgUrls: string[]; refreshInterval: number; loadedAt: Date; source: string; }
export interface ParsedM3U { meta: M3UMeta; groups: Group[]; allChannels: Channel[]; }
export type PlaybackStatus = 'idle' | 'connecting' | 'playing' | 'error' | 'buffering';
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

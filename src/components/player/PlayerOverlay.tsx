import { useEffect, useRef } from 'react';
import { X, Loader2, AlertCircle, MonitorPlay } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { streamHlsUrl } from '@/lib/aceApi';
import { useHealthStore } from '@/store/useHealthStore';

/** Reproductor integrado (modo Navegador, hls.js) + aviso de estado para VLC. */
export function PlayerOverlay() {
  const { channel, stream, status, errorMessage, tried, stop, setStatus, playNext } = usePlayerStore();
  const { preferredPlayer, backendConfig, playback } = useSettingsStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const browserMode = preferredPlayer === 'browser';

  // Navegador: cargar el HLS del motor
  useEffect(() => {
    const video = videoRef.current;
    if (!browserMode || !stream || !video || status === 'error') return;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    const src = streamHlsUrl(stream, backendConfig);
    const onPlaying = () => { setStatus('playing'); useHealthStore.getState().mark(stream.aceId, true); };
    video.addEventListener('playing', onPlaying);
    (async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;
        if (Hls.isSupported()) {
          const h = new Hls({
            manifestLoadingTimeOut: 60000,
            manifestLoadingMaxRetry: playback.hlsManifestLoadingMaxRetry,
            fragLoadingMaxRetry: playback.hlsFragLoadingMaxRetry,
            liveSyncDurationCount: playback.hlsLiveSyncDurationCount,
            maxBufferLength: playback.hlsMaxBufferLengthSec,
          });
          hls = h;
          h.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
          h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) void usePlayerStore.getState().reportFailure(`No se pudo reproducir el stream (${d.details}). Prueba otro enlace o VLC.`, stream.aceId); });
          h.loadSource(src); h.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src; video.play().catch(() => {});
        } else setStatus('error', 'Este navegador no soporta HLS.');
      } catch (e) { setStatus('error', e instanceof Error ? e.message : 'Error de reproducción'); }
    })();
    return () => { cancelled = true; video.removeEventListener('playing', onPlaying); hls?.destroy(); };
  }, [browserMode, stream?.aceId, backendConfig.host, backendConfig.port]); // eslint-disable-line react-hooks/exhaustive-deps

  // VLC: el aviso de "reproduciendo" se oculta solo
  useEffect(() => {
    if (browserMode || status !== 'playing') return;
    const t = setTimeout(() => stop(), 5000);
    return () => clearTimeout(t);
  }, [browserMode, status, stop]);

  if (!channel || !stream || status === 'idle') return null;

  if (browserMode) {
    return (
      <div className={`player-overlay fixed z-50 fade-in${Capacitor.isNativePlatform()?' native-player':''}`} style={{ right: 16, bottom: 16, width: 'min(560px, calc(100vw - 32px))', background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center gap-2" style={{ padding: '8px 12px' }}>
          <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {stream.label}</span></span>
          <button onClick={stop} title="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ position: 'relative', background: '#000', aspectRatio: '16 / 9' }}>
          <video ref={videoRef} controls autoPlay playsInline style={{ width: '100%', height: '100%' }} />
          {status === 'connecting' && <div className="flex flex-col items-center justify-center gap-2" style={{ position: 'absolute', inset: 0, color: 'var(--text-secondary)', fontSize: '0.78rem', pointerEvents: 'none' }}><Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} />Buscando peers... puede tardar hasta 30 s</div>}
          {status === 'error' && <div className="flex flex-col items-center justify-center gap-2 text-center" style={{ position: 'absolute', inset: 0, padding: 16, background: 'rgba(0,0,0,0.8)', color: 'var(--offline-red)', fontSize: '0.78rem' }}><AlertCircle size={22} />{errorMessage}</div>}
        </div>
      </div>
    );
  }

  const err = status === 'error';
  return (
    <div className="fixed z-50 fade-in flex items-start gap-3" style={{ right: 16, bottom: 16, maxWidth: 380, padding: '12px 14px', background: 'var(--bg-surface)', border: `1px solid ${err ? 'rgba(239,68,68,0.4)' : 'var(--border-mid)'}`, borderRadius: 'var(--radius-lg)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
      {err ? <AlertCircle size={18} style={{ color: 'var(--offline-red)', flexShrink: 0, marginTop: 2 }} /> : status === 'connecting' ? <Loader2 size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2, animation: 'spin 0.8s linear infinite' }} /> : <MonitorPlay size={18} style={{ color: 'var(--online-green)', flexShrink: 0, marginTop: 2 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.8rem', fontWeight: 600 }}>{err ? 'No se pudo reproducir' : status === 'connecting' ? 'Abriendo VLC...' : 'Enviado a VLC'}</p>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{err ? errorMessage : `${channel.name} · ${stream.label}. VLC puede tardar unos segundos en buscar peers.`}</p>
        {channel.streams.length > 1 && tried.length < channel.streams.length && <button onClick={() => void playNext()} style={{ marginTop: 8, minHeight: 32, padding: '0 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>Probar otro enlace ({tried.length}/{channel.streams.length})</button>}
      </div>
      <button onClick={stop} title="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
    </div>
  );
}

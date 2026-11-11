import { useEffect, useRef, useState } from 'react';
import type Hls from 'hls.js';
import { X, Loader2, AlertCircle, MonitorPlay } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { streamHlsUrl } from '@/lib/aceApi';
import { useHealthStore } from '@/store/useHealthStore';
import { useProgressStore } from '@/store/useProgressStore';

/** Reproductor integrado (modo Navegador, hls.js) + aviso de estado para VLC. */
export function PlayerOverlay() {
  const { channel, stream, status, errorMessage, tried, detail, stop, setStatus, playNext } = usePlayerStore();
  const { preferredPlayer, backendConfig, playback } = useSettingsStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const browserMode = preferredPlayer === 'browser';
  const hlsRef = useRef<Hls | null>(null);
  const [audio, setAudio] = useState<{ tracks: string[]; sel: number }>({ tracks: [], sel: 0 });
  const [subs, setSubs] = useState<{ tracks: string[]; sel: number }>({ tracks: [], sel: -1 });

  // Navegador: cargar el HLS del motor
  useEffect(() => {
    const video = videoRef.current;
    if (!browserMode || !stream || !video || status === 'error' || (stream.torrent && !stream.url)) return;
    let hls: Hls | null = null;
    setAudio({ tracks: [], sel: 0 }); setSubs({ tracks: [], sel: -1 });
    let cancelled = false;
    const src = streamHlsUrl(stream, backendConfig);
    const onPlaying = () => { setStatus('playing'); useHealthStore.getState().mark(stream.aceId, true); };
    video.addEventListener('playing', onPlaying);
    // vídeo directo que no es HLS (mp4, webm, torrents…): lo reproduce el propio navegador
    const plain = stream.direct && !/\.m3u8(\?|$)/i.test(src);
    const onVideoError = () => { void usePlayerStore.getState().reportFailure('El navegador no puede reproducir este vídeo (formato no compatible). Prueba otro enlace o VLC.', stream.aceId); };
    if (plain) { video.addEventListener('error', onVideoError); video.src = src; video.play().catch(() => {}); }
    (async () => {
      if (plain) return;
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
          hls = h; hlsRef.current = h;
          h.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}); });
          h.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => setAudio({ tracks: h.audioTracks.map((t, i) => t.name || t.lang || `Audio ${i + 1}`), sel: h.audioTrack }));
          h.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => setSubs({ tracks: h.subtitleTracks.map((t, i) => t.name || t.lang || `Subtítulos ${i + 1}`), sel: h.subtitleTrack }));
          h.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) void usePlayerStore.getState().reportFailure(`No se pudo reproducir el stream (${d.details}). Prueba otro enlace o VLC.`, stream.aceId); });
          h.loadSource(src); h.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src; video.play().catch(() => {});
        } else setStatus('error', 'Este navegador no soporta HLS.');
      } catch (e) { setStatus('error', e instanceof Error ? e.message : 'Error de reproducción'); }
    })();
    return () => { cancelled = true; video.removeEventListener('playing', onPlaying); hls?.destroy(); if (hlsRef.current === hls) hlsRef.current = null; if (plain) { video.removeEventListener('error', onVideoError); video.removeAttribute('src'); video.load(); } };
  }, [browserMode, stream?.aceId, stream?.url, backendConfig.host, backendConfig.port]); // eslint-disable-line react-hooks/exhaustive-deps

  // Películas y episodios de addons: reanudar donde lo dejaste y guardar el progreso
  useEffect(() => {
    const v = videoRef.current;
    const vod = channel?.vod;
    if (!browserMode || !v || !vod || !stream || (stream.torrent && !stream.url)) return;
    let last = 0;
    const save = () => { if (isFinite(v.duration) && v.duration > 0) useProgressStore.getState().save({ type: vod.type, id: vod.id, videoId: vod.videoId, addon: vod.addon, title: vod.title, poster: vod.poster, pos: v.currentTime, dur: v.duration }); };
    const onMeta = () => { const r = usePlayerStore.getState().resumeAt; if (r > 5 && isFinite(v.duration) && r < v.duration - 30) v.currentTime = r; };
    const onTime = () => { const now = Date.now(); if (now - last >= 10000) { last = now; save(); } };
    v.addEventListener('loadedmetadata', onMeta); v.addEventListener('timeupdate', onTime);
    return () => { v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('timeupdate', onTime); save(); };
  }, [browserMode, stream?.url, channel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navegador: espacio/K pausa, F pantalla completa, M silencio (si el vídeo no tiene ya el foco)
  useEffect(() => {
    if (!browserMode || !stream) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName) || t.isContentEditable || e.ctrlKey || e.altKey || e.metaKey) return;
      const v = videoRef.current;
      if (!v) return;
      const k = e.key.toLowerCase();
      if ((k === ' ' && t.tagName !== 'VIDEO') || k === 'k') { e.preventDefault(); if (v.paused) void v.play(); else v.pause(); }
      else if (k === 'f') { e.preventDefault(); if (document.fullscreenElement) void document.exitFullscreen(); else void v.requestFullscreen?.(); }
      else if (k === 'm') { e.preventDefault(); v.muted = !v.muted; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [browserMode, stream?.aceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // VLC: el aviso de "reproduciendo" se oculta solo
  useEffect(() => {
    if (browserMode || status !== 'playing') return;
    const t = setTimeout(() => stop(), 5000);
    return () => clearTimeout(t);
  }, [browserMode, status, stop]);

  if (!channel || !stream || status === 'idle') return null;
  if (preferredPlayer === 'native' && status === 'playing') return null;   // el reproductor integrado ocupa toda la pantalla

  if (browserMode) {
    return (
      <div className={`player-overlay fixed z-50 fade-in${Capacitor.isNativePlatform()?' native-player':''}`} style={{ right: 16, bottom: 16, width: 'min(560px, calc(100vw - 32px))', background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center gap-2" style={{ padding: '8px 12px' }}>
          <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {stream.label}</span></span>
          {audio.tracks.length > 1 && <select aria-label="Audio" value={audio.sel} onChange={e => { const n = Number(e.target.value); if (hlsRef.current) hlsRef.current.audioTrack = n; setAudio(a => ({ ...a, sel: n })); }} style={{ maxWidth: 120, padding: '3px 6px', fontSize: '0.7rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 6, color: 'var(--text-primary)' }}>{audio.tracks.map((t, i) => <option key={i} value={i}>{t}</option>)}</select>}
          {subs.tracks.length > 0 && <select aria-label="Subtítulos" value={subs.sel} onChange={e => { const n = Number(e.target.value); if (hlsRef.current) hlsRef.current.subtitleTrack = n; setSubs(x => ({ ...x, sel: n })); }} style={{ maxWidth: 120, padding: '3px 6px', fontSize: '0.7rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 6, color: 'var(--text-primary)' }}><option value={-1}>Sin subtítulos</option>{subs.tracks.map((t, i) => <option key={i} value={i}>{t}</option>)}</select>}
          <button onClick={stop} title="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ position: 'relative', background: '#000', aspectRatio: '16 / 9' }}>
          <video ref={videoRef} controls autoPlay playsInline style={{ width: '100%', height: '100%' }} />
          {status === 'connecting' && <div className="flex flex-col items-center justify-center gap-2" style={{ position: 'absolute', inset: 0, color: 'var(--text-secondary)', fontSize: '0.78rem', pointerEvents: 'none' }}><Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} />{detail || 'Buscando peers... puede tardar hasta 30 s'}</div>}
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
        <p style={{ fontSize: '0.8rem', fontWeight: 600 }}>{err ? 'No se pudo reproducir' : status === 'connecting' ? (detail || (preferredPlayer === 'native' ? 'Abriendo el reproductor…' : 'Abriendo VLC...')) : 'Enviado a VLC'}</p>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{err ? errorMessage : `${channel.name} · ${stream.label}. VLC puede tardar unos segundos en buscar peers.`}</p>
        {channel.streams.length > 1 && tried.length < channel.streams.length && <button onClick={() => void playNext()} style={{ marginTop: 8, minHeight: 32, padding: '0 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>Probar otro enlace ({tried.length}/{channel.streams.length})</button>}
      </div>
      <button onClick={stop} title="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Hls from 'hls.js';
import {
  X, Loader2, AlertCircle, Maximize, Minimize, Maximize2, Minimize2, Play, Pause, Volume2, Volume1, VolumeX,
  Settings2, PictureInPicture2, SkipBack, SkipForward, ExternalLink, RotateCcw, Radio, Rewind,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useM3UStore } from '@/store/useM3UStore';
import { useEPGStore } from '@/store/useEPGStore';
import { useHealthStore } from '@/store/useHealthStore';
import { useProgressStore } from '@/store/useProgressStore';
import { streamHlsUrl } from '@/lib/aceApi';
import { startTimeshift, stopTimeshift } from '@/lib/timeshift';
import { getNowPlaying, getProgressPercent, getUpNext } from '@/lib/epg';
import { langName } from '@/lib/streamLang';
import { langFromChannel } from '@/lib/translate';
import { Translated } from '@/components/shared/Translated';
import type { EPGSchedule } from '@/types';

/** SRT → WebVTT (el navegador solo entiende VTT) */
const srtToVtt = (srt: string) => 'WEBVTT\n\n' + srt.replace(/\r/g, '').replace(/^﻿/, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

/** Preferencias del reproductor que se recuerdan en este equipo */
function remembered<T>(key: string, def: T): T { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : def; } catch { return def; } }
function remember(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }

const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(x).padStart(2, '0')}`;
};
/** «1080p», o «1080p · 5,2 Mb/s» si hay varias con la misma altura */
function levelLabels(levels: { height?: number; bitrate: number }[]) {
  const mb = (b: number) => `${(b / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 1 })} Mb/s`;
  return levels.map(l => !l.height ? mb(l.bitrate) : levels.filter(o => o.height === l.height).length > 1 ? `${l.height}p · ${mb(l.bitrate)}` : `${l.height}p`);
}
const hhmm = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

type Mode = 'mini' | 'theater';
type SubSize = 's' | 'm' | 'l';

/**
 * Reproductor integrado (modo «Dentro de TOPOTV»): hls.js para los canales y vídeo directo para películas y torrents.
 * Controles propios que se ocultan solos, programa en emisión, cambio de canal, «Ir al directo», calidad, audio,
 * subtítulos, imagen en imagen, modo cine, pantalla completa y reconexión automática si el canal se corta.
 */
export function BrowserPlayer() {
  const { channel, stream, status, errorMessage, tried, detail, stop, setStatus, playNext, fallbackToVlc, play } = usePlayerStore();
  const { backendConfig, playback, translateTo } = useSettingsStore();
  const groups = useM3UStore(s => s.groups);
  const epgStatus = useEPGStore(s => s.status);
  const native = Capacitor.isNativePlatform();
  const desktop = !native;

  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [mode, setMode] = useState<Mode>(() => remembered<Mode>('topotv-player-mode', 'mini'));
  const [fullscreen, setFullscreen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [vol, setVol] = useState(() => remembered('topotv-volume', { v: 1, muted: false }));
  const [time, setTime] = useState({ cur: 0, dur: 0, behind: 0, start: 0, end: 0 });
  /** Rebobinado activo (Windows): hora real a la que empieza lo guardado */
  const [shift, setShift] = useState<{ startedAt: number } | null>(null);
  const [audio, setAudio] = useState<{ tracks: string[]; sel: number }>({ tracks: [], sel: 0 });
  const [texts, setTexts] = useState<{ label: string }[]>([]);
  const [textSel, setTextSel] = useState(-1);
  const [levels, setLevels] = useState<string[]>([]);
  const [hlsLive, setHlsLive] = useState<boolean | null>(null);
  const [level, setLevel] = useState(-1);
  const [subSize, setSubSize] = useState<SubSize>(() => remembered<SubSize>('topotv-subs-size', 'm'));
  const [menu, setMenu] = useState(false);
  const [active, setActive] = useState(true);
  const [schedule, setSchedule] = useState<EPGSchedule | null>(null);
  const [, setTick] = useState(0);
  const hideTimer = useRef<number | undefined>(undefined);
  const userPickedSubs = useRef(false);

  const isVod = !!channel?.vod;
  const seekable = time.dur > 0 && (isVod || hlsLive === false || (hlsLive === null && !!stream?.direct));
  const dvr = !!shift && !seekable && time.end - time.start > 30;
  const theater = mode === 'theater' && !native;

  /* ── Mostrar los controles al mover el ratón o tocar; se ocultan a los 3 s ── */
  const poke = useCallback(() => {
    setActive(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setActive(false), 3000);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);
  const showControls = active || paused || menu || status !== 'playing' || waiting;

  /* ── Cargar el HLS del motor (o el vídeo directo) ── */
  useEffect(() => {
    const video = videoRef.current;
    if (!stream || !video || usePlayerStore.getState().status === 'error' || (stream.torrent && !stream.url)) return;
    let hls: Hls | null = null;
    setAudio({ tracks: [], sel: 0 }); setTexts([]); setTextSel(-1); setLevels([]); setLevel(-1); setHlsLive(null); setReconnecting(false); setWaiting(false); setShift(null);
    let cancelled = false;
    let shiftId: string | null = null;
    const engineSrc = streamHlsUrl(stream, backendConfig);
    let src = engineSrc;
    const onPlaying = () => { setStatus('playing'); useHealthStore.getState().mark(stream.aceId, true); };
    video.addEventListener('playing', onPlaying);
    // vídeo directo que no es HLS (mp4, webm, torrents…): lo reproduce el propio navegador
    const plain = stream.direct && !/\.m3u8(\?|$)/i.test(src);
    const onVideoError = () => {
      const code = video.error?.code;
      // formato que el navegador no sabe abrir (MKV, HEVC, AC3…): en Windows se pasa a VLC en vez de fallar
      if (desktop && (code === 3 || code === 4)) { void fallbackToVlc('Este formato no se puede ver dentro de la app: se ha abierto en VLC.'); return; }
      void usePlayerStore.getState().reportFailure('El navegador no puede reproducir este vídeo (formato no compatible). Prueba otro enlace.', stream.aceId);
    };
    if (plain) { video.addEventListener('error', onVideoError); video.src = src; video.play().catch(() => {}); }
    (async () => {
      if (plain) return;
      try {
        // Windows, canal en directo: pasa por el servicio de rebobinado (si no responde, se ve directamente del motor)
        const st = useSettingsStore.getState();
        if (desktop && !stream.direct && st.rewindEnabled) {
          const ts = await startTimeshift(engineSrc, { channelId: channel?.id ?? stream.aceId, name: channel?.name ?? stream.label, minutes: st.rewindMinutes, gb: st.rewindCacheGB, keep: st.rewindKeep });
          if (cancelled) { if (ts) stopTimeshift(ts.id); return; }
          if (ts) { shiftId = ts.id; src = ts.playlist; setShift({ startedAt: ts.startedAt }); }
        }
        const { default: HlsJs } = await import('hls.js');
        if (cancelled) return;
        if (HlsJs.isSupported()) {
          const h = new HlsJs({
            manifestLoadingTimeOut: 60000,
            manifestLoadingMaxRetry: playback.hlsManifestLoadingMaxRetry,
            fragLoadingMaxRetry: playback.hlsFragLoadingMaxRetry,
            liveSyncDurationCount: playback.hlsLiveSyncDurationCount,
            maxBufferLength: playback.hlsMaxBufferLengthSec,
            enableCEA708Captions: true,        // subtítulos que emita el canal (CC1…)
            renderTextTracksNatively: true,
          });
          hls = h; hlsRef.current = h;
          h.subtitleDisplay = false;           // los subtítulos no salen solos: se eligen en Opciones o con la C
          let mediaRetries = 0, netRetries = 0;
          h.on(HlsJs.Events.MANIFEST_PARSED, () => {
            setLevels(h.levels.length > 1 ? levelLabels(h.levels) : []);
            video.play().catch(() => {});
          });
          h.on(HlsJs.Events.AUDIO_TRACKS_UPDATED, () => setAudio({ tracks: h.audioTracks.map((t, i) => t.name || (t.lang ? langName(t.lang) : '') || `Audio ${i + 1}`), sel: h.audioTrack }));
          h.on(HlsJs.Events.FRAG_BUFFERED, () => { netRetries = 0; setReconnecting(false); });
          h.on(HlsJs.Events.LEVEL_LOADED, (_e, d) => setHlsLive(d.details.live));
          h.on(HlsJs.Events.ERROR, (_e, d) => {
            if (!d.fatal) return;
            if (desktop && /codec|incompatible/i.test(String(d.details))) { void fallbackToVlc('El audio o el vídeo de este canal no se puede reproducir dentro de la app: se ha abierto en VLC.'); return; }
            // tropiezos que se arreglan solos: el vídeo se recompone y la red se vuelve a pedir (dos veces) antes de cambiar de enlace
            if (d.type === HlsJs.ErrorTypes.MEDIA_ERROR && mediaRetries < 2) { mediaRetries++; h.recoverMediaError(); return; }
            if (d.type === HlsJs.ErrorTypes.MEDIA_ERROR && desktop) { void fallbackToVlc('Este canal emite en un formato que no se puede ver dentro de la app: se ha abierto en VLC.'); return; }
            if (d.type === HlsJs.ErrorTypes.NETWORK_ERROR && netRetries < 2 && usePlayerStore.getState().status === 'playing') {
              netRetries++; setReconnecting(true);
              window.setTimeout(() => { if (hlsRef.current === h) h.startLoad(-1); }, 2000);
              return;
            }
            void usePlayerStore.getState().reportFailure(`No se pudo reproducir el stream (${d.details}). Prueba otro enlace.`, stream.aceId);
          });
          h.loadSource(src); h.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src; video.play().catch(() => {});
        } else setStatus('error', 'Este navegador no soporta HLS.');
      } catch (e) { setStatus('error', e instanceof Error ? e.message : 'Error de reproducción'); }
    })();
    return () => { cancelled = true; if (shiftId) stopTimeshift(shiftId); video.removeEventListener('playing', onPlaying); hls?.destroy(); if (hlsRef.current === hls) hlsRef.current = null; if (plain) { video.removeEventListener('error', onVideoError); video.removeAttribute('src'); video.load(); } };
  }, [stream?.aceId, stream?.url, backendConfig.host, backendConfig.port]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Estado del vídeo: pausa, carga, tiempo y distancia al directo ── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    setTime({ cur: 0, dur: 0, behind: 0, start: 0, end: 0 });
    let stallTimer: number | undefined, failTimer: number | undefined;
    const clearStall = () => { window.clearTimeout(stallTimer); window.clearTimeout(failTimer); };
    const onWaiting = () => {
      setWaiting(true);
      // canal en directo que se queda cargando: a los 12 s se vuelve a pedir el directo; a los 45 s se prueba otro enlace
      if (stream.direct || usePlayerStore.getState().status !== 'playing') return;
      clearStall();
      stallTimer = window.setTimeout(() => {
        const h = hlsRef.current;
        if (!h) return;
        setReconnecting(true);
        h.stopLoad(); h.startLoad(-1);
        if (h.liveSyncPosition) v.currentTime = h.liveSyncPosition;
      }, 12000);
      failTimer = window.setTimeout(() => { void usePlayerStore.getState().reportFailure('El canal se ha cortado y no vuelve. Prueba otro enlace o inténtalo más tarde.', stream.aceId); }, 45000);
    };
    const onPlaying = () => { setWaiting(false); setReconnecting(false); setPaused(false); clearStall(); };
    const onPause = () => setPaused(true);
    const onPlay = () => setPaused(false);
    let lastSec = -1;
    const onTime = () => {
      const sec = Math.floor(v.currentTime);
      if (sec === lastSec) return;
      lastSec = sec;
      const edge = hlsRef.current?.liveSyncPosition ?? (v.seekable.length ? v.seekable.end(v.seekable.length - 1) : v.currentTime);
      const start = v.seekable.length ? v.seekable.start(0) : 0, end = v.seekable.length ? v.seekable.end(v.seekable.length - 1) : 0;
      setTime({ cur: v.currentTime, dur: isFinite(v.duration) ? v.duration : 0, behind: Math.max(0, edge - v.currentTime), start, end });
    };
    v.addEventListener('waiting', onWaiting); v.addEventListener('playing', onPlaying);
    v.addEventListener('pause', onPause); v.addEventListener('play', onPlay);
    v.addEventListener('timeupdate', onTime); v.addEventListener('durationchange', onTime);
    return () => {
      clearStall();
      v.removeEventListener('waiting', onWaiting); v.removeEventListener('playing', onPlaying);
      v.removeEventListener('pause', onPause); v.removeEventListener('play', onPlay);
      v.removeEventListener('timeupdate', onTime); v.removeEventListener('durationchange', onTime);
    };
  }, [stream?.aceId, stream?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Volumen recordado ── */
  useEffect(() => {
    const v = videoRef.current;
    if (v) { v.volume = vol.v; v.muted = vol.muted; }
    remember('topotv-volume', vol);
  }, [vol, stream?.aceId]);

  /* ── Subtítulos: los del canal (CC) y los de los addons de películas (SRT → VTT) ── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return;
    userPickedSubs.current = false;
    const refresh = () => {
      const list = Array.from(v.textTracks);
      const labels = list.map((t, i) => (t.label || (t.language ? langName(t.language) : '') || `Subtítulos ${i + 1}`) + (t.kind === 'captions' ? ' (CC)' : ''));
      const named = labels.map((l, i) => (labels.filter(x => x === l).length > 1 ? `${l} ${labels.slice(0, i + 1).filter(x => x === l).length}` : l));
      if (!userPickedSubs.current) list.forEach(t => { if (t.mode === 'showing') t.mode = 'hidden'; });
      setTexts(named.map(label => ({ label })));
      setTextSel(list.findIndex(t => t.mode === 'showing'));
    };
    v.textTracks.addEventListener('addtrack', refresh);
    v.textTracks.addEventListener('removetrack', refresh);
    v.textTracks.addEventListener('change', refresh);
    const added: HTMLTrackElement[] = [];
    const urls: string[] = [];
    let cancelled = false;
    (async () => {
      for (const sub of (channel?.vod?.subtitles ?? []).slice(0, 10)) {
        try {
          const r = await fetch(sub.url, { signal: AbortSignal.timeout(10000) });
          if (!r.ok || cancelled) continue;
          const raw = await r.text();
          const url = URL.createObjectURL(new Blob([/^WEBVTT/.test(raw) ? raw : srtToVtt(raw)], { type: 'text/vtt' }));
          urls.push(url);
          const tr = document.createElement('track');
          tr.kind = 'subtitles'; tr.src = url; tr.srclang = sub.lang.slice(0, 2); tr.label = langName(sub.lang);
          v.appendChild(tr); added.push(tr);
        } catch { /* ese subtítulo no se pudo descargar */ }
      }
      refresh();
    })();
    return () => { cancelled = true; v.textTracks.removeEventListener('addtrack', refresh); v.textTracks.removeEventListener('removetrack', refresh); v.textTracks.removeEventListener('change', refresh); added.forEach(t => t.remove()); urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [stream?.aceId, stream?.url, channel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Películas y episodios: reanudar donde lo dejaste y guardar el progreso ── */
  useEffect(() => {
    const v = videoRef.current;
    const vod = channel?.vod;
    if (!v || !vod || !stream || (stream.torrent && !stream.url)) return;
    let last = 0;
    const save = () => { if (isFinite(v.duration) && v.duration > 0) useProgressStore.getState().save({ type: vod.type, id: vod.id, videoId: vod.videoId, addon: vod.addon, title: vod.title, poster: vod.poster, pos: v.currentTime, dur: v.duration }); };
    const onMeta = () => { const r = usePlayerStore.getState().resumeAt; if (r > 5 && isFinite(v.duration) && r < v.duration - 30) v.currentTime = r; };
    const onTime = () => { const now = Date.now(); if (now - last >= 10000) { last = now; save(); } };
    v.addEventListener('loadedmetadata', onMeta); v.addEventListener('timeupdate', onTime);
    return () => { v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('timeupdate', onTime); save(); };
  }, [stream?.url, channel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Programa en emisión (guía) ── */
  useEffect(() => {
    setSchedule(null);
    if (!channel || channel.vod || epgStatus !== 'ready') return;
    let cancelled = false;
    void useEPGStore.getState().getScheduleForChannel(channel).then(s => { if (!cancelled) setSchedule(s); });
    return () => { cancelled = true; };
  }, [channel?.id, epgStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = window.setInterval(() => setTick(n => n + 1), 30000); return () => window.clearInterval(t); }, []);
  const now = getNowPlaying(schedule ?? undefined);
  const next = getUpNext(schedule ?? undefined);

  /* ── Cambiar de canal: anterior / siguiente de la misma categoría ── */
  const siblings = useMemo(() => {
    if (!channel || channel.vod) return [];
    return groups.find(g => g.channels.some(c => c.id === channel.id))?.channels ?? [];
  }, [groups, channel]);
  const neighbour = (dir: 1 | -1) => {
    if (siblings.length < 2 || !channel) return null;
    const i = siblings.findIndex(c => c.id === channel.id);
    return siblings[(i + dir + siblings.length) % siblings.length];
  };
  const zap = (dir: 1 | -1) => { const c = neighbour(dir); if (c) { poke(); void play(c); } };

  /* ── Acciones ── */
  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) void v.play().catch(() => {}); else v.pause(); };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void boxRef.current?.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement && document.fullscreenElement === boxRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const pip = () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture();
    else void v.requestPictureInPicture?.().catch(() => {});
  };
  const pipOk = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;
  const goLive = () => { const v = videoRef.current, h = hlsRef.current; if (!v) return; if (h?.liveSyncPosition) v.currentTime = h.liveSyncPosition; else if (v.seekable.length) v.currentTime = v.seekable.end(v.seekable.length - 1) - 3; void v.play().catch(() => {}); };
  const seekBy = (s: number) => { const v = videoRef.current; if (!v) return; const max = isFinite(v.duration) ? v.duration : (v.seekable.length ? v.seekable.end(v.seekable.length - 1) : v.currentTime); v.currentTime = Math.max(0, Math.min(max, v.currentTime + s)); };
  const setVolume = (n: number) => setVol({ v: Math.max(0, Math.min(1, Math.round(n * 100) / 100)), muted: n <= 0 });
  const pickText = (n: number) => {
    const v = videoRef.current;
    if (!v) return;
    userPickedSubs.current = true;
    Array.from(v.textTracks).forEach((t, i) => { t.mode = i === n ? 'showing' : 'disabled'; });
    setTextSel(n);
  };
  const pickLevel = (n: number) => { const h = hlsRef.current; if (h) h.currentLevel = n; setLevel(n); };
  const pickAudio = (n: number) => { const h = hlsRef.current; if (h) h.audioTrack = n; setAudio(a => ({ ...a, sel: n })); };
  const changeMode = (m: Mode) => { setMode(m); remember('topotv-player-mode', m); };
  // películas en otro idioma: los subtítulos en tu idioma salen los primeros
  const textOrder = texts.map((t, i) => ({ ...t, i })).sort((a, b) => Number(b.label === langName(translateTo)) - Number(a.label === langName(translateTo)));

  /* ── Teclado ── */
  useEffect(() => {
    if (!stream) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable || e.ctrlKey || e.altKey || e.metaKey) return;
      const big = mode === 'theater' || !!document.fullscreenElement;
      const k = e.key.toLowerCase();
      const v = videoRef.current;
      if (!v) return;
      let handled = true;
      if ((k === ' ' && t.tagName !== 'BUTTON') || k === 'k') togglePlay();
      else if (k === 'f') toggleFullscreen();
      else if (k === 'm') setVol(o => ({ ...o, muted: !o.muted }));
      else if (k === 'c') pickText(textSel >= 0 ? -1 : (textOrder[0]?.i ?? -1));
      else if (k === 'i' && pipOk) pip();
      else if (k === 'pageup') zap(-1);
      else if (k === 'pagedown') zap(1);
      else if (big && k === 'arrowup') setVolume((vol.muted ? 0 : vol.v) + 0.1);
      else if (big && k === 'arrowdown') setVolume((vol.muted ? 0 : vol.v) - 0.1);
      else if ((big || seekable || dvr) && k === 'arrowleft') seekBy(-10);
      else if ((big || seekable || dvr) && k === 'arrowright') seekBy(10);
      else if (k === 'escape' && mode === 'theater' && !document.fullscreenElement) changeMode('mini');   // sin cerrar el reproductor
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); poke(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!channel || !stream) return null;

  const remaining = channel.streams.length > 1 && tried.length < channel.streams.length;
  const frags = () => { const h = hlsRef.current; return (h?.levels?.[Math.max(0, h.currentLevel)]?.details?.fragments ?? []).filter(f => f.programDateTime); };
  const atClock = (t: number) => { const f = frags().find(x => t >= x.start && t < x.start + x.duration) ?? frags().at(-1); return f?.programDateTime ? new Date(f.programDateTime + (t - f.start) * 1000) : null; };
  const timeAt = (ms: number) => { const f = [...frags()].reverse().find(x => x.programDateTime! <= ms); return f ? Math.min(f.start + (ms - f.programDateTime!) / 1000, f.start + f.duration) : null; };
  const progStartRaw = dvr && now ? timeAt(now.startTime.getTime()) : null;
  const progStart = progStartRaw !== null && now && frags()[0]?.programDateTime! <= now.startTime.getTime() ? progStartRaw : null;
  const fromStart = () => { const v = videoRef.current; if (v && progStart !== null) { v.currentTime = Math.max(time.start, progStart); void v.play().catch(() => {}); poke(); } };
  const live = !isVod && !seekable;
  const behind = live && time.behind > 20;
  const VolIcon = vol.muted || vol.v === 0 ? VolumeX : vol.v < 0.5 ? Volume1 : Volume2;
  const prev = neighbour(-1), nxt = neighbour(1);
  const iconBtn = 'pl-btn';
  const hasMenu = levels.length > 0 || audio.tracks.length > 1 || texts.length > 0 || desktop || remaining;

  const box = (
    <div ref={boxRef}
      className={`pl-box subs-${subSize}${showControls ? '' : ' pl-idle'}${seekable ? ' has-seek' : ''}`}
      onMouseMove={poke} onTouchStart={poke}
      onMouseLeave={() => { if (!menu) { window.clearTimeout(hideTimer.current); hideTimer.current = window.setTimeout(() => setActive(false), 600); } }}>
      <video ref={videoRef} autoPlay playsInline
        onClick={() => { if (native) { if (showControls && active) setActive(false); else poke(); } else { togglePlay(); poke(); } setMenu(false); }}
        onDoubleClick={desktop ? toggleFullscreen : undefined} />

      {/* Centro: cargando, reconectando, error o pausa */}
      {status === 'connecting' && <div className="pl-center"><Loader2 size={30} className="pl-spin" />{detail || 'Buscando fuentes… puede tardar hasta 30 s'}</div>}
      {status === 'playing' && waiting && <div className="pl-center"><Loader2 size={28} className="pl-spin" />{reconnecting ? 'Reconectando…' : null}</div>}
      {status === 'playing' && paused && !waiting && <button className="pl-bigplay" onClick={togglePlay} aria-label="Reproducir"><Play size={30} fill="currentColor" /></button>}
      {status === 'error' && (
        <div className="pl-center pl-error">
          <AlertCircle size={26} />
          <span>{errorMessage}</span>
          <div className="flex flex-wrap justify-center gap-2" style={{ marginTop: 6 }}>
            {remaining && <button className="pl-chip" onClick={() => void playNext()}><RotateCcw size={13} />Probar otro enlace ({tried.length}/{channel.streams.length})</button>}
            {desktop && <button className="pl-chip" onClick={() => void fallbackToVlc('Abierto en VLC.')}><ExternalLink size={13} />Abrir en VLC</button>}
            {siblings.length > 1 && nxt && <button className="pl-chip" onClick={() => zap(1)}><SkipForward size={13} />{nxt.name}</button>}
          </div>
        </div>
      )}

      {/* Arriba: canal y programa en emisión */}
      <div className="pl-top">
        {live && <span className="live-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: status === 'playing' ? 'var(--live-red)' : 'var(--text-muted)', flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pl-title">{channel.name} <span className="pl-sub">· {stream.label}</span></div>
          {now && (
            <div className="pl-now">
              <span className="pl-time">{hhmm(now.startTime)}–{hhmm(now.endTime)}</span>
              <span className="pl-prog"><Translated text={now.title} from={langFromChannel(channel.name)} /></span>
              {next && <span className="pl-next">· Después: <Translated text={next.title} from={langFromChannel(channel.name)} /></span>}
              <span className="pl-bar"><span style={{ width: `${getProgressPercent(now)}%` }} /></span>
            </div>
          )}
        </div>
        {desktop && !fullscreen && <button className={iconBtn} onClick={() => changeMode(theater ? 'mini' : 'theater')} title={theater ? 'Hacer pequeño (Esc)' : 'Modo cine'} aria-label={theater ? 'Hacer pequeño' : 'Modo cine'}>{theater ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}
        <button className={iconBtn} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); stop(); }} title="Cerrar" aria-label="Cerrar"><X size={18} /></button>
      </div>

      {/* Abajo: controles */}
      <div className="pl-bottom" onClick={e => e.stopPropagation()}>
        {seekable && (
          <div className="pl-seek">
            <span>{clock(time.cur)}</span>
            <input type="range" min={0} max={time.dur} step={1} value={Math.min(time.cur, time.dur)} aria-label="Posición"
              style={{ ['--p' as string]: `${(time.cur / time.dur) * 100}%` }}
              onChange={e => { const v = videoRef.current; if (v) v.currentTime = Number(e.target.value); setTime(t => ({ ...t, cur: Number(e.target.value) })); }} />
            <span>{clock(time.dur)}</span>
          </div>
        )}
        {dvr && (
          <div className="pl-seek">
            <span>{atClock(time.cur) ? hhmm(atClock(time.cur)!) : ''}</span>
            <input type="range" min={time.start} max={time.end} step={1} value={Math.min(Math.max(time.cur, time.start), time.end)} aria-label="Rebobinar"
              style={{ ['--p' as string]: `${((time.cur - time.start) / Math.max(1, time.end - time.start)) * 100}%` }}
              onChange={e => { const v = videoRef.current; if (v) v.currentTime = Number(e.target.value); setTime(t => ({ ...t, cur: Number(e.target.value) })); poke(); }} />
            <span>{behind ? `-${clock(time.behind)}` : 'ahora'}</span>
          </div>
        )}
        <div className="pl-row">
          <button className={iconBtn} onClick={togglePlay} title={paused ? 'Reproducir (espacio)' : 'Pausa (espacio)'} aria-label={paused ? 'Reproducir' : 'Pausa'}>{paused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}</button>
          {siblings.length > 1 && <>
            <button className={iconBtn} onClick={() => zap(-1)} title={`Canal anterior: ${prev?.name ?? ''} (RePág)`} aria-label="Canal anterior"><SkipBack size={16} /></button>
            <button className={iconBtn} onClick={() => zap(1)} title={`Canal siguiente: ${nxt?.name ?? ''} (AvPág)`} aria-label="Canal siguiente"><SkipForward size={16} /></button>
          </>}
          <div className="pl-vol">
            <button className={iconBtn} onClick={() => setVol(o => ({ ...o, muted: !o.muted }))} title="Silencio (M)" aria-label={vol.muted ? 'Activar sonido' : 'Silenciar'}><VolIcon size={17} /></button>
            <input type="range" min={0} max={1} step={0.05} value={vol.muted ? 0 : vol.v} aria-label="Volumen"
              style={{ ['--p' as string]: `${(vol.muted ? 0 : vol.v) * 100}%` }}
              onChange={e => setVolume(Number(e.target.value))} />
          </div>
          {progStart !== null && <button className={iconBtn} onClick={fromStart} title="Ver el programa desde el principio" aria-label="Desde el principio"><Rewind size={17} /></button>}
          {live && (behind
            ? <button className="pl-live behind" onClick={goLive} title="Volver al directo"><Radio size={12} />Ir al directo</button>
            : <span className="pl-live"><span className="dot" />EN DIRECTO</span>)}
          <span style={{ flex: 1 }} />
          {hasMenu && <button className={`${iconBtn}${menu ? ' on' : ''}`} onClick={() => { setMenu(m => !m); poke(); }} title="Opciones: calidad, audio y subtítulos" aria-label="Opciones" aria-expanded={menu}><Settings2 size={17} /></button>}
          {pipOk && <button className={iconBtn} onClick={pip} title="Imagen en imagen (I)" aria-label="Imagen en imagen"><PictureInPicture2 size={17} /></button>}
          {desktop && <button className={iconBtn} onClick={toggleFullscreen} title="Pantalla completa (F)" aria-label="Pantalla completa">{fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}</button>}
        </div>
      </div>

      {/* Opciones */}
      {menu && (
        <div className="pl-menu" onClick={e => e.stopPropagation()}>
          {levels.length > 0 && <div className="pl-menu-sec"><p>Calidad</p><div className="pl-seg">
            <button className={level === -1 ? 'on' : ''} onClick={() => pickLevel(-1)}>Automática</button>
            {levels.map((l, i) => <button key={i} className={level === i ? 'on' : ''} onClick={() => pickLevel(i)}>{l}</button>)}
          </div></div>}
          {audio.tracks.length > 1 && <div className="pl-menu-sec"><p>Audio</p><div className="pl-seg">
            {audio.tracks.map((t, i) => <button key={i} className={audio.sel === i ? 'on' : ''} onClick={() => pickAudio(i)}>{t}</button>)}
          </div></div>}
          {texts.length > 0 && <>
            <div className="pl-menu-sec"><p>Subtítulos (C)</p><div className="pl-seg">
              <button className={textSel === -1 ? 'on' : ''} onClick={() => pickText(-1)}>No</button>
              {textOrder.map(t => <button key={t.i} className={textSel === t.i ? 'on' : ''} onClick={() => pickText(t.i)}>{t.label}</button>)}
            </div></div>
            <div className="pl-menu-sec"><p>Tamaño de los subtítulos</p><div className="pl-seg">
              {([['s', 'Pequeño'], ['m', 'Normal'], ['l', 'Grande']] as const).map(([k, l]) => <button key={k} className={subSize === k ? 'on' : ''} onClick={() => { setSubSize(k); remember('topotv-subs-size', k); }}>{l}</button>)}
            </div></div>
          </>}
          {(remaining || desktop) && <div className="pl-menu-sec"><p>Si no se ve bien</p><div className="pl-seg">
            {remaining && <button onClick={() => { setMenu(false); void playNext(); }}><RotateCcw size={12} />Otro enlace ({tried.length}/{channel.streams.length})</button>}
            {desktop && <button onClick={() => { setMenu(false); void fallbackToVlc('Abierto en VLC.'); }}><ExternalLink size={12} />Abrir en VLC</button>}
          </div></div>}
        </div>
      )}
    </div>
  );

  return (
    <>
      {theater && <div className="pl-backdrop fade-in" onClick={() => changeMode('mini')} aria-hidden />}
      <div className={`player-overlay fixed z-50 fade-in ${theater ? 'pl-theater' : 'pl-mini'}${native ? ' native-player' : ''}`}>{box}</div>
    </>
  );
}

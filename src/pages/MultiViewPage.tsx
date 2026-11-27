import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Columns2, Volume2, VolumeX, X, RefreshCw, Plus } from 'lucide-react';
import type Hls from 'hls.js';
import { useMultiStore, MAX_MULTI } from '@/store/useMultiStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useHealthStore, orderStreams } from '@/store/useHealthStore';
import { streamHlsUrl } from '@/lib/aceApi';
import type { Channel } from '@/types';

function Tile({ channel, muted, onFocus, onRemove }: { channel: Channel; muted: boolean; onFocus: () => void; onRemove: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const backend = useSettingsStore(s => s.backendConfig);
  const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [tried, setTried] = useState(0);
  /** Corte con el canal ya en marcha: desde cuándo (se reconecta solo; no se cambia de enlace salvo que lo pidas) */
  const [cutSince, setCutSince] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const ordered = orderStreams(channel.streams, useHealthStore.getState().streams);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const stream = ordered[tried % Math.max(1, ordered.length)];
    if (!stream) { setState('error'); return; }
    setState('loading'); setCutSince(null);
    const { playback, onCut, cutWaitSec } = useSettingsStore.getState();
    const src = streamHlsUrl(stream, backend);
    let hls: Hls | null = null, cancelled = false, started = false, cut: number | null = null, retries = 0;
    let stall: number | undefined, giveUp: number | undefined;
    const endCut = () => { cut = null; retries = 0; setCutSince(null); window.clearTimeout(giveUp); };
    const onPlaying = () => { started = true; endCut(); window.clearTimeout(stall); setState('playing'); };
    // no llegó a arrancar: enlace siguiente y, si no quedan, error
    const fail = () => { if (cancelled) return; if (tried + 1 < ordered.length) setTried(t => t + 1); else setState('error'); };
    // se cortó viendo el canal: se reconecta solo durante cutWaitSec (o se cambia de enlace, si así lo eliges en Ajustes)
    const onCutNow = (fix: () => void) => {
      if (cancelled) return;
      if (onCut === 'switch') { fail(); return; }
      if (cut === null) { cut = Date.now(); setCutSince(cut); giveUp = window.setTimeout(() => { if (!cancelled && cut !== null) setState('error'); }, cutWaitSec * 1000); }   // se avisa, pero sigue intentándolo: si vuelve, se ve solo
      window.setTimeout(() => { if (!cancelled) fix(); }, Math.min(10000, 2000 * ++retries));
    };
    const onWaiting = () => {
      if (!started || !hls) return;
      window.clearTimeout(stall);
      const again = () => { if (cancelled || !hls) return; onCutNow(() => { hls?.stopLoad(); hls?.startLoad(-1); }); stall = window.setTimeout(again, 20000); };
      stall = window.setTimeout(again, 12000);
    };
    v.addEventListener('playing', onPlaying);
    v.addEventListener('waiting', onWaiting);
    (async () => {
      try {
        const { default: HlsLib } = await import('hls.js');
        if (cancelled) return;
        if (!/\.m3u8(\?|$)/i.test(src) && stream.direct) { v.src = src; v.onerror = () => (started ? onCutNow(() => { v.load(); void v.play().catch(() => {}); }) : fail()); void v.play().catch(() => {}); return; }
        if (HlsLib.isSupported()) {
          const h = new HlsLib({
            manifestLoadingTimeOut: 45000, manifestLoadingMaxRetry: playback.hlsManifestLoadingMaxRetry,
            maxBufferLength: playback.hlsMaxBufferLengthSec, liveSyncDurationCount: playback.hlsLiveSyncDurationCount,
            fragLoadingMaxRetry: playback.hlsFragLoadingMaxRetry, fragLoadingTimeOut: 30000, fragLoadingRetryDelay: 1000, fragLoadingMaxRetryTimeout: 16000,
            levelLoadingTimeOut: 20000, levelLoadingMaxRetry: 10, levelLoadingRetryDelay: 2000,
          });
          hls = h;
          let mediaRetries = 0;
          h.on(HlsLib.Events.MANIFEST_PARSED, () => { void v.play().catch(() => {}); });
          h.on(HlsLib.Events.FRAG_BUFFERED, () => { retries = 0; });
          h.on(HlsLib.Events.ERROR, (_e, d) => {
            if (!d.fatal) return;
            if (d.type === HlsLib.ErrorTypes.MEDIA_ERROR && mediaRetries++ < 3) { h.recoverMediaError(); return; }
            if (!started) { fail(); return; }
            onCutNow(() => (d.type === HlsLib.ErrorTypes.MEDIA_ERROR ? h.recoverMediaError() : h.startLoad(-1)));
          });
          h.loadSource(src); h.attachMedia(v);
        } else { v.src = src; void v.play().catch(() => {}); }
      } catch { fail(); }
    })();
    return () => { cancelled = true; window.clearTimeout(stall); window.clearTimeout(giveUp); v.removeEventListener('playing', onPlaying); v.removeEventListener('waiting', onWaiting); v.onerror = null; hls?.destroy(); v.removeAttribute('src'); v.load(); };
  }, [channel.id, attempt, tried, backend.host, backend.port]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cutSince === null) return; const t = window.setInterval(() => setTick(n => n + 1), 1000); return () => window.clearInterval(t); }, [cutSince]);
  const cutFor = cutSince !== null ? Math.floor((Date.now() - cutSince) / 1000) : 0;
  const nextLink = () => { setTried(t => t + 1); setAttempt(a => a + 1); };

  return (
    <div style={{ position: 'relative', background: '#000', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: `2px solid ${muted ? 'var(--border-subtle)' : 'var(--accent)'}`, aspectRatio: '16 / 9' }}>
      <video ref={ref} muted={muted} autoPlay playsInline style={{ width: '100%', height: '100%', background: '#000' }} onClick={onFocus} />
      <div className="flex items-center gap-2" style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: '6px 8px', background: 'linear-gradient(180deg, rgba(0,0,0,0.7), transparent)' }}>
        <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name}</span>
        <button onClick={onFocus} aria-label={muted ? 'Escuchar este canal' : 'Silenciar'} style={{ background: 'none', border: 'none', color: muted ? '#fff' : 'var(--accent)', cursor: 'pointer' }}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        <button onClick={onRemove} aria-label={`Quitar ${channel.name}`} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={16} /></button>
      </div>
      {state === 'loading' && <div className="flex items-center justify-center" style={{ position: 'absolute', inset: 0, color: 'var(--text-secondary)', fontSize: '0.72rem', pointerEvents: 'none' }}>Conectando…</div>}
      {state === 'playing' && cutSince !== null && (
        <div className="flex flex-col items-center justify-center gap-2" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '0.72rem' }}>
          Se ha cortado. Reconectando… {Math.floor(cutFor / 60)}:{String(cutFor % 60).padStart(2, '0')}
          {ordered.length > 1 && <button onClick={nextLink} style={{ minHeight: 28, padding: '0 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', cursor: 'pointer' }}>Probar otro enlace</button>}
        </div>
      )}
      {state === 'error' && (
        <div className="flex flex-col items-center justify-center gap-2" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', color: 'var(--offline-red)', fontSize: '0.72rem' }}>
          {cutSince !== null ? 'El canal se cortó y no ha vuelto' : 'No se pudo reproducir'}
          <div className="flex gap-2">
          <button onClick={() => { if (cutSince === null) setTried(0); setAttempt(a => a + 1); }} className="flex items-center gap-1" style={{ minHeight: 30, padding: '0 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', cursor: 'pointer' }}><RefreshCw size={12} />Reintentar</button>
            {ordered.length > 1 && <button onClick={nextLink} style={{ minHeight: 30, padding: '0 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', cursor: 'pointer' }}>Otro enlace</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Multivista: varios canales a la vez en cuadrícula; el audio es del que elijas. */
export function MultiViewPage() {
  const navigate = useNavigate();
  const { items, remove, clear } = useMultiStore();
  const [audioId, setAudioId] = useState<string | null>(null);
  const focus = audioId && items.some(i => i.id === audioId) ? audioId : items[0]?.id;
  return (
    <div className="fade-in page-pad" style={{ paddingBottom: 48 }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3"><Columns2 size={22} strokeWidth={1.8} style={{ color: 'var(--accent)' }} /><h1 className="font-display" style={{ fontSize: 'clamp(2rem,4vw,3rem)', lineHeight: 1, letterSpacing: '0.06em' }}>Multivista</h1></div>
        {items.length > 0 && <button onClick={clear} style={{ minHeight: 36, padding: '0 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.76rem' }}>Quitar todo</button>}
      </div>
      {items.length === 0 ? (
        <div className="text-center" style={{ padding: '48px 16px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '0.88rem', marginBottom: 6 }}>Aquí puedes ver hasta {MAX_MULTI} canales a la vez.</p>
          <p style={{ fontSize: '0.76rem', lineHeight: 1.6 }}>Abre un canal y pulsa «Añadir a multivista». El audio es del canal que elijas; los demás van en silencio.</p>
          <button onClick={() => navigate('/categories')} style={{ marginTop: 16, minHeight: 40, padding: '0 20px', background: 'var(--accent-gradient)', color: '#080a0e', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer' }}>Elegir canales</button>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: items.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 10 }}>
            {items.map(c => <Tile key={c.id} channel={c} muted={c.id !== focus} onFocus={() => setAudioId(c.id)} onRemove={() => remove(c.id)} />)}
          </div>
          {items.length < MAX_MULTI && <button onClick={() => navigate('/categories')} className="flex items-center gap-2" style={{ marginTop: 14, minHeight: 38, padding: '0 16px', background: 'var(--bg-elevated)', border: '1px dashed var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.78rem' }}><Plus size={14} />Añadir otro canal</button>}
        </>
      )}
    </div>
  );
}

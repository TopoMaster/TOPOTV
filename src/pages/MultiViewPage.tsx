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

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const ordered = orderStreams(channel.streams, useHealthStore.getState().streams);
    const stream = ordered[tried % Math.max(1, ordered.length)];
    if (!stream) { setState('error'); return; }
    setState('loading');
    const src = streamHlsUrl(stream, backend);
    let hls: Hls | null = null, cancelled = false;
    const onPlaying = () => setState('playing');
    v.addEventListener('playing', onPlaying);
    const fail = () => { if (cancelled) return; if (tried + 1 < ordered.length) setTried(t => t + 1); else setState('error'); };   // enlace siguiente y, si no quedan, error
    (async () => {
      try {
        const { default: HlsLib } = await import('hls.js');
        if (cancelled) return;
        if (!/\.m3u8(\?|$)/i.test(src) && stream.direct) { v.src = src; v.onerror = fail; void v.play().catch(() => {}); return; }
        if (HlsLib.isSupported()) {
          const h = new HlsLib({ manifestLoadingTimeOut: 45000, maxBufferLength: 20, liveSyncDurationCount: 3 });
          hls = h;
          h.on(HlsLib.Events.MANIFEST_PARSED, () => { void v.play().catch(() => {}); });
          h.on(HlsLib.Events.ERROR, (_e, d) => { if (d.fatal) fail(); });
          h.loadSource(src); h.attachMedia(v);
        } else { v.src = src; void v.play().catch(() => {}); }
      } catch { fail(); }
    })();
    return () => { cancelled = true; v.removeEventListener('playing', onPlaying); v.onerror = null; hls?.destroy(); v.removeAttribute('src'); v.load(); };
  }, [channel.id, attempt, tried, backend.host, backend.port]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'relative', background: '#000', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: `2px solid ${muted ? 'var(--border-subtle)' : 'var(--accent)'}`, aspectRatio: '16 / 9' }}>
      <video ref={ref} muted={muted} autoPlay playsInline style={{ width: '100%', height: '100%', background: '#000' }} onClick={onFocus} />
      <div className="flex items-center gap-2" style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: '6px 8px', background: 'linear-gradient(180deg, rgba(0,0,0,0.7), transparent)' }}>
        <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name}</span>
        <button onClick={onFocus} aria-label={muted ? 'Escuchar este canal' : 'Silenciar'} style={{ background: 'none', border: 'none', color: muted ? '#fff' : 'var(--accent)', cursor: 'pointer' }}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button>
        <button onClick={onRemove} aria-label={`Quitar ${channel.name}`} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={16} /></button>
      </div>
      {state === 'loading' && <div className="flex items-center justify-center" style={{ position: 'absolute', inset: 0, color: 'var(--text-secondary)', fontSize: '0.72rem', pointerEvents: 'none' }}>Conectando…</div>}
      {state === 'error' && (
        <div className="flex flex-col items-center justify-center gap-2" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', color: 'var(--offline-red)', fontSize: '0.72rem' }}>
          No se pudo reproducir
          <button onClick={() => { setTried(0); setAttempt(a => a + 1); }} className="flex items-center gap-1" style={{ minHeight: 30, padding: '0 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', cursor: 'pointer' }}><RefreshCw size={12} />Reintentar</button>
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

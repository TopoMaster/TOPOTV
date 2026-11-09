import { useEffect, useRef, useState } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { recordingFileUrl } from '@/lib/recorder';

/**
 * Reproduce una grabación (.ts) dentro de la app. Chromium no abre MPEG-TS por sí solo, así que se usa mpegts.js,
 * que lo convierte al vuelo. Si el vídeo viene en un códec que el navegador no lee (p. ej. HEVC), avisa y se puede abrir en VLC.
 */
export function RecordingPlayer({ id, title, onClose, onOpenVlc }: { id: string; title: string; onClose: () => void; onOpenVlc: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let player: { destroy: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('mpegts.js');
        const mpegts = mod.default;
        if (cancelled) return;
        if (!mpegts.getFeatureList().mseLivePlayback) throw new Error('Este reproductor no puede abrir el formato de la grabación.');
        const p = mpegts.createPlayer({ type: 'mpegts', isLive: false, url: recordingFileUrl(id) }, { enableWorker: true, lazyLoad: true, lazyLoadMaxDuration: 120 });
        player = p;
        p.on(mpegts.Events.ERROR, (_t: string, detail: string) => { if (!cancelled) { setState('error'); setError(`No se pudo reproducir aquí (${detail || 'error de vídeo'}).`); } });
        p.attachMediaElement(video); p.load();
        await p.play();
        if (!cancelled) setState('playing');
      } catch (e) { if (!cancelled) { setState('error'); setError(e instanceof Error ? e.message : String(e)); } }
    })();
    return () => { cancelled = true; try { player?.destroy(); } catch { /* ya cerrado */ } };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-label={`Grabación: ${title}`} className="fixed inset-0 z-50 flex items-center justify-center fade-in" style={{ background: 'rgba(0,0,0,0.82)', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(1100px, 100%)', background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div className="flex items-center gap-2" style={{ padding: '10px 14px' }}>
          <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ position: 'relative', background: '#000', aspectRatio: '16 / 9' }}>
          <video ref={ref} controls autoPlay playsInline style={{ width: '100%', height: '100%' }} />
          {state === 'loading' && <div className="flex items-center justify-center" style={{ position: 'absolute', inset: 0, color: 'var(--text-secondary)', pointerEvents: 'none' }}><Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite' }} /></div>}
          {state === 'error' && (
            <div className="flex flex-col items-center justify-center gap-3 text-center" style={{ position: 'absolute', inset: 0, padding: 20, background: 'rgba(0,0,0,0.85)', color: 'var(--offline-red)', fontSize: '0.82rem' }}>
              <AlertCircle size={24} />{error}
              <button onClick={onOpenVlc} style={{ minHeight: 38, padding: '0 18px', background: 'var(--accent-gradient)', color: '#080a0e', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer' }}>Abrir en VLC</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

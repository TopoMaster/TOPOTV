import { useEffect } from 'react';
import { X, Loader2, AlertCircle, MonitorPlay } from 'lucide-react';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { BrowserPlayer } from './BrowserPlayer';

/** Reproductor integrado (modo «Dentro de TOPOTV») o aviso de estado cuando se reproduce en VLC / reproductor de Android. */
export function PlayerOverlay() {
  const { channel, stream, status, errorMessage, tried, detail, stop, playNext, forcedPlayer } = usePlayerStore();
  const preferredPlayer = useSettingsStore(s => s.preferredPlayer);
  const player = forcedPlayer ?? preferredPlayer;
  const browserMode = player === 'browser';

  // VLC: el aviso de "reproduciendo" se oculta solo
  useEffect(() => {
    if (browserMode || status !== 'playing') return;
    const t = setTimeout(() => stop(), forcedPlayer ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [browserMode, status, stop, forcedPlayer]);

  if (!channel || !stream || status === 'idle') return null;
  if (browserMode) return <BrowserPlayer />;
  if (player === 'native' && status === 'playing') return null;   // el reproductor integrado ocupa toda la pantalla

  const err = status === 'error';
  return (
    <div className="fixed z-50 fade-in flex items-start gap-3" style={{ right: 16, bottom: 16, maxWidth: 400, padding: '12px 14px', background: 'var(--bg-surface)', border: `1px solid ${err ? 'rgba(239,68,68,0.4)' : 'var(--border-mid)'}`, borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
      {err ? <AlertCircle size={18} style={{ color: 'var(--offline-red)', flexShrink: 0, marginTop: 2 }} /> : status === 'connecting' ? <Loader2 size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2, animation: 'spin 0.8s linear infinite' }} /> : <MonitorPlay size={18} style={{ color: 'var(--online-green)', flexShrink: 0, marginTop: 2 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.8rem', fontWeight: 600 }}>{err ? 'No se pudo reproducir' : status === 'connecting' ? (detail || (player === 'native' ? 'Abriendo el reproductor…' : 'Abriendo VLC...')) : 'Enviado a VLC'}</p>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{err ? errorMessage : forcedPlayer && detail ? detail : `${channel.name} · ${stream.label}. VLC puede tardar unos segundos en buscar fuentes.`}</p>
        {channel.streams.length > 1 && tried.length < channel.streams.length && <button onClick={() => void playNext()} style={{ marginTop: 8, minHeight: 32, padding: '0 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer' }}>Probar otro enlace ({tried.length}/{channel.streams.length})</button>}
      </div>
      <button onClick={stop} title="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
    </div>
  );
}

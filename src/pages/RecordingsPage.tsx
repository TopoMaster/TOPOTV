import { useEffect, useState } from 'react';
import { Circle, FolderOpen, Play, Square, Trash2, WifiOff } from 'lucide-react';
import { cancelRecording, deleteRecording, formatBytes, openRecording, openRecordingsFolder, type RecStatus } from '@/lib/recorder';
import { useRecorderStore } from '@/store/useRecorderStore';
import { LoadingState } from '@/components/shared/States';
import { emoji, sportColor } from '@/lib/sports';

const LABEL: Record<RecStatus, { text: string; color: string }> = {
  scheduled: { text: 'Programada', color: 'var(--accent)' },
  recording: { text: 'Grabando', color: 'var(--live-red)' },
  done: { text: 'Lista para ver', color: 'var(--online-green)' },
  failed: { text: 'Falló', color: 'var(--offline-red)' },
  cancelled: { text: 'Cancelada', color: 'var(--text-muted)' },
  missed: { text: 'No se grabó', color: 'var(--offline-red)' },
};
const when = (ms: number) => new Date(ms).toLocaleString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' } as const;

export function RecordingsPage() {
  const { available, dir, recordings, error, refresh } = useRecorderStore();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { void refresh(); const i = setInterval(refresh, 4000); return () => clearInterval(i); }, [refresh]);
  const run = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try { await fn(); await refresh(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  if (available === null) return <LoadingState message="Conectando con el grabador…" />;
  return (
    <div className="fade-in page-pad" style={{ paddingBottom: 48, maxWidth: 900 }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Circle size={22} strokeWidth={1.8} fill="var(--live-red)" style={{ color: 'var(--live-red)' }} />
          <h1 className="font-display" style={{ fontSize: 'clamp(2rem,4vw,3rem)', lineHeight: 1, letterSpacing: '0.06em' }}>Grabaciones</h1>
        </div>
        {available && <button style={btn} onClick={() => run(openRecordingsFolder)}><FolderOpen size={14} />Abrir carpeta</button>}
      </div>

      {!available && (
        <div style={{ padding: 20, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-lg)' }}>
          <div className="flex items-center gap-2 mb-1"><WifiOff size={14} style={{ color: 'var(--offline-red)' }} /><strong style={{ color: 'var(--offline-red)', fontSize: '0.82rem' }}>El grabador no está disponible</strong></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.5 }}>Las grabaciones solo funcionan en la app de Windows. Ábrela con TOPOTV de escritorio y recarga esta pantalla.</p>
        </div>
      )}

      {available && (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.74rem', lineHeight: 1.6, marginBottom: 14 }}>
            Programa una grabación desde <strong style={{ color: 'var(--text-secondary)' }}>Eventos</strong> con el botón «Grabar». El PC debe estar encendido, con TOPOTV abierto (puede estar minimizado) y el motor AceStream activo; TOPOTV evita que Windows se suspenda mientras graba.
            {dir && <> Se guardan en <code style={{ color: 'var(--accent)' }}>{dir}</code>.</>}
          </p>
          {(msg || error) && <p role="alert" style={{ color: 'var(--offline-red)', fontSize: '0.78rem', marginBottom: 10 }}>{msg || error}</p>}
          {recordings.length === 0 && <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Todavía no hay grabaciones.</div>}
          <div className="flex flex-col gap-2">
            {recordings.map(r => {
              const st = LABEL[r.status];
              const live = r.status === 'recording';
              return (
                <div key={r.id} className="surface-card" style={{ position: 'relative', overflow: 'hidden', padding: '12px 16px 12px 20px', borderColor: live ? 'rgba(255,77,77,0.35)' : undefined }}>
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: sportColor(r.sport), opacity: 0.9 }} />
                  <div className="flex items-center gap-3 flex-wrap">
                    <span style={{ fontSize: '1.2rem' }}>{emoji(r.sport)}</span>
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <p style={{ fontSize: '0.92rem', fontWeight: 600 }}>{r.title}</p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {when(r.start)} – {new Date(r.end).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        {r.bytes > 0 && ` · ${formatBytes(r.bytes)}`}
                      </p>
                      {r.error && <p style={{ fontSize: '0.72rem', color: 'var(--offline-red)', marginTop: 2 }}>{r.error}</p>}
                    </div>
                    <span className={live ? 'live-pulse' : ''} style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: st.color, padding: '4px 10px', border: `1px solid ${st.color}`, borderRadius: 100 }}>{st.text}</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.status === 'done' && <button style={{ ...btn, background: 'var(--accent-gradient)', color: '#080a0e', border: 'none', fontWeight: 700 }} onClick={() => run(() => openRecording(r.id))}><Play size={13} fill="#080a0e" />Ver en VLC</button>}
                      {(r.status === 'scheduled' || r.status === 'recording') && <button style={btn} onClick={() => run(() => cancelRecording(r.id))}><Square size={12} />{live ? 'Parar' : 'Cancelar'}</button>}
                      {r.status !== 'recording' && <button style={btn} onClick={() => run(() => deleteRecording(r.id))} title="Borrar la grabación y su archivo"><Trash2 size={13} />Borrar</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

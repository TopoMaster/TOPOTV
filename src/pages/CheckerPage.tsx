import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Play, Check, X, Clock, Loader, Pause } from 'lucide-react';
import { useM3UStore } from '@/store/useM3UStore';
import { useCheckerStore, type CheckRow, type CheckStatus } from '@/store/useCheckerStore';

const SC: Record<CheckStatus, string> = { pending: 'var(--text-muted)', checking: 'var(--accent)', online: 'var(--online-green)', offline: 'var(--offline-red)', timeout: '#f59e0b' };
const SL: Record<CheckStatus, string> = { pending: 'Pendiente', checking: 'Comprobando…', online: 'Funciona', offline: 'Caído', timeout: 'No responde' };
const label = { fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '6px' } as const;
const select = { width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.82rem', cursor: 'pointer', outline: 'none' } as const;

/** Comprobar enlaces: revisa TODAS las opciones de cada canal. Sigue en segundo plano aunque cambies de página. */
export function CheckerPage() {
  const navigate = useNavigate();
  const allChannels = useM3UStore(s => s.allChannels);
  const groups = useM3UStore(s => s.groups);
  const { rows, running, paused, done, start, stop, clear } = useCheckerStore();
  const [group, setGroup] = useState('all');
  const [timeoutMs, setTimeoutMs] = useState(15000);
  const [show, setShow] = useState<'all' | 'ok' | 'bad'>('all');

  const targets = group === 'all' ? allChannels : allChannels.filter(c => c.group === group);
  const links = targets.reduce((n, c) => n + c.streams.length, 0);
  const online = rows.filter(r => r.status === 'online').length;
  const bad = rows.filter(r => r.status === 'offline' || r.status === 'timeout').length;

  // resultados agrupados por canal (con cuántas opciones funcionan)
  const byChannel = useMemo(() => {
    const m = new Map<string, { name: string; group: string; rows: CheckRow[] }>();
    for (const r of rows) { const g = m.get(r.channelId) ?? { name: r.channelName, group: r.group, rows: [] }; g.rows.push(r); m.set(r.channelId, g); }
    return [...m.entries()].map(([id, g]) => ({ id, ...g, ok: g.rows.filter(r => r.status === 'online').length, checked: g.rows.filter(r => r.status !== 'pending' && r.status !== 'checking').length }))
      .filter(c => show === 'all' || (show === 'ok' ? c.ok > 0 : c.checked === c.rows.length && c.ok === 0));
  }, [rows, show]);

  if (!allChannels.length) return <div className="flex flex-col items-center justify-center fade-in" style={{ minHeight: '60vh', gap: '16px' }}><Shield size={48} strokeWidth={1} style={{ color: 'var(--text-muted)', opacity: 0.4 }} /><p style={{ color: 'var(--text-secondary)' }}>Carga una lista M3U primero</p><button onClick={() => navigate('/settings?s=canales')} style={{ padding: '9px 20px', background: 'var(--accent)', color: '#080a0e', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>Ir a Ajustes</button></div>;

  return (
    <div className="page-center fade-in" style={{ padding: '24px', paddingBottom: '48px', maxWidth: '900px' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3"><Shield size={22} strokeWidth={1.8} style={{ color: 'var(--accent)' }} /><h1 className="font-display" style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', lineHeight: 1 }}>Comprobar enlaces</h1></div>
        {rows.length > 0 && <div className="flex items-center gap-3"><span style={{ fontSize: '0.74rem', color: 'var(--online-green)' }}>✓ {online}</span><span style={{ fontSize: '0.74rem', color: 'var(--offline-red)' }}>✗ {bad}</span></div>}
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>Revisa todas las opciones de cada canal. Puedes seguir usando la app mientras tanto: la comprobación continúa en segundo plano (y se pausa sola mientras ves un canal). Lo que funciona sale primero en cada canal y los caídos se marcan.</p>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '16px', marginBottom: '16px' }}>
          <div><label style={label}>Categoría</label>
            <select value={group} onChange={e => setGroup(e.target.value)} disabled={running} style={select}>
              <option value="all">Todas ({allChannels.length} canales)</option>{groups.map(g => <option key={g.id} value={g.title}>{g.title} ({g.channels.length})</option>)}
            </select>
          </div>
          <div><label style={label}>Espera por enlace: {timeoutMs / 1000} s</label>
            <input type="range" min={5000} max={30000} step={1000} value={timeoutMs} disabled={running} onChange={e => setTimeoutMs(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={running ? stop : () => start(targets, { timeoutMs, parallel: 2 })} style={{ padding: '10px 24px', background: running ? 'var(--offline-red)' : 'var(--accent)', color: '#080a0e', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {running ? <><X size={14} strokeWidth={2.5} />Detener</> : <><Play size={14} fill="#080a0e" strokeWidth={0} />Comprobar {links} enlaces</>}
          </button>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{targets.length} canales · todas sus opciones · el motor las revisa de una en una (unos {Math.max(1, Math.round(links * 8 / 60))} min)</span>
          {rows.length > 0 && !running && <button onClick={clear} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.72rem', padding: '6px 12px', cursor: 'pointer' }}>Limpiar</button>}
        </div>
        {running && <div style={{ marginTop: '16px' }}>
          <div className="flex justify-between mb-1"><span style={{ fontSize: '0.72rem', color: paused ? '#f59e0b' : 'var(--text-muted)' }}>{paused ? <><Pause size={11} style={{ display: 'inline', verticalAlign: '-1px' }} /> En pausa mientras ves un canal</> : `Comprobando… ${rows.filter(r => r.status === 'checking').map(r => r.channelName).slice(0, 3).join(' · ')}`}</span><span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{done}/{rows.length}</span></div>
          <div style={{ height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}><div style={{ height: '100%', width: `${rows.length ? (done / rows.length) * 100 : 0}%`, background: 'var(--accent)', transition: 'width 0.3s ease' }} /></div>
        </div>}
      </div>

      {rows.length > 0 && <div className="flex gap-2 mb-3">
        {([['all', 'Todos'], ['ok', 'Con alguna opción que funciona'], ['bad', 'Sin ninguna que funcione']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setShow(k)} style={{ padding: '6px 12px', borderRadius: 100, fontSize: '0.74rem', cursor: 'pointer', border: `1px solid ${show === k ? 'var(--accent)' : 'var(--border-mid)'}`, background: show === k ? 'var(--accent-dim)' : 'var(--bg-elevated)', color: show === k ? 'var(--accent)' : 'var(--text-secondary)' }}>{t}</button>
        ))}
      </div>}

      <div className="flex flex-col gap-2">
        {byChannel.map(c => (
          <div key={c.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${c.ok ? 'var(--online-green)' : c.checked === c.rows.length ? 'var(--offline-red)' : 'var(--border-mid)'}`, borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
              <button onClick={() => navigate(`/channel/${encodeURIComponent(c.id)}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.84rem', fontWeight: 600, textAlign: 'left' }}>{c.name}</button>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{c.group}</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: c.ok ? 'var(--online-green)' : 'var(--text-muted)' }}>{c.ok}/{c.rows.length} funcionan</span>
            </div>
            <div className="flex flex-col gap-1">
              {c.rows.map(r => (
                <div key={r.key} className="flex items-center gap-2" style={{ fontSize: '0.68rem' }}>
                  {r.status === 'checking' ? <Loader size={11} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--accent)', flexShrink: 0 }} />
                    : r.status === 'online' ? <Check size={11} strokeWidth={2.5} style={{ color: SC.online, flexShrink: 0 }} />
                      : r.status === 'offline' ? <X size={11} strokeWidth={2.5} style={{ color: SC.offline, flexShrink: 0 }} />
                        : r.status === 'timeout' ? <Clock size={11} style={{ color: SC.timeout, flexShrink: 0 }} />
                          : <span style={{ width: 11, flexShrink: 0 }} />}
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--text-secondary)', fontFamily: 'DM Mono,monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.streamLabel}</span>
                  <span style={{ color: SC[r.status] }}>{SL[r.status]}</span>
                  <span style={{ width: 52, textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'DM Mono,monospace' }}>{r.ms ? `${(r.ms / 1000).toFixed(1)} s` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {rows.length === 0 && <div style={{ textAlign: 'center', padding: '60px 24px' }}><Shield size={40} strokeWidth={1} style={{ color: 'var(--text-muted)', opacity: 0.25, marginBottom: '16px' }} /><p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Elige la categoría y pulsa «Comprobar»</p></div>}
    </div>
  );
}

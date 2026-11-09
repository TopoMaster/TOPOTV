import { useNavigate } from 'react-router-dom';
import { Play, Tv } from 'lucide-react';
import { useHistoryStore } from '@/store/useHistoryStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useM3UStore } from '@/store/useM3UStore';

/** Botón grande de la portada: seguir con el último canal que viste. */
export function ContinueWatching() {
  const navigate = useNavigate();
  const last = useHistoryStore(s => s.entries[0]);
  const play = usePlayerStore(s => s.play);
  const fresh = useM3UStore(s => last ? s.allChannels.find(c => c.id === last.channel.id) : undefined);
  if (!last) return null;
  const channel = fresh ?? last.channel;   // la versión actual de la lista (enlaces al día) o, si ya no está, la guardada
  const when = new Date(last.watchedAt);
  const sameDay = when.toDateString() === new Date().toDateString();
  const label = sameDay ? `hoy a las ${when.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : when.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
  return (
    <section className="slide-up px-6" style={{ marginTop: 20 }}>
      <div className="surface-card flex items-center gap-4 flex-wrap" style={{ padding: '14px 18px' }}>
        <div className="flex items-center justify-center" style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', overflow: 'hidden', flexShrink: 0 }}>
          {channel.logo ? <img src={channel.logo} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <Tv size={22} style={{ color: 'var(--text-muted)' }} />}
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <p style={{ fontSize: '0.64rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Seguir viendo · {label}</p>
          <p style={{ fontSize: '1.05rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name}</p>
        </div>
        <button onClick={() => play(channel)} className="flex items-center gap-2"
          style={{ minHeight: 42, padding: '0 22px', background: 'var(--accent-gradient)', color: '#080a0e', border: 'none', borderRadius: 100, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
          <Play size={14} fill="#080a0e" strokeWidth={0} />Continuar
        </button>
        <button onClick={() => navigate(`/channel/${channel.id}`)}
          style={{ minHeight: 42, padding: '0 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer' }}>
          Ver canal
        </button>
      </div>
    </section>
  );
}

import { useNavigate } from 'react-router-dom';
import { CalendarRange, Columns2, Search, Shield, Trophy, Tv } from 'lucide-react';
import { useM3UStore } from '@/store/useM3UStore';
import { EmptyState, LoadingState } from '@/components/shared/States';

const shortcut = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '0.82rem', cursor: 'pointer', flex: '1 1 140px' } as const;

/** Categorías de canales como cuadrícula (en móvil sustituye al menú lateral de categorías). */
export function ChannelsPage() {
  const navigate = useNavigate();
  const { groups, allChannels, isLoading, error } = useM3UStore();
  if (isLoading && !allChannels.length) return <LoadingState message="Cargando canales..." />;
  if (!allChannels.length) return <EmptyState error={error} />;
  return (
    <div className="fade-in page-pad" style={{ paddingBottom: 48 }}>
      <h1 className="font-display" style={{ fontSize: 'clamp(1.8rem,5vw,3rem)', lineHeight: 1 }}>Canales</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '6px 0 16px' }}>{allChannels.length} canales en {groups.length} categorías</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12 }}>
        {groups.map(g => (
          <button key={g.id} onClick={() => navigate(`/category/${g.id}`)} className="surface-card"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 124, padding: 12, cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'center' }}>
            {g.logo
              ? <img src={g.logo} alt="" loading="lazy" style={{ width: 48, height: 48, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              : <Tv size={32} strokeWidth={1.5} style={{ color: 'var(--accent)' }} />}
            <span style={{ fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.2 }}>{g.title}</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{g.channels.length} {g.channels.length === 1 ? 'canal' : 'canales'}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 24 }}>
        <button style={shortcut} onClick={() => navigate('/search')}><Search size={16} />Buscar</button>
        <button style={shortcut} onClick={() => navigate('/guide')}><CalendarRange size={16} />Parrilla</button>
        <button style={shortcut} onClick={() => navigate('/multi')}><Columns2 size={16} />Multivista</button>
        <button style={shortcut} onClick={() => navigate('/flashscore')}><Trophy size={16} />Flashscore</button>
        <button style={shortcut} onClick={() => navigate('/checker')}><Shield size={16} />Checker</button>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { Activity, LayoutGrid, Film, Heart, CalendarRange, Columns2, CircleDot, Trophy } from 'lucide-react';
import { useCiriacoStore } from '@/store/useCiriacoStore';
import { useProfileStore } from '@/store/useProfileStore';
import { liveAndNext } from '@/lib/ciriaco';

const SHORTCUTS: { to: string; icon: React.ElementType; label: string; color: string }[] = [
  { to: '/events', icon: Activity, label: 'Eventos', color: '#ff6b6b' },
  { to: '/categories', icon: LayoutGrid, label: 'Canales', color: '#5fb8ff' },
  { to: '/library', icon: Film, label: 'Cine y series', color: '#5fd897' },
  { to: '/favorites', icon: Heart, label: 'Favoritos', color: '#ff7a9a' },
  { to: '/guide', icon: CalendarRange, label: 'Parrilla', color: '#6ee7d8' },
  { to: '/multi', icon: Columns2, label: 'Multivista', color: '#c792ff' },
  { to: '/recordings', icon: CircleDot, label: 'Grabar', color: '#ffa45c' },
  { to: '/flashscore', icon: Trophy, label: 'Resultados', color: '#f5b84a' },
];

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

/** Cabecera de la portada: saludo, resumen de hoy y accesos directos a todo lo que ofrece TOPOTV. */
export function HomeHero() {
  const navigate = useNavigate();
  const data = useCiriacoStore(s => s.data);
  const profileName = useProfileStore(s => s.profiles.find(p => p.id === s.activeId)?.name);
  const items = liveAndNext(data);
  const live = items.filter(i => i.status === 'live').length;
  const today = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const name = profileName && profileName !== 'Principal' ? `, ${profileName}` : '';
  return (
    <section className="home-hero slide-up" style={{ padding: '20px 24px 6px' }}>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{today}</p>
      <h1 className="font-display" style={{ fontSize: 'clamp(2rem,6vw,2.8rem)', marginBottom: 6 }}>{greeting()}{name}</h1>
      {items.length > 0 && (
        <button onClick={() => navigate('/events')} className="flex items-center gap-2" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.84rem', marginBottom: 16 }}>
          {live > 0 && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--live-red)', animation: 'livePulse 1.6s ease-in-out infinite' }} />}
          {live > 0 ? <><strong style={{ color: 'var(--text-primary)' }}>{live} {live === 1 ? 'evento' : 'eventos'} en directo</strong> ahora mismo</> : <>Próximo: <strong style={{ color: 'var(--text-primary)' }}>{items[0].ev.title}</strong></>}
        </button>
      )}
      <div className="home-shortcuts grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(78px,1fr))', marginTop: items.length ? 0 : 10 }}>
        {SHORTCUTS.map(({ to, icon: Icon, label, color }) => (
          <button key={to} onClick={() => navigate(to)} className="flex flex-col items-center gap-1.5"
            style={{ padding: '12px 4px 10px', borderRadius: 18, background: `linear-gradient(160deg, ${color}1c, ${color}08)`, border: `1px solid ${color}33`, color: 'var(--text-primary)', cursor: 'pointer' }}>
            <span className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 14, background: `${color}26`, color }}><Icon size={20} /></span>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.15, textAlign: 'center' }}>{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

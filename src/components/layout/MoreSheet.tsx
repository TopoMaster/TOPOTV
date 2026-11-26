import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Heart, CircleDot, CalendarRange, Columns2, Trophy, Shield, Search, Settings, Users, Palette, X } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';

/** Todas las secciones que no caben en la barra de abajo del móvil, a la vista y con una frase de para qué sirven. */
export const MORE_ITEMS: { to: string; icon: React.ElementType; title: string; desc: string; color: string }[] = [
  { to: '/favorites', icon: Heart, title: 'Favoritos', desc: 'Tus canales guardados', color: '#ff7a9a' },
  { to: '/recordings', icon: CircleDot, title: 'Grabaciones', desc: 'Programa y ve lo grabado', color: '#ff6b6b' },
  { to: '/guide', icon: CalendarRange, title: 'Parrilla', desc: 'Qué echan ahora y luego', color: '#5fb8ff' },
  { to: '/multi', icon: Columns2, title: 'Multivista', desc: 'Varios canales a la vez', color: '#c792ff' },
  { to: '/flashscore', icon: Trophy, title: 'Resultados', desc: 'Marcadores en directo', color: '#f5b84a' },
  { to: '/checker', icon: Shield, title: 'Comprobar enlaces', desc: 'Qué canales funcionan', color: '#5fd897' },
  { to: '/search', icon: Search, title: 'Buscar', desc: 'Canales y eventos', color: '#6ee7d8' },
  { to: '/settings?s=apariencia', icon: Palette, title: 'Apariencia', desc: 'Color y tamaño de letra', color: '#b39dff' },
  { to: '/settings?s=perfiles', icon: Users, title: 'Perfiles', desc: 'Uno por persona', color: '#ffa45c' },
  { to: '/settings', icon: Settings, title: 'Ajustes', desc: 'Motor, listas, avisos…', color: '#9aa4b8' },
];

export function MoreSheet() {
  const open = useUIStore(s => s.moreOpen);
  const setOpen = useUIStore(s => s.setMoreOpen);
  const favCount = useFavoritesStore(s => s.ids.size);
  const navigate = useNavigate();
  const location = useLocation();
  // se cierra al cambiar de pantalla
  useEffect(() => { setOpen(false); }, [location.pathname, location.search, setOpen]);
  if (!open) return null;
  return createPortal(
    <div className="fade-in" role="dialog" aria-modal="true" aria-label="Más secciones" onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 35, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end' }}>
      <div className="slide-up" onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxHeight: '82dvh', overflowY: 'auto', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-mid)', borderRadius: '22px 22px 0 0', padding: '10px 16px calc(74px + env(safe-area-inset-bottom))', boxShadow: '0 -18px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ width: 40, height: 4, borderRadius: 4, background: 'var(--border-accent)', margin: '0 auto 12px' }} />
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display" style={{ fontSize: '1.6rem' }}>Más</h2>
          <button onClick={() => setOpen(false)} aria-label="Cerrar" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
          {MORE_ITEMS.map(({ to, icon: Icon, title, desc, color }) => (
            <button key={to} onClick={() => navigate(to)} className="flex items-center gap-3"
              style={{ padding: '12px', minHeight: 64, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer' }}>
              <span className="relative flex items-center justify-center shrink-0" style={{ width: 38, height: 38, borderRadius: 12, background: `${color}22`, color }}>
                <Icon size={19} />
                {to === '/favorites' && favCount > 0 && <span className="absolute flex items-center justify-center" style={{ top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 9, background: 'var(--accent)', color: '#080a0e', fontSize: '0.6rem', fontWeight: 800 }}>{favCount > 99 ? '99+' : favCount}</span>}
              </span>
              <span className="min-w-0">
                <strong style={{ display: 'block', fontSize: '0.84rem', lineHeight: 1.2 }}>{title}</strong>
                <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

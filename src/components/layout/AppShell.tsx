import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUIStore } from '@/store/useUIStore';
import { PlayerOverlay } from '@/components/player/PlayerOverlay';
import { UpdateBanner } from '@/components/shared/UpdateBanner';
import { PullToRefresh } from '@/components/shared/PullToRefresh';
export function AppShell({ children }: { children: ReactNode }) {
  const sidebarOpen = useUIStore(s => s.sidebarOpen);
  // cada pantalla nueva empieza arriba; al volver atrás, donde la dejaste (p. ej. de la ficha de un canal a Eventos)
  const mainRef = useRef<HTMLElement>(null);
  const loc = useLocation();
  const navType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const m = mainRef.current;
    if (!m) return;
    const key = loc.key;
    const saved = navType === 'POP' ? positions.current.get(key) : undefined;
    m.scrollTo({ top: saved ?? 0 });
    // la página puede tardar un poco en pintarse entera: se reintenta 1,5 s (salvo que te pongas a desplazar tú)
    let timer: number | undefined, tries = 0, stop = false;
    const quit = () => { stop = true; };
    if (saved) {
      const again = () => { if (stop) return; m.scrollTo({ top: saved }); if (Math.abs(m.scrollTop - saved) > 2 && tries++ < 30) timer = window.setTimeout(again, 50); };
      timer = window.setTimeout(again, 50);
      m.addEventListener('touchstart', quit, { passive: true }); m.addEventListener('wheel', quit, { passive: true });
    }
    // se apunta al desplazar (al cambiar de pantalla ya es tarde: la página nueva ya ha recortado la posición)
    const remember = () => positions.current.set(key, m.scrollTop);
    m.addEventListener('scroll', remember, { passive: true });
    return () => { window.clearTimeout(timer); m.removeEventListener('touchstart', quit); m.removeEventListener('wheel', quit); m.removeEventListener('scroll', remember); };
  }, [loc.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="app-shell flex h-screen overflow-hidden" style={{background:'var(--bg-void)'}}>
      <Sidebar />
      <div className="app-content flex flex-col flex-1 min-w-0 transition-all duration-300" style={{marginLeft:sidebarOpen?'240px':'64px'}}>
        <UpdateBanner />
        <TopBar />
        <main ref={mainRef} className="flex-1 overflow-y-auto" style={{background:'radial-gradient(900px 360px at 75% -80px, rgba(var(--accent-rgb),0.09), transparent 70%), var(--bg-void)'}}><PullToRefresh />{children}</main>
      </div>
      <PlayerOverlay />
    </div>
  );
}

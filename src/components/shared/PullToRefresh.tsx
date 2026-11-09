import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, ArrowDown } from 'lucide-react';
import { useM3UStore } from '@/store/useM3UStore';
import { useCiriacoStore } from '@/store/useCiriacoStore';
import { useRecorderStore } from '@/store/useRecorderStore';
import { useSettingsStore } from '@/store/useSettingsStore';

const THRESHOLD = 64;   // píxeles que hay que arrastrar para que se actualice
const MAX_PULL = 96;

/**
 * Tirar hacia abajo para actualizar (pantallas táctiles): en Eventos actualiza la agenda; en el resto recarga los
 * canales. Solo actúa si la pantalla está arriba del todo y el gesto empieza ahí.
 */
export function PullToRefresh() {
  const anchor = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const path = useRef(location.pathname);
  path.current = location.pathname;
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const main = anchor.current?.closest('main');
    if (!main || !('ontouchstart' in window)) return;
    let startY = -1, dist = 0, running = false;

    const run = async () => {
      running = true; setBusy(true);
      try {
        if (path.current.startsWith('/events')) await useCiriacoStore.getState().refresh();
        else await useM3UStore.getState().reloadSources();
        void useSettingsStore.getState().checkBackend();
        void useRecorderStore.getState().refresh();
      } catch { /* los errores ya se muestran en cada pantalla */ }
      finally { running = false; setBusy(false); }
    };
    const onStart = (e: TouchEvent) => { startY = !running && main.scrollTop <= 0 ? e.touches[0].clientY : -1; dist = 0; };
    const onMove = (e: TouchEvent) => {
      if (startY < 0) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { dist = 0; setPull(0); return; }
      if (main.scrollTop > 0) { startY = -1; setPull(0); return; }
      dist = Math.min(MAX_PULL, dy * 0.5);
      setPull(dist);
    };
    const onEnd = () => {
      const fire = startY >= 0 && dist >= THRESHOLD;
      startY = -1; dist = 0; setPull(0);
      if (fire) void run();
    };
    main.addEventListener('touchstart', onStart, { passive: true });
    main.addEventListener('touchmove', onMove, { passive: true });
    main.addEventListener('touchend', onEnd, { passive: true });
    main.addEventListener('touchcancel', onEnd, { passive: true });
    return () => { main.removeEventListener('touchstart', onStart); main.removeEventListener('touchmove', onMove); main.removeEventListener('touchend', onEnd); main.removeEventListener('touchcancel', onEnd); };
  }, []);

  const visible = busy || pull > 8;
  return (
    <>
      <div ref={anchor} style={{ display: 'none' }} />
      {visible && (
        <div role="status" aria-live="polite" className="fixed z-40 flex items-center justify-center gap-2"
          style={{ top: 64 + (busy ? 8 : Math.max(0, pull - 30)), left: '50%', transform: 'translateX(-50%)', padding: '6px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', fontSize: '0.72rem', boxShadow: '0 6px 20px rgba(0,0,0,0.35)', pointerEvents: 'none' }}>
          {busy ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <ArrowDown size={14} style={{ transform: pull >= THRESHOLD ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />}
          {busy ? 'Actualizando…' : pull >= THRESHOLD ? 'Suelta para actualizar' : 'Tira para actualizar'}
        </div>
      )}
    </>
  );
}

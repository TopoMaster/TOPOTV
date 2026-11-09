import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePlayerStore } from '@/store/usePlayerStore';

type Dir = 'left' | 'right' | 'up' | 'down';
const FOCUSABLE = 'a[href],button:not([disabled]),[role="button"],[tabindex="0"],input:not([type="hidden"]),select,textarea,summary';

function visibleFocusables(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && getComputedStyle(el).visibility !== 'hidden';
  });
}

/** Foco por cercanía en la dirección pedida: para moverse por las tarjetas con flechas o con un mando. */
function moveFocus(dir: Dir) {
  const cur = document.activeElement as HTMLElement | null;
  const all = visibleFocusables();
  if (!all.length) return;
  if (!cur || cur === document.body || !all.includes(cur)) { (all.find(e => e.closest('main')) ?? all[0]).focus(); return; }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const el of all) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    const ok = dir === 'right' ? dx > 4 : dir === 'left' ? dx < -4 : dir === 'down' ? dy > 4 : dy < -4;
    if (!ok) continue;
    const along = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy);
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = along + across * 2.5;   // prefiere lo que está en línea recta
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
}

/**
 * Teclado y mando (para usar TOPOTV desde el sofá con el PC en la tele):
 *  «/» o Ctrl+K buscar · Esc cierra el reproductor o vuelve atrás · flechas (con mando o modo TV) para moverse.
 *  Mando: cruceta o palanca mueve, A elige, B vuelve, Y busca.
 */
export function InputControls() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable); };
    const back = () => {
      if (usePlayerStore.getState().status !== 'idle') { usePlayerStore.getState().stop(); return; }
      if (location.pathname !== '/') navigate(-1);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (typing(e.target)) (e.target as HTMLElement).blur(); else back(); return; }
      if (typing(e.target) || e.altKey || e.metaKey) return;
      if ((e.key === '/' && !e.ctrlKey) || (e.ctrlKey && e.key.toLowerCase() === 'k')) { e.preventDefault(); navigate('/search'); return; }
      const pad = document.documentElement.classList.contains('tv-mode') || document.documentElement.dataset.pad === '1';
      const map: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      if (pad && map[e.key] && !e.ctrlKey && !e.shiftKey) {
        const t = e.target as HTMLElement;
        if (t.tagName === 'VIDEO') return;
        e.preventDefault(); moveFocus(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);

    // Mando (Gamepad API): sondeo ligero solo mientras hay uno conectado
    let raf = 0, last = 0, prevA = false, prevB = false, prevY = false;
    const loop = () => {
      const pad = Array.from(navigator.getGamepads?.() ?? []).find(Boolean);
      if (pad) {
        document.documentElement.dataset.pad = '1';
        const now = performance.now();
        const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
        let dir: Dir | null = null;
        if (pad.buttons[14]?.pressed || ax < -0.6) dir = 'left';
        else if (pad.buttons[15]?.pressed || ax > 0.6) dir = 'right';
        else if (pad.buttons[12]?.pressed || ay < -0.6) dir = 'up';
        else if (pad.buttons[13]?.pressed || ay > 0.6) dir = 'down';
        if (dir && now - last > 180) { last = now; moveFocus(dir); }
        const a = !!pad.buttons[0]?.pressed, b = !!pad.buttons[1]?.pressed, y = !!pad.buttons[3]?.pressed;
        if (a && !prevA) (document.activeElement as HTMLElement | null)?.click();
        if (b && !prevB) back();
        if (y && !prevY) navigate('/search');
        prevA = a; prevB = b; prevY = y;
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!raf) raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; delete document.documentElement.dataset.pad; };
    window.addEventListener('gamepadconnected', start);
    window.addEventListener('gamepaddisconnected', stop);
    if (Array.from(navigator.getGamepads?.() ?? []).some(Boolean)) start();
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('gamepadconnected', start); window.removeEventListener('gamepaddisconnected', stop); stop(); };
  }, [navigate, location.pathname]);
  return null;
}

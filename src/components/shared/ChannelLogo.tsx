import { useState } from 'react';

const COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98', '#117a65', '#a04000', '#2e4053'];
function hue(name: string) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0; return COLORS[Math.abs(h) % COLORS.length]; }
function initials(name: string) {
  const w = name.replace(/[^\p{L}\p{N}+ ]/gu, '').split(' ').filter(Boolean);
  return (w.length === 1 ? w[0].slice(0, 3) : w.slice(0, 2).map(x => x[0]).join('') + (w[1] && /^\d+$/.test(w[1]) ? '' : '')).toUpperCase();
}

/** Logo de canal con monograma de color si no hay imagen o falla la carga. */
export function ChannelLogo({ name, src, size = 36 }: { name: string; src?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: Math.round(size / 5), flexShrink: 0 } as const;
  if (src && !failed) {
    return (
      <div style={{ ...box, background: 'linear-gradient(160deg,#1d2433,#10141c)', border: '1px solid rgba(255,255,255,0.08)', padding: Math.round(size / 9), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={src} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
    );
  }
  return <div style={{ ...box, background: hue(name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.34, fontWeight: 700, letterSpacing: '0.02em' }}>{initials(name)}</div>;
}

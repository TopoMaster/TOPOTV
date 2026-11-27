import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Magnet, ArrowLeft } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { usePlayerStore } from '@/store/usePlayerStore';
import type { Channel } from '@/types';

/** base32 (magnet antiguos) → hexadecimal */
function base32ToHex(s: string): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.toUpperCase()) { const v = abc.indexOf(c); if (v < 0) return ''; bits += v.toString(2).padStart(5, '0'); }
  let hex = '';
  for (let i = 0; i + 4 <= bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex.slice(0, 40);
}

/** Lee un enlace magnet: identificador (infohash), nombre y trackers */
export function parseMagnet(link: string): { hash: string; name: string; trackers: string[] } | null {
  if (!/^magnet:\?/i.test(link)) return null;
  const params = new URLSearchParams(link.slice(link.indexOf('?') + 1));
  const xt = params.getAll('xt').map(x => x.match(/^urn:btih:([0-9a-z]+)$/i)?.[1] ?? '').find(Boolean) ?? '';
  const hash = /^[0-9a-f]{40}$/i.test(xt) ? xt.toLowerCase() : /^[a-z2-7]{32}$/i.test(xt) ? base32ToHex(xt) : '';
  if (!hash) return null;
  const trackers = params.getAll('tr').filter(t => /^(udp|https?|wss?):\/\//i.test(t)).slice(0, 30);
  return { hash, name: (params.get('dn') ?? '').trim(), trackers };
}

/**
 * /abrir?magnet=…: TOPOTV abre un enlace magnet (o un .torrent, que la app de Windows convierte en magnet) que has
 * pulsado en el navegador o en otra app, y lo reproduce con su motor de torrents (Windows) o con Ace Serve (Android).
 */
export function OpenLinkPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const link = params.get('magnet') ?? '';
  const info = useMemo(() => parseMagnet(link), [link]);
  const started = useRef('');
  const status = usePlayerStore(s => s.status);

  useEffect(() => {
    if (!info || started.current === info.hash) return;
    started.current = info.hash;
    const title = info.name || `Torrent ${info.hash.slice(0, 8)}`;
    const channel: Channel = {
      id: `magnet-${info.hash}`, tvgId: '', name: title, rawName: title, logo: '', group: 'Torrent',
      streams: [{ aceId: `torrent:${info.hash}:`, url: '', label: title, provider: 'Enlace magnet', torrent: { infoHash: info.hash, trackers: info.trackers } }],
      vod: { type: 'movie', id: `magnet-${info.hash}`, videoId: `magnet-${info.hash}`, addon: 'magnet', title },
    };
    void usePlayerStore.getState().play(channel);
  }, [info]);

  return (
    <section className="flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ minHeight: '60vh' }}>
      <Magnet size={44} strokeWidth={1.4} style={{ color: 'var(--accent)' }} />
      {info ? <>
        <h1 className="font-display" style={{ fontSize: '1.6rem', maxWidth: 680, wordBreak: 'break-word' }}>{info.name || 'Torrent'}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', maxWidth: 460, lineHeight: 1.6 }}>
          {status === 'connecting' ? 'Buscando fuentes del torrent… puede tardar un poco.' : status === 'error' ? 'No se pudo reproducir este torrent.' : 'Abriendo el enlace con el reproductor de TOPOTV.'}
        </p>
      </> : <p style={{ color: 'var(--offline-red)', fontSize: '0.86rem' }}>Ese enlace no es un magnet válido.</p>}
      <button onClick={() => navigate('/')} className="flex items-center gap-2" style={{ minHeight: 40, padding: '0 18px', borderRadius: 100, border: '1px solid var(--border-mid)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer' }}><ArrowLeft size={15} />Ir al inicio</button>
    </section>
  );
}

/** Android: si TOPOTV se abre con un enlace magnet (desde el navegador u otra app), se va a reproducirlo */
export function LinkHandler() {
  const navigate = useNavigate();
  const nav = useRef(navigate);
  nav.current = navigate;
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const go = (url?: string) => { if (url && /^magnet:\?/i.test(url)) nav.current(`/abrir?magnet=${encodeURIComponent(url)}`); };
    void CapApp.getLaunchUrl().then(r => go(r?.url)).catch(() => {});
    let handle: { remove: () => Promise<void> } | null = null;
    let cancelled = false;
    void CapApp.addListener('appUrlOpen', e => go(e.url)).then(h => { if (cancelled) void h.remove(); else handle = h; });
    return () => { cancelled = true; void handle?.remove(); };
  }, []);
  return null;
}

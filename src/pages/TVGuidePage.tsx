import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Search, Tv, ChevronDown } from 'lucide-react';
import { useEPGStore } from '@/store/useEPGStore';
import { useM3UStore } from '@/store/useM3UStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { formatTime, formatDuration } from '@/lib/epg';
import { norm } from '@/lib/text';
import { LoadingState } from '@/components/shared/States';
import type { Channel, EPGEvent } from '@/types';

/** Parrilla de programación: todos los canales sobre una misma línea de tiempo (hoy), con la hora actual marcada. */
const PX = 4;            // píxeles por minuto (una hora = 240 px)
const LABEL_W = 128;     // ancho de la columna de canales
const ROW_H = 56;
const DAY_MIN = 24 * 60;
const PAGE = 40;

const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

function Row({ channel, start, now, onPick }: { channel: Channel; start: number; now: number; onPick: (c: Channel) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [events, setEvents] = useState<EPGEvent[] | null>(null);
  const epgStatus = useEPGStore(s => s.status);
  const getSchedule = useEPGStore(s => s.getScheduleForChannel);
  const [imgErr, setImgErr] = useState(false);

  // la guía de cada canal solo se pide cuando su fila se acerca a la pantalla
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || epgStatus !== 'ready') return;
    let cancelled = false;
    void getSchedule(channel).then(s => { if (!cancelled) setEvents(s ? s.events : []); });
    return () => { cancelled = true; };
  }, [visible, epgStatus, channel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const end = start + DAY_MIN * 60000;
  return (
    <div ref={ref} style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid var(--border-subtle)' }}>
      <button onClick={() => onPick(channel)} title={channel.name} className="flex items-center gap-2"
        style={{ position: 'sticky', left: 0, zIndex: 3, width: LABEL_W, minWidth: LABEL_W, padding: '0 10px', background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)', cursor: 'pointer', textAlign: 'left', color: 'var(--text-secondary)' }}>
        <span style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {channel.logo && !imgErr ? <img src={channel.logo} alt="" loading="lazy" onError={() => setImgErr(true)} style={{ width: '80%', height: '80%', objectFit: 'contain' }} /> : <Tv size={14} style={{ color: 'var(--text-muted)' }} />}
        </span>
        <span style={{ fontSize: '0.68rem', fontWeight: 600, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{channel.name}</span>
      </button>
      <div style={{ position: 'relative', width: DAY_MIN * PX, flexShrink: 0 }}>
        {events === null && <span style={{ position: 'absolute', left: Math.max(0, (now - start) / 60000 * PX) + 12, top: 18, fontSize: '0.64rem', color: 'var(--text-muted)' }}>{visible ? 'Cargando…' : ''}</span>}
        {events && events.length === 0 && <span style={{ position: 'absolute', left: Math.max(0, (now - start) / 60000 * PX) + 12, top: 18, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Sin datos de guía</span>}
        {events?.map(ev => {
          const s = Math.max(start, ev.startTime.getTime()), e = Math.min(end, ev.endTime.getTime());
          if (e <= s) return null;
          const left = (s - start) / 60000 * PX, width = Math.max(30, (e - s) / 60000 * PX - 2);
          const live = now >= ev.startTime.getTime() && now < ev.endTime.getTime();
          const past = ev.endTime.getTime() <= now;
          return (
            <button key={ev.startTime.getTime()} onClick={() => onPick(channel)} title={`${ev.title} · ${formatTime(ev.startTime)}–${formatTime(ev.endTime)} (${formatDuration(ev.startTime, ev.endTime)})`}
              style={{ position: 'absolute', left, width, top: 4, bottom: 4, padding: '4px 8px', textAlign: 'left', overflow: 'hidden', cursor: 'pointer', borderRadius: 6, border: `1px solid ${live ? 'var(--accent)' : 'var(--border-subtle)'}`, background: live ? 'var(--accent-dim)' : past ? 'transparent' : 'var(--bg-elevated)', opacity: past ? 0.55 : 1, color: 'var(--text-primary)' }}>
              <span style={{ display: 'block', fontSize: '0.58rem', color: live ? 'var(--accent)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatTime(ev.startTime)}</span>
              <span style={{ display: '-webkit-box', fontSize: '0.7rem', fontWeight: live ? 700 : 500, lineHeight: 1.2, WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TVGuidePage() {
  const navigate = useNavigate();
  const epgStatus = useEPGStore(s => s.status);
  const allChannels = useM3UStore(s => s.allChannels);
  const groups = useM3UStore(s => s.groups);
  const favIds = useFavoritesStore(s => s.ids);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<string>(favIds.size > 0 ? 'fav' : 'all');
  const [shown, setShown] = useState(PAGE);
  const [now, setNow] = useState(Date.now());
  const scroller = useRef<HTMLDivElement>(null);
  const start = useMemo(() => dayStart(), []);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  // al abrir, la parrilla se coloca una hora antes de «ahora»
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, ((Date.now() - start) / 60000 - 60) * PX);
  }, [epgStatus, start]);

  const rows = useMemo(() => {
    let list = allChannels.filter(c => !c.id.startsWith('ciriaco-'));   // los canales de eventos son de un solo día
    if (scope === 'fav') list = list.filter(c => favIds.has(c.id));
    else if (scope !== 'all') list = list.filter(c => c.group === scope);
    const q = norm(query);
    if (q) list = list.filter(c => norm(c.name).includes(q));
    return list;
  }, [allChannels, scope, favIds, query]);
  useEffect(() => setShown(PAGE), [scope, query]);

  if (epgStatus === 'idle' || epgStatus === 'unavailable') return (
    <div className="flex flex-col items-center justify-center fade-in text-center" style={{ minHeight: '60vh', gap: 14, padding: 24 }}>
      <Calendar size={44} strokeWidth={1} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>No hay guía de programación cargada</p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.6, maxWidth: 380 }}>TOPOTV carga las guías de Elcano al arrancar. Si no aparece, comprueba la conexión o añade una guía en Ajustes.</p>
      <button onClick={() => navigate('/settings')} style={{ minHeight: 40, padding: '0 20px', background: 'var(--accent-gradient)', color: '#080a0e', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer' }}>Ir a Ajustes</button>
    </div>
  );
  if (epgStatus === 'loading' || epgStatus === 'parsing') return <LoadingState message="Cargando guía de programación…" />;

  const chip = (active: boolean) => ({ padding: '6px 14px', background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 100, color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.74rem', fontWeight: active ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 } as const);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const nowLeft = LABEL_W + (now - start) / 60000 * PX;

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 60px)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px 10px', flexShrink: 0 }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-3"><Calendar size={20} strokeWidth={1.8} style={{ color: 'var(--accent)' }} /><h1 className="font-display" style={{ fontSize: 'clamp(1.8rem,3.5vw,2.6rem)', lineHeight: 1, letterSpacing: '0.05em' }}>Parrilla</h1><span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>hoy · {rows.length} canales</span></div>
          <div className="flex items-center gap-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, padding: '0 14px', height: 36 }}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar canal" aria-label="Buscar canal" style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.8rem', width: 140 }} />
          </div>
        </div>
        <div className="scroll-x">
          {favIds.size > 0 && <button onClick={() => setScope('fav')} style={chip(scope === 'fav')}>★ Favoritos</button>}
          <button onClick={() => setScope('all')} style={chip(scope === 'all')}>Todos</button>
          {groups.filter(g => g.channels.some(c => !c.id.startsWith('ciriaco-'))).slice(0, 14).map(g => <button key={g.id} onClick={() => setScope(g.title)} style={chip(scope === g.title)}>{g.title}</button>)}
        </div>
      </div>

      <div ref={scroller} style={{ flex: 1, overflow: 'auto', borderTop: '1px solid var(--border-subtle)', position: 'relative' }}>
        <div style={{ position: 'relative', width: LABEL_W + DAY_MIN * PX }}>
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 4, height: 28, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ position: 'sticky', left: 0, zIndex: 5, width: LABEL_W, minWidth: LABEL_W, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)' }} />
            <div style={{ position: 'relative', width: DAY_MIN * PX }}>
              {hours.map(h => <span key={h} style={{ position: 'absolute', left: h * 60 * PX + 6, top: 6, fontSize: '0.64rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{String(h).padStart(2, '0')}:00</span>)}
            </div>
          </div>
          <div aria-hidden style={{ position: 'absolute', left: nowLeft, top: 28, bottom: 0, width: 2, background: 'var(--live-red)', opacity: 0.85, zIndex: 2, pointerEvents: 'none' }} />
          {rows.slice(0, shown).map(c => <Row key={c.id} channel={c} start={start} now={now} onPick={ch => navigate(`/channel/${ch.id}`)} />)}
          {rows.length === 0 && <p style={{ padding: 40, color: 'var(--text-muted)', fontSize: '0.84rem', position: 'sticky', left: 0 }}>{scope === 'fav' ? 'Marca canales como favoritos para verlos aquí.' : 'Sin canales para este filtro.'}</p>}
          {rows.length > shown && (
            <div style={{ position: 'sticky', left: 0, width: 'min(100%, 100vw)', padding: 16, textAlign: 'center' }}>
              <button onClick={() => setShown(n => n + PAGE)} className="inline-flex items-center gap-2" style={{ minHeight: 38, padding: '0 18px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.78rem' }}><ChevronDown size={14} />Mostrar más ({rows.length - shown})</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Play, WifiOff } from 'lucide-react';
import { useCiriacoStore } from '@/store/useCiriacoStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { LoadingState } from '@/components/shared/States';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { CiriacoAccessNotice, EventRow, UpdateControl } from '@/pages/EventsPage';
import { emoji, sportColor } from '@/lib/sports';
import { eventDuration, eventStatus, eventToChannel, linkTag, sortLinks, todayIso, type CiriacoEvent } from '@/lib/ciriaco';

const PX = 3.4;            // píxeles por minuto (≈204 px/hora)
const LANE_H = 56;
const LEFT_W = 168;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

interface Block { ev: CiriacoEvent; start: number; end: number; lane: number; playable: boolean; }
interface Row { key: string; name: string; logo: string; blocks: Block[]; lanes: number; playable: boolean; }

/** Minutos hasta el primer evento que aún no ha terminado (hoy); en otros días, el primero del día. */
function relevance(row: Row) {
  const n = new Date(); const now = n.getHours() * 60 + n.getMinutes();
  const next = row.blocks.filter(b => b.end > now).map(b => Math.max(0, b.start - now));
  return next.length ? Math.min(...next) : 10000;
}

/** true en pantallas estrechas (móvil): la parrilla horizontal no es usable ahí. */
function useNarrow(max = 700) {
  const query = `(max-width: ${max}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

export function EventsGuidePage() {
  const narrow = useNarrow();
  const { data, online, loading, error, load } = useCiriacoStore();
  const play = usePlayerStore(s => s.play);
  const backend = useSettingsStore(s => s.backendConfig);
  const [day, setDay] = useState(todayIso());
  const [sport, setSport] = useState('all');
  const [onlyLinks, setOnlyLinks] = useState(true);
  const [sel, setSel] = useState<{ ev: CiriacoEvent; key: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!useCiriacoStore.getState().data) load(); }, [load]);
  useEffect(() => { if (data && !data.days.some(d => d.date === day)) setDay(data.days[0]?.date ?? day); }, [data, day]);
  useEffect(() => { const i = setInterval(() => useCiriacoStore.setState(s => ({ data: s.data && { ...s.data } })), 60000); return () => clearInterval(i); }, []);

  const current = data?.days.find(d => d.date === day);
  const sports = useMemo(() => ['all', ...Array.from(new Set((current?.events ?? []).map(e => e.sport).filter(Boolean)))], [current]);

  const { rows, t0, t1 } = useMemo(() => {
    const byKey = new Map<string, Block[]>();
    let min = Infinity, max = -Infinity;
    for (const ev of current?.events ?? []) {
      if (sport !== 'all' && ev.sport !== sport) continue;
      const start = toMin(ev.time), end = start + eventDuration(ev.sport);
      for (const key of ev.channelKeys) {
        if (onlyLinks && !ev.links.some(l => l.channelKey === key)) continue;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push({ ev, start, end, lane: 0, playable: ev.links.some(l => l.channelKey === key) });
        min = Math.min(min, start); max = Math.max(max, end);
      }
    }
    const rows: Row[] = [...byKey].map(([key, blocks]) => {
      blocks.sort((a, b) => a.start - b.start);
      const laneEnd: number[] = [];
      for (const b of blocks) {
        let l = laneEnd.findIndex(e => e <= b.start);
        if (l < 0) { l = laneEnd.length; laneEnd.push(0); }
        laneEnd[l] = b.end; b.lane = l;
      }
      const ch = data?.channels[key];
      return { key, name: ch?.name ?? key, logo: ch?.logo ?? '', blocks, lanes: laneEnd.length, playable: blocks.some(b => b.playable) };
    }).sort((a, b) => Number(b.playable) - Number(a.playable) || relevance(a) - relevance(b) || b.blocks.length - a.blocks.length || a.name.localeCompare(b.name, 'es'));
    if (!isFinite(min)) return { rows, t0: 0, t1: 24 * 60 };
    return { rows, t0: Math.floor(min / 60) * 60, t1: Math.ceil(max / 60) * 60 };
  }, [current, sport, onlyLinks, data]);

  // Desplazar a "ahora" al abrir el día de hoy
  useEffect(() => {
    if (day !== todayIso() || !scroller.current) return;
    const now = new Date(); const m = now.getHours() * 60 + now.getMinutes();
    scroller.current.scrollLeft = Math.max(0, (Math.floor(m / 60) * 60 - t0) * PX);
  }, [day, t0, rows.length]);

  const width = (t1 - t0) * PX;
  const nowMin = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
  const showNow = day === todayIso() && nowMin >= t0 && nowMin <= t1;
  const hours = Array.from({ length: Math.max(0, (t1 - t0) / 60) }, (_, i) => t0 + i * 60);

  const pill = (active: boolean) => ({ padding: '7px 16px', background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: '100px', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: active ? 600 : 400, cursor: 'pointer' as const, whiteSpace: 'nowrap' as const, flexShrink: 0 });

  const selLinks = sel ? [...sortLinks(sel.ev.links.filter(l => l.channelKey === sel.key)), ...sortLinks(sel.ev.links.filter(l => l.channelKey !== sel.key))] : [];
  const selChannel = sel ? eventToChannel(sel.ev, selLinks, backend) : null;

  return (
    <div className="fade-in page-pad" style={{ paddingBottom: '48px' }}>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Calendar size={22} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
          <h1 className="font-display" style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', lineHeight: 1 }}>Guía TV</h1>
        </div>
        <UpdateControl />
      </div>

      <CiriacoAccessNotice />

      {online === false && <div className="flex items-center gap-2" style={{ padding: '16px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-lg)', color: 'var(--offline-red)', fontSize: '0.8rem' }}><WifiOff size={14} />Servidor TOPOTV no disponible (puerto 3004). Reinicia la aplicación.</div>}
      {error && <p style={{ color: 'var(--offline-red)', fontSize: '0.8rem', marginBottom: 12 }}>{error}</p>}
      {loading && !data && <LoadingState message="Cargando la agenda…" />}

      {data && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {data.days.map(d => <button key={d.date} onClick={() => { setDay(d.date); setSel(null); }} style={pill(day === d.date)}>{d.label}</button>)}
            <button onClick={() => setOnlyLinks(v => !v)} style={{ ...pill(onlyLinks), marginLeft: 'auto' }}>Solo canales con enlace</button>
          </div>
          <div className="scroll-x mb-4">
            {sports.map(s => <button key={s} onClick={() => setSport(s)} style={pill(sport === s)}>{s === 'all' ? 'Todos los deportes' : `${emoji(s)} ${s}`}</button>)}
          </div>

          {sel && selChannel && (
            <div className="fade-in" style={{ marginBottom: 16, padding: '14px 16px', background: 'var(--bg-card)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-lg)' }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '0.68rem', color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>{sel.ev.time} · {emoji(sel.ev.sport)} {sel.ev.sport}</p>
                  <p style={{ fontSize: '1rem', fontWeight: 700, marginTop: 2 }}>{sel.ev.title}</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sel.ev.competition}{sel.ev.round ? ` · ${sel.ev.round}` : ''}</p>
                </div>
                <button onClick={() => setSel(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}>Cerrar</button>
              </div>
              <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
                {selChannel.streams.length === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Este evento no tiene enlaces en TOPOTV.</span>}
                {selChannel.streams.map((s, i) => (
                  <button key={s.aceId} onClick={() => play(selChannel, s)} className="flex items-center gap-2"
                    style={{ padding: '5px 14px 5px 6px', background: i === 0 ? 'var(--accent)' : 'var(--bg-elevated)', color: i === 0 ? '#080a0e' : 'var(--text-secondary)', border: `1px solid ${i === 0 ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: '100px', fontSize: '0.72rem', fontWeight: i === 0 ? 700 : 400, cursor: 'pointer' }}>
                    <ChannelLogo name={selLinks[i].channel} src={data.channels[selLinks[i].channelKey]?.logo} size={22} />
                    {i === 0 && <Play size={11} fill="#080a0e" />}{selLinks[i].channel} · {linkTag(selLinks[i])}
                  </button>
                ))}
              </div>
            </div>
          )}

          {narrow ? (
            <div className="flex flex-col gap-2">
              {(current?.events ?? [])
                .filter(e => (sport === 'all' || e.sport === sport) && (!onlyLinks || e.links.length > 0))
                .sort((a, b) => a.time.localeCompare(b.time))
                .map(e => <EventRow key={e.id} ev={e} date={day} channels={data.channels} />)}
              {rows.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No hay eventos para estos filtros</div>}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>No hay eventos para estos filtros</div>
          ) : (
            <div ref={scroller} style={{ overflow: 'auto', maxHeight: 'calc(100vh - 290px)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)', position: 'relative' }}>
              <div style={{ width: LEFT_W + width, position: 'relative' }}>
                {/* Cabecera de horas */}
                <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', height: 30 }}>
                  <div style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 4, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)' }} />
                  <div style={{ position: 'relative', width }}>
                    {hours.map(h => <span key={h} style={{ position: 'absolute', left: (h - t0) * PX + 6, top: 7, fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>{hhmm(h)}</span>)}
                  </div>
                </div>
                {rows.map(row => (
                  <div key={row.key} style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', height: row.lanes * LANE_H + 8 }}>
                    <div className="flex items-center gap-2" style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-surface)', borderRight: '1px solid var(--border-subtle)', padding: '0 10px' }}>
                      <ChannelLogo name={row.name} src={row.logo} size={34} />
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{row.name}</span>
                    </div>
                    <div style={{ position: 'relative', width, backgroundImage: `repeating-linear-gradient(to right, var(--border-subtle) 0, var(--border-subtle) 1px, transparent 1px, transparent ${60 * PX}px)` }}>
                      {row.blocks.map(b => {
                        const st = eventStatus(day, b.ev.time);
                        const live = st === 'live';
                        const active = sel?.ev.id === b.ev.id && sel.key === row.key;
                        return (
                          <button key={b.ev.id} onClick={() => setSel({ ev: b.ev, key: row.key })} title={`${b.ev.time} ${b.ev.title}`}
                            style={{ position: 'absolute', left: (b.start - t0) * PX + 1, width: (b.end - b.start) * PX - 3, top: 4 + b.lane * LANE_H, height: LANE_H - 4, textAlign: 'left', padding: '5px 0 5px 9px',
                              background: active ? 'var(--accent-dim)' : live ? 'rgba(255,77,77,0.12)' : 'var(--bg-card)',
                              border: `1px solid ${active ? 'var(--accent)' : live ? 'rgba(229,53,53,0.45)' : b.playable ? 'var(--border-mid)' : 'var(--border-subtle)'}`,
                              borderLeft: `3px solid ${b.playable ? sportColor(b.ev.sport) : 'var(--border-mid)'}`, borderRadius: 'var(--radius-md)',
                              color: 'var(--text-primary)', cursor: 'pointer', opacity: st === 'finished' ? 0.5 : b.playable ? 1 : 0.7 }}>
                            <span style={{ display: 'block', width: 'fit-content', position: 'sticky', left: LEFT_W + 10, maxWidth: Math.max(60, (b.end - b.start) * PX - 24), overflow: 'hidden' }}>
                              <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emoji(b.ev.sport)} {b.ev.title}</span>
                              <span style={{ display: 'block', fontSize: '0.64rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hhmm(b.start)} · {b.ev.competition}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {showNow && <div style={{ position: 'absolute', top: 0, bottom: 0, left: LEFT_W + (nowMin - t0) * PX, width: 2, background: 'var(--live-red)', zIndex: 1, pointerEvents: 'none' }} />}
              </div>
            </div>
          )}
          <p style={{ marginTop: 10, fontSize: '0.68rem', color: 'var(--text-muted)' }}>La duración de cada evento es una estimación por deporte: la fuente solo indica la hora de inicio.</p>
        </>
      )}
    </div>
  );
}

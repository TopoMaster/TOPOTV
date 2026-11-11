import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, CalendarDays, Circle } from 'lucide-react';
import { useM3UStore } from '@/store/useM3UStore';
import { useCiriacoStore } from '@/store/useCiriacoStore';
import { useRecorderStore } from '@/store/useRecorderStore';
import { ChannelCard } from '@/components/catalog/ChannelCard';
import { EmptyState } from '@/components/shared/States';
import { EventRow } from '@/pages/EventsPage';
import { matchScore } from '@/lib/text';
import { useAddonsStore } from '@/store/useAddonsStore';
import { PosterCard } from '@/pages/LibraryPage';
import { searchAddons, type Addon, type MetaPreview } from '@/lib/stremio';
import { sortAlive, useHealthStore } from '@/store/useHealthStore';
import type { Channel } from '@/types';

const heading = (icon: React.ReactNode, text: string, n: number) => (
  <div className="flex items-center gap-2 mb-3" style={{ marginTop: 8 }}>
    {icon}<h2 className="font-body" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{text} · {n}</h2>
  </div>
);

/** Busca en canales, eventos de la agenda y grabaciones a la vez; sin tildes y perdonando erratas. */
export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Channel[]>([]);
  const searchChannels = useM3UStore(s => s.searchChannels);
  const allChannels = useM3UStore(s => s.allChannels);
  const agenda = useCiriacoStore(s => s.data);
  const recordings = useRecorderStore(s => s.recordings);
  const health = useHealthStore(s => s.streams);
  const inputRef = useRef<HTMLInputElement>(null);
  const allAddons = useAddonsStore(s => s.addons);
  const [vod, setVod] = useState<{ meta: MetaPreview; addon: Addon }[]>([]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setResults(query.trim() ? sortAlive(searchChannels(query.trim()), health) : []); }, [query, searchChannels, health]);

  const q = query.trim();
  useEffect(() => {
    const addons = allAddons.filter(a => a.enabled);
    if (q.length < 2 || !addons.length) { setVod([]); return; }
    let cancelled = false;
    const t = setTimeout(() => { searchAddons(addons, q).then(r => { if (!cancelled) setVod(r.slice(0, 18)); }).catch(() => { if (!cancelled) setVod([]); }); }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, allAddons]);
  const eventHits = useMemo(() => {
    if (!q || !agenda) return [];
    const out: { ev: (typeof agenda.days)[number]['events'][number]; date: string; score: number }[] = [];
    for (const d of agenda.days) for (const ev of d.events) {
      const score = Math.max(matchScore(q, ev.title), matchScore(q, ev.competition) * 0.8, matchScore(q, ev.channelKeys.map(k => agenda.channels[k]?.name ?? k).join(' ')) * 0.6);
      if (score > 0) out.push({ ev, date: d.date, score });
    }
    return out.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date) || a.ev.time.localeCompare(b.ev.time)).slice(0, 12);
  }, [q, agenda]);
  const recHits = useMemo(() => q ? recordings.filter(r => matchScore(q, r.title) > 0) : [], [q, recordings]);

  if (!allChannels.length) return <EmptyState />;
  const nothing = !results.length && !eventHits.length && !recHits.length && !vod.length;
  return (
    <div className="fade-in" style={{ padding: '24px', paddingBottom: '48px' }}>
      <div className="flex items-center gap-3 mb-8" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-lg)', padding: '0 16px', maxWidth: '600px' }} onFocusCapture={e => (e.currentTarget.style.borderColor = 'var(--border-accent)')} onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border-mid)')}>
        <Search size={18} strokeWidth={1.8} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar canales, eventos, equipos, grabaciones…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '1rem', padding: '14px 0', fontFamily: 'DM Sans,sans-serif' }} />
        {query && <button onClick={() => setQuery('')} aria-label="Borrar búsqueda" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}><X size={16} strokeWidth={2} /></button>}
      </div>
      {!q
        ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '60px' }}><p style={{ fontSize: '0.85rem', letterSpacing: '0.04em' }}>Escribe para buscar entre {allChannels.length} canales, la agenda y tus grabaciones</p><p style={{ fontSize: '0.74rem', marginTop: 6 }}>No hace falta poner tildes. Atajo: pulsa / en cualquier pantalla.</p></div>
        : nothing
          ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '60px' }}><p>Sin resultados para "{query}"</p></div>
          : <>
              {eventHits.length > 0 && <section className="mb-8">
                {heading(<CalendarDays size={14} style={{ color: 'var(--accent)' }} />, 'Eventos', eventHits.length)}
                <div className="flex flex-col gap-2">{eventHits.map(h => <EventRow key={h.ev.id} ev={h.ev} date={h.date} channels={agenda!.channels} />)}</div>
              </section>}
              {vod.length > 0 && <section className="mb-8">
                {heading(<Search size={13} style={{ color: 'var(--accent)' }} />, 'Cine y series', vod.length)}
                <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>{vod.map(v => <PosterCard key={`${v.meta.type}:${v.meta.id}`} meta={v.meta} addon={v.addon} />)}</div>
              </section>}
              {recHits.length > 0 && <section className="mb-8">
                {heading(<Circle size={12} fill="var(--live-red)" style={{ color: 'var(--live-red)' }} />, 'Grabaciones', recHits.length)}
                <div className="flex flex-col gap-2">{recHits.map(r => (
                  <button key={r.id} onClick={() => navigate('/recordings')} className="surface-card text-left" style={{ padding: '12px 16px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                    {r.title} <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>· {new Date(r.start).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}</span>
                  </button>))}</div>
              </section>}
              {results.length > 0 && <>
                {heading(<Search size={13} style={{ color: 'var(--text-muted)' }} />, 'Canales', results.length)}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '16px' }}>
                  {results.map((ch, i) => <div key={ch.id} className="slide-up" style={{ animationDelay: `${Math.min(i * 0.02, 0.3)}s` }}><ChannelCard channel={ch} size="md" /></div>)}
                </div>
              </>}
            </>
      }
    </div>
  );
}

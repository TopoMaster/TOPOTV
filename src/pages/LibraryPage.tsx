import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, Search, Puzzle, ChevronRight, Loader2 } from 'lucide-react';
import { useAddonsStore } from '@/store/useAddonsStore';
import { useProgressStore } from '@/store/useProgressStore';
import { browsableCatalogs, fetchCatalog, searchAddons, typeLabel, type Addon, type MetaPreview } from '@/lib/stremio';

const ORDER = ['movie', 'series', 'tv', 'channel', 'anime'];
const cache = new Map<string, MetaPreview[]>();
interface Row { key: string; title: string; items: { meta: MetaPreview; addon: Addon }[]; loading: boolean; error?: string }

export function PosterCard({ meta, addon, width = 130 }: { meta: MetaPreview; addon: Addon; width?: number | string }) {
  const navigate = useNavigate();
  const [bad, setBad] = useState(false);
  const year = meta.releaseInfo ?? meta.year;
  return (
    <button onClick={() => navigate(`/library/${encodeURIComponent(meta.type)}/${encodeURIComponent(meta.id)}?a=${encodeURIComponent(addon.base)}`)}
      className="shrink-0 text-left" style={{ width, alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-primary)' }} title={meta.name}>
      <div style={{ width, aspectRatio: meta.posterShape === 'landscape' ? '16 / 9' : '2 / 3', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {meta.poster && !bad ? <img src={meta.poster} alt="" loading="lazy" onError={() => setBad(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Film size={28} strokeWidth={1.2} style={{ color: 'var(--text-muted)' }} />}
      </div>
      <p style={{ fontSize: '0.74rem', fontWeight: 600, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.25 }}>{meta.name}</p>
      {year && <p style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>{String(year)}</p>}
    </button>
  );
}

/** «Cine y series»: catálogos de los addons de Stremio que hayas instalado. */
export function LibraryPage() {
  const navigate = useNavigate();
  const all = useAddonsStore(s => s.addons);
  const addons = useMemo(() => all.filter(a => a.enabled), [all]);
  const progress = useProgressStore(s => s.items);
  const types = useMemo(() => {
    const t = new Set<string>();
    for (const a of addons) for (const c of a.manifest.catalogs ?? []) t.add(c.type);
    return [...t].sort((x, y) => (ORDER.indexOf(x) < 0 ? 99 : ORDER.indexOf(x)) - (ORDER.indexOf(y) < 0 ? 99 : ORDER.indexOf(y)));
  }, [addons]);
  const [tab, setTab] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ meta: MetaPreview; addon: Addon }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const current = tab && types.includes(tab) ? tab : types[0] ?? '';

  useEffect(() => {
    if (!current) { setRows([]); return; }
    let cancelled = false;
    const jobs: { key: string; title: string; addon: Addon; run: () => Promise<MetaPreview[]> }[] = [];
    for (const a of addons) for (const c of browsableCatalogs(a, current).slice(0, 5)) {
      const key = `${a.base}|${c.type}|${c.id}`;
      jobs.push({ key, title: `${c.name || c.id} · ${a.manifest.name}`, addon: a, run: async () => { const hit = cache.get(key); if (hit) return hit; const r = await fetchCatalog(a, c); cache.set(key, r); return r; } });
    }
    setRows(jobs.slice(0, 14).map(j => ({ key: j.key, title: j.title, items: [], loading: true })));
    jobs.slice(0, 14).forEach(j => {
      j.run().then(ms => { if (!cancelled) setRows(rs => rs.map(r => r.key === j.key ? { ...r, loading: false, items: ms.map(meta => ({ meta, addon: j.addon })) } : r)); })
        .catch(e => { if (!cancelled) setRows(rs => rs.map(r => r.key === j.key ? { ...r, loading: false, error: e instanceof Error ? e.message : String(e) } : r)); });
    });
    return () => { cancelled = true; };
  }, [current, addons]);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setFound(null); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchAddons(addons, text, current || undefined).then(r => { if (!cancelled) { setFound(r); setSearching(false); } }).catch(() => { if (!cancelled) { setFound([]); setSearching(false); } });
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, addons, current]);

  const resume = Object.values(progress).filter(p => p.dur > 0 && p.pos / p.dur < 0.95).sort((a, b) => b.at - a.at).slice(0, 12);
  const pill = (active: boolean) => ({ padding: '7px 16px', background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 100, color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: active ? 600 : 400, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 } as const);

  if (!addons.length) {
    return (
      <div className="fade-in page-pad flex flex-col items-center text-center" style={{ paddingTop: 64, gap: 14 }}>
        <Puzzle size={44} strokeWidth={1.2} style={{ color: 'var(--text-muted)' }} />
        <h1 className="font-display" style={{ fontSize: '2rem' }}>Cine y series</h1>
        <p style={{ maxWidth: 440, color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>Aquí aparecen los catálogos de los addons de Stremio que instales. TOPOTV no incluye ninguno: añade los tuyos pegando su dirección.</p>
        <button onClick={() => navigate('/settings')} style={{ minHeight: 44, padding: '0 22px', background: 'var(--accent-gradient)', color: '#080a0e', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer' }}>Instalar un addon</button>
      </div>
    );
  }

  return (
    <div className="fade-in page-pad" style={{ paddingBottom: 48 }}>
      <div className="flex items-center gap-3 mb-4"><Film size={22} strokeWidth={1.8} style={{ color: 'var(--accent)' }} /><h1 className="font-display" style={{ fontSize: 'clamp(2rem,4vw,3rem)', lineHeight: 1, letterSpacing: '0.06em' }}>Cine y series</h1></div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2" style={{ flex: '1 1 240px', padding: '8px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100 }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Buscar en ${current ? typeLabel(current).toLowerCase() : 'los addons'}`} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
          {searching && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-muted)' }} />}
        </div>
      </div>
      <div className="scroll-x mb-5">{types.map(t => <button key={t} onClick={() => { setTab(t); setQ(''); }} style={pill(current === t)}>{typeLabel(t)}</button>)}</div>

      {found ? (
        <section>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>{found.length} resultado{found.length === 1 ? '' : 's'} para «{q.trim()}»</p>
          {found.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Sin resultados.</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 16 }}>{found.map(f => <PosterCard key={`${f.meta.type}:${f.meta.id}`} meta={f.meta} addon={f.addon} width="100%" />)}</div>}
        </section>
      ) : (
        <>
          {resume.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <h2 className="section-heading" style={{ fontSize: '1.4rem', marginBottom: 12 }}>Seguir viendo</h2>
              <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                {resume.map(p => (
                  <button key={p.key} onClick={() => navigate(`/library/${encodeURIComponent(p.type)}/${encodeURIComponent(p.id)}?a=${encodeURIComponent(p.addon)}&resume=${encodeURIComponent(p.videoId)}`)} className="shrink-0 text-left" style={{ width: 200, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <div style={{ position: 'relative', width: 200, aspectRatio: '16 / 9', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                      {p.poster && <img src={p.poster} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />}
                      <span style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${Math.min(100, 100 * p.pos / p.dur)}%`, background: 'var(--accent)' }} />
                    </div>
                    <p style={{ fontSize: '0.74rem', fontWeight: 600, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</p>
                  </button>
                ))}
              </div>
            </section>
          )}
          {rows.map(r => (
            <section key={r.key} style={{ marginBottom: 28 }}>
              <h2 className="section-heading flex items-center gap-2" style={{ fontSize: '1.3rem', marginBottom: 12 }}>{r.title}{r.loading && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--text-muted)' }} />}</h2>
              {r.error && <p style={{ fontSize: '0.74rem', color: 'var(--offline-red)' }}>No se pudo cargar este catálogo: {r.error}</p>}
              <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                {r.items.map(i => <PosterCard key={`${i.meta.type}:${i.meta.id}`} meta={i.meta} addon={i.addon} />)}
              </div>
            </section>
          ))}
          {!rows.length && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Los addons instalados no tienen catálogos para {typeLabel(current).toLowerCase()}. <button onClick={() => navigate('/settings')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}>Gestionar addons <ChevronRight size={12} style={{ display: 'inline' }} /></button></p>}
        </>
      )}
    </div>
  );
}

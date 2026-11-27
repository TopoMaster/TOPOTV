import { useCallback, useEffect, useMemo, useState } from 'react';
import { Rss, RefreshCw, Plus, X, ExternalLink, Search, AlertCircle, Loader2 } from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { fetchFeed, type Feed } from '@/lib/rss';
import { Translated } from '@/components/shared/Translated';

const ago = (ms: number) => {
  if (!ms) return '';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return `hace ${Math.max(1, m)} min`;
  if (m < 0) return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  if (m < 48 * 60) return `hace ${Math.round(m / 60)} h`;
  return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

/** RSS: los feeds que añade el usuario (noticias, resúmenes, vídeos…). Cada entrada se abre en el navegador. */
export function FeedsPage() {
  const { rssFeeds, setRssFeeds } = useSettingsStore();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [inputErr, setInputErr] = useState('');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!rssFeeds.length) { setFeeds([]); return; }
    setLoading(true);
    setFeeds(await Promise.all(rssFeeds.map(fetchFeed)));
    setLoading(false);
  }, [rssFeeds]);
  useEffect(() => { void load(); }, [load]);

  const add = () => {
    const url = input.trim();
    try { if (!/^https?:$/.test(new URL(url).protocol)) throw new Error(); } catch { setInputErr('Pega la dirección completa del feed (empieza por http:// o https://).'); return; }
    if (rssFeeds.includes(url)) { setInputErr('Ese feed ya está añadido.'); return; }
    setRssFeeds([...rssFeeds, url]); setInput(''); setInputErr('');
  };
  const remove = (url: string) => { setRssFeeds(rssFeeds.filter(u => u !== url)); if (only === url) setOnly(null); };

  const items = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return feeds.flatMap(f => f.items)
      .filter(i => !only || i.feed === only)
      .filter(i => !words.length || words.every(w => `${i.title} ${i.summary}`.toLowerCase().includes(w)))
      .sort((a, b) => b.date - a.date || a.order - b.order);
  }, [feeds, q, only]);

  /* Feeds cuyas entradas apuntan todas a la misma página (una lista): se abre esa página saltando al título de la
     entrada y resaltándolo (fragmento de texto, función estándar de Chrome, Edge y Firefox) */
  const shared = useMemo(() => {
    const count = new Map<string, number>();
    for (const f of feeds) for (const i of f.items) count.set(`${f.url} ${i.link}`, (count.get(`${f.url} ${i.link}`) ?? 0) + 1);
    return count;
  }, [feeds]);
  const hrefOf = (i: (typeof items)[number]) => {
    if ((shared.get(`${i.feed} ${i.link}`) ?? 0) < 2 || i.link.includes('#')) return i.link;
    const t = i.title.replace(/\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\s*$/, '').trim();   // sin la fecha del final
    const enc = (s: string) => encodeURIComponent(s).replace(/-/g, '%2D').replace(/,/g, '%2C');
    return t ? `${i.link}#:~:text=${enc(t)}` : i.link;
  };

  const chip = (active: boolean) => ({ padding: '6px 12px', borderRadius: 100, fontSize: '0.74rem', cursor: 'pointer', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`, background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)', color: active ? 'var(--accent)' : 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 } as const);

  return (
    <div className="page-center" style={{ maxWidth: 900, padding: '24px 20px 80px' }}>
      <div className="flex items-center gap-3 mb-2">
        <Rss size={26} style={{ color: 'var(--accent)' }} />
        <h1 className="section-heading" style={{ flex: 1 }}>RSS</h1>
        <button onClick={() => void load()} disabled={loading || !rssFeeds.length} style={chip(false)} title="Volver a cargar">{loading ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <RefreshCw size={14} />}Actualizar</button>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>Añade los feeds RSS que quieras seguir (noticias, resúmenes, vídeos…): pega su dirección. TOPOTV no trae ninguno de serie. Cada entrada se abre en tu navegador.</p>

      <div className="flex gap-2 mb-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="https://…/rss.xml" aria-label="Dirección del feed"
          style={{ flex: 1, minWidth: 0, padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
        <button onClick={add} style={{ ...chip(true), borderRadius: 'var(--radius-md)', padding: '0 16px' }}><Plus size={15} />Añadir</button>
      </div>
      {inputErr && <p role="alert" style={{ fontSize: '0.74rem', color: 'var(--offline-red)', marginBottom: 8 }}>{inputErr}</p>}

      {feeds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <button style={chip(only === null)} onClick={() => setOnly(null)}>Todos</button>
          {feeds.map(f => (
            <span key={f.url} style={chip(only === f.url)}>
              <button onClick={() => setOnly(only === f.url ? null : f.url)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }} title={f.url}>
                {f.error && <AlertCircle size={12} style={{ color: 'var(--offline-red)' }} />}{f.title.slice(0, 40)} <span style={{ opacity: 0.6 }}>{f.items.length}</span>
              </button>
              <button onClick={() => remove(f.url)} aria-label={`Quitar ${f.title}`} title="Quitar este feed" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {feeds.filter(f => f.error).map(f => <p key={f.url} style={{ fontSize: '0.74rem', color: 'var(--offline-red)', marginBottom: 6 }}>«{f.title}» no responde ({f.error}). Si la web está bloqueada en tu conexión, prueba con una VPN.</p>)}

      {items.length > 0 && (
        <label className="flex items-center gap-2 mb-3" style={{ padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar (equipo, competición…)" aria-label="Buscar en los feeds" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.84rem' }} />
        </label>
      )}

      {!rssFeeds.length && <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem', padding: '40px 0' }}>Todavía no has añadido ningún feed.</p>}
      <div className="flex flex-col gap-2">
        {items.slice(0, 300).map(i => (
          <a key={i.id} href={hrefOf(i)} target="_blank" rel="noopener noreferrer" className="flex gap-3 channel-card" style={{ padding: 12, alignItems: 'center', textDecoration: 'none', color: 'inherit', flexDirection: 'row', justifyContent: 'flex-start' }}>
            {i.image && <img referrerPolicy="no-referrer" src={i.image} alt="" loading="lazy" style={{ width: 96, height: 54, objectFit: 'cover', borderRadius: 8, flexShrink: 0, background: 'var(--bg-elevated)' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: '0.86rem', lineHeight: 1.35 }}><Translated text={i.title} /></strong>
              {i.summary && i.summary !== i.title && <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 3 }}>{i.summary}</span>}
              <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>{i.feedTitle} · {ago(i.date)}</span>
            </span>
            <ExternalLink size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </a>
        ))}
      </div>
    </div>
  );
}

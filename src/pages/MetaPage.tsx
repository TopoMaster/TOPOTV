import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play, Loader2, ExternalLink, Magnet, X, Film, Subtitles } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useAddonsStore } from '@/store/useAddonsStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useProgressStore, progressKey } from '@/store/useProgressStore';
import { fetchMeta, fetchStreamsDetailed, type Addon, type Meta, type MetaPreview, type MetaVideo, type StreamOption } from '@/lib/stremio';
import { torrentAvailable } from '@/lib/torrent';
import type { Channel } from '@/types';

/** Ficha de una película o serie de un addon, con selector de episodios y de enlaces. */
export function MetaPage() {
  const { type = '', id = '' } = useParams();
  const [qs] = useSearchParams();
  const navigate = useNavigate();
  const preview = (useLocation().state as { preview?: MetaPreview } | null)?.preview;
  const all = useAddonsStore(s => s.addons);
  const addons = useMemo(() => all.filter(a => a.enabled), [all]);
  const progress = useProgressStore(s => s.items);
  const [data, setData] = useState<{ meta: Meta; addon: Addon } | null | undefined>(undefined);
  const [season, setSeason] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ videoId: string; title: string } | null>(null);
  const [options, setOptions] = useState<StreamOption[] | null>(null);
  const [streamInfo, setStreamInfo] = useState<{ failed: string[]; asked: number }>({ failed: [], asked: 0 });
  const [torrents, setTorrents] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(undefined);
    void fetchMeta(addons, type, id, qs.get('a') ?? undefined).then(r => {
      if (cancelled) return;
      // sin ficha completa se usa lo que ya sabemos del catálogo (suficiente para ver una película)
      const from = all.find(a => a.base === qs.get('a')) ?? all[0];
      setData(r ?? (preview && from ? { meta: { ...preview, type, id } as Meta, addon: from } : null));
    });
    void torrentAvailable().then(ok => { if (!cancelled) setTorrents(ok); });
    return () => { cancelled = true; };
  }, [type, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const meta = data?.meta;
  const videos = useMemo(() => (meta?.videos ?? []).filter(v => v.id), [meta]);
  const seasons = useMemo(() => [...new Set(videos.map(v => v.season ?? 0))].sort((a, b) => a - b), [videos]);
  const isSeries = type === 'series' || (videos.length > 1 && seasons.length > 0 && type !== 'movie' && type !== 'tv' && type !== 'channel');
  const activeSeason = season ?? seasons.find(s => s > 0) ?? seasons[0] ?? 0;
  const episodes = videos.filter(v => (v.season ?? 0) === activeSeason).sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0));
  const resumeId = qs.get('resume');

  function openPicker(videoId: string, title: string) {
    setPicker({ videoId, title }); setOptions(null);
    void fetchStreamsDetailed(addons, type, videoId).then(r => { setOptions(r.options); setStreamInfo({ failed: r.failed, asked: r.asked }); });
  }
  // «Seguir viendo» → abre directamente el selector del episodio que dejaste
  useEffect(() => { if (resumeId && meta && !picker) { const v = videos.find(x => x.id === resumeId); openPicker(resumeId, v ? epTitle(v) : meta.name); } }, [resumeId, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const epTitle = (v: MetaVideo) => `${meta?.name ?? ''} · ${v.season ? `T${v.season}` : ''}${v.episode ? `E${v.episode}` : ''} ${v.title ?? v.name ?? ''}`.trim();

  function play(chosen: StreamOption) {
    if (!picker || !meta || !data) return;
    const playable = (options ?? []).filter(o => o.stream && (o.kind === 'direct' || (o.kind === 'torrent' && torrents)));
    const ordered = [chosen, ...playable.filter(o => o !== chosen)].map(o => o.stream!);
    const channel: Channel = {
      id: `vod-${type}-${picker.videoId}`, tvgId: '', name: picker.title, rawName: picker.title, logo: meta.poster ?? '', group: 'Cine y series', streams: ordered,
      vod: { type, id, videoId: picker.videoId, addon: data.addon.base, poster: meta.poster, title: picker.title, subtitles: chosen.subtitles },
    };
    setPicker(null);
    void usePlayerStore.getState().play(channel, ordered[0]);
  }

  if (data === undefined) return <div className="flex items-center justify-center" style={{ minHeight: '50vh', color: 'var(--text-muted)' }}><Loader2 size={22} style={{ animation: 'spin 0.8s linear infinite' }} /></div>;
  if (!meta) return (
    <div className="fade-in page-pad text-center" style={{ paddingTop: 60 }}>
      <p style={{ color: 'var(--text-muted)' }}>No se pudo cargar la ficha (ningún addon activo la tiene).</p>
      <button onClick={() => navigate(-1)} style={{ marginTop: 14, background: 'none', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', padding: '8px 18px', cursor: 'pointer' }}>Volver</button>
    </div>
  );

  const year = meta.releaseInfo ?? meta.year;
  const pr = (vid: string) => progress[progressKey(type, vid)];
  return (
    <div className="fade-in" style={{ paddingBottom: 48 }}>
      <div style={{ position: 'relative', minHeight: 240, background: 'var(--bg-card)' }}>
        {meta.background && <img src={meta.background} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35 }} />}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 20%, var(--bg-void))' }} />
        <div className="page-pad" style={{ position: 'relative', paddingTop: 16 }}>
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-4" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.82rem', padding: 0 }}><ArrowLeft size={16} /> Volver</button>
          <div className="flex gap-4 flex-wrap items-end">
            <div style={{ width: 130, aspectRatio: '2 / 3', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {meta.poster ? <img src={meta.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Film size={32} style={{ color: 'var(--text-muted)' }} />}
            </div>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <h1 className="font-display" style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', lineHeight: 1.05 }}>{meta.name}</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '6px 0 10px' }}>{[year && String(year), meta.runtime, meta.imdbRating && `★ ${meta.imdbRating}`, (meta.genres ?? []).slice(0, 3).join(', ')].filter(Boolean).join(' · ')}</p>
              {!isSeries && (
                <button onClick={() => openPicker(id, meta.name)} className="flex items-center gap-2" style={{ minHeight: 44, padding: '0 24px', background: 'var(--accent-gradient)', color: '#080a0e', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer' }}>
                  <Play size={14} fill="#080a0e" strokeWidth={0} />{pr(id) ? 'Continuar' : 'Ver'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="page-pad">
        {meta.description && <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.65, maxWidth: 760, marginBottom: 14 }}>{meta.description}</p>}
        {(meta.cast?.length || meta.director?.length) ? <p style={{ color: 'var(--text-muted)', fontSize: '0.74rem', marginBottom: 18 }}>{meta.director?.length ? `Dirección: ${meta.director.join(', ')}. ` : ''}{meta.cast?.length ? `Reparto: ${meta.cast.slice(0, 8).join(', ')}.` : ''}</p> : null}

        {isSeries && videos.length > 0 && (
          <section>
            <div className="scroll-x mb-4">
              {seasons.map(s => <button key={s} onClick={() => setSeason(s)} style={{ padding: '7px 16px', background: s === activeSeason ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${s === activeSeason ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 100, color: s === activeSeason ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{s === 0 ? 'Especiales' : `Temporada ${s}`}</button>)}
            </div>
            <div className="flex flex-col gap-2">
              {episodes.map(v => {
                const p = pr(v.id);
                return (
                  <button key={v.id} onClick={() => openPicker(v.id, epTitle(v))} className="surface-card flex items-center gap-3 text-left" style={{ padding: '10px 14px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" style={{ width: 96, aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} /> : <span className="font-display" style={{ width: 40, fontSize: '1.3rem', color: 'var(--text-muted)' }}>{v.episode ?? '·'}</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.84rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.episode ? `${v.episode}. ` : ''}{v.title ?? v.name ?? v.id}</p>
                      {v.released && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{new Date(v.released).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}{p && p.dur > 0 ? ` · visto ${Math.round(100 * p.pos / p.dur)} %` : ''}</p>}
                    </div>
                    <Play size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {picker && createPortal(
        <div role="dialog" aria-label="Elegir enlace" className="fixed inset-0 flex items-end sm:items-center justify-center fade-in" style={{ background: 'rgba(0,0,0,0.7)', zIndex: 70 }} onClick={() => setPicker(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(640px, 100%)', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
            <div className="flex items-center gap-2" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ flex: 1, minWidth: 0 }}><p style={{ fontSize: '0.64rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Elige un enlace</p><p style={{ fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{picker.title}</p></div>
              <button onClick={() => setPicker(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: 12 }}>
              {options === null && <p className="flex items-center gap-2" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: 12 }}><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />Preguntando a los addons…</p>}
              {options?.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: 12, lineHeight: 1.6 }}>
                  {streamInfo.asked === 0
                    ? <>Ningún addon activo ofrece enlaces para este título. Carga un addon de enlaces en <button onClick={() => navigate('/settings')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>Ajustes → Addons</button>.</>
                    : <>Los addons de enlaces no han dado ningún enlace para este título.</>}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {options?.map(o => {
                  const blocked = o.kind === 'torrent' && !torrents;
                  return (
                    <div key={o.key} className="flex items-center gap-3" style={{ padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', opacity: blocked ? 0.55 : 1 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</p>
                        {o.detail && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.detail}</p>}
                        <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 2 }}>{o.addon}{o.kind === 'torrent' ? ' · torrent' : ''}{o.subtitles.length ? ` · ${o.subtitles.length} subtítulos` : ''}{blocked ? (Capacitor.isNativePlatform() ? ' · solo en Windows' : ' · motor de torrents no disponible') : ''}</p>
                      </div>
                      {o.kind === 'external'
                        ? <a href={o.externalUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1" style={{ minHeight: 36, padding: '0 14px', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', fontSize: '0.74rem', textDecoration: 'none' }}>Abrir <ExternalLink size={12} /></a>
                        : <button disabled={blocked} onClick={() => play(o)} className="flex items-center gap-1.5" style={{ minHeight: 36, padding: '0 16px', background: blocked ? 'var(--bg-elevated)' : 'var(--accent-gradient)', color: blocked ? 'var(--text-muted)' : '#080a0e', border: 'none', borderRadius: 100, fontWeight: 700, fontSize: '0.76rem', cursor: blocked ? 'not-allowed' : 'pointer' }}>{o.kind === 'torrent' ? <Magnet size={12} /> : o.subtitles.length ? <Subtitles size={12} /> : <Play size={12} fill="#080a0e" strokeWidth={0} />}Ver</button>}
                    </div>
                  );
                })}
              </div>
              {streamInfo.failed.length > 0 && (
                <p role="status" style={{ fontSize: '0.72rem', color: '#f59e0b', padding: '10px 4px 0', lineHeight: 1.5 }}>
                  No respondieron: {streamInfo.failed.join(', ')}. <button onClick={() => picker && openPicker(picker.videoId, picker.title)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}>Reintentar</button>
                </p>
              )}
              <p style={{ fontSize: '0.64rem', color: 'var(--text-muted)', lineHeight: 1.5, padding: '12px 4px 4px' }}>TOPOTV no incluye contenido ni addons: usa solo fuentes propias o autorizadas.</p>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

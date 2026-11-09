import { useEffect, useMemo, useState } from 'react';
import { Circle, CalendarDays, RefreshCw, Play, WifiOff, ListVideo, Search, ShieldCheck, Share2, Check, ExternalLink } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import { scheduleRecording } from '@/lib/recorder';
import { useRecorderStore } from '@/store/useRecorderStore';
import { createShareLink } from '@/lib/share';
import { useM3UStore } from '@/store/useM3UStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useCiriacoStore } from '@/store/useCiriacoStore';
import { LoadingState } from '@/components/shared/States';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { emoji, sportColor } from '@/lib/sports';
import { CIRIACO_SOURCE_URL, ELCANO_SOURCE_URL, eventDuration, eventProgress, eventStatus, eventToChannel, linkTag, sortLinks, todayIso, type CiriacoChannel, type CiriacoEvent, type CiriacoStatus } from '@/lib/ciriaco';

const ALL = 'all';

export { emoji };
export function updatedLabel(st: CiriacoStatus | null) {
  if (!st?.fetchedAt) return 'Sin datos todavía';
  const d = new Date(st.fetchedAt);
  const today = d.toDateString() === new Date().toDateString();
  const t = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `Actualizado ${today ? 'hoy' : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} ${t}${st.via ? ` · ${st.via === 'warp' ? 'vía WARP' : st.via}` : ''}`;
}

/** Botón + estado de la actualización diaria (WARP lo gestiona el servidor). */
export function UpdateControl() {
  const { status, updating, refresh } = useCiriacoStore();
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5" style={{ fontSize: '0.68rem', color: status?.lastError ? 'var(--offline-red)' : 'var(--text-muted)' }}>
        {updating && <ShieldCheck size={13} style={{ color: 'var(--accent)' }} />}
        {updating ? (status?.phase || 'Actualizando agenda…') : status?.lastError ? `Error: ${status.lastError}` : updatedLabel(status)}
      </span>
      <button onClick={refresh} disabled={updating} title="Actualizar la agenda ahora (conecta WARP solo mientras actualiza)"
        className="flex items-center gap-1.5"
        style={{ padding: '7px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: '100px', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: updating ? 'wait' : 'pointer' }}>
        <RefreshCw size={13} strokeWidth={1.8} style={{ animation: updating ? 'spin 0.8s linear infinite' : 'none' }} />Actualizar
      </button>
    </div>
  );
}

export function CiriacoAccessNotice() {
  const sourceLinkStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '6px 10px',
    border: '1px solid var(--border-mid)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-secondary)',
    fontSize: '0.72rem',
    textDecoration: 'none',
  } as const;

  return (
    <aside role="note" aria-label="Aviso de acceso a las fuentes de eventos"
      className="flex items-center justify-between flex-wrap gap-3"
      style={{ padding: '12px 16px', marginBottom: '14px', background: 'rgba(226,201,126,0.06)', border: '1px solid rgba(226,201,126,0.2)', borderRadius: 'var(--radius-lg)' }}>
      <div className="flex items-start gap-2">
        <WifiOff size={15} style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--accent)' }}>Aviso VPN:</strong> {Capacitor.isNativePlatform()
            ? 'Al actualizar, TOPOTV conecta su WARP integrado (solo para la app; la primera vez Android pide permiso de VPN) y lo apaga al terminar. Se puede desactivar en Ajustes.'
            : 'Al actualizar, TOPOTV conecta Cloudflare WARP automáticamente (Ciriaco lo necesita) y lo desconecta en cuanto termina, así la reproducción va siempre sin VPN.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <a href={CIRIACO_SOURCE_URL} target="_blank" rel="noopener noreferrer" style={sourceLinkStyle}>
          Ciriaco <ExternalLink size={12} />
        </a>
        <a href={ELCANO_SOURCE_URL} target="_blank" rel="noopener noreferrer" style={sourceLinkStyle}>
          Elcano <ExternalLink size={12} />
        </a>
      </div>
    </aside>
  );
}

export function EventRow({ ev, date, channels }: { ev: CiriacoEvent; date: string; channels: Record<string, CiriacoChannel> }) {
  const play = usePlayerStore(s => s.play);
  const backend = useSettingsStore(s => s.backendConfig);
  const [open, setOpen] = useState(false);
  const status = eventStatus(date, ev.time);
  const links = useMemo(() => sortLinks(ev.links), [ev]);
  const channel = useMemo(() => eventToChannel(ev, ev.links, backend), [ev, backend]);
  const [shared, setShared] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  // Grabación programada (solo app de Windows: el grabador local responde en el puerto 3007)
  const navigate = useNavigate();
  const recAvailable = useRecorderStore(s => s.available);
  const recordings = useRecorderStore(s => s.recordings);
  const refreshRec = useRecorderStore(s => s.refresh);
  const recKey = `${date} ${ev.time} ${ev.title}`;
  const existing = recordings.find(r => r.key === recKey && ['scheduled', 'recording', 'done'].includes(r.status));
  const [recOpen, setRecOpen] = useState(false);
  const [pre, setPre] = useState(5);
  const [dur, setDur] = useState(eventDuration(ev.sport) + 20);
  const [recMsg, setRecMsg] = useState<string | null>(null);
  const evStart = new Date(`${date}T${ev.time}:00`).getTime();
  const winStart = evStart - pre * 60000;
  const winEnd = evStart + dur * 60000;
  const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const scheduleIt = async () => {
    setRecMsg(null);
    try {
      await scheduleRecording({ title: ev.title || ev.competition, sport: ev.sport, key: recKey, start: winStart, end: winEnd, hashes: sortLinks(ev.links).map(l => l.hash), host: backend.host, port: backend.port });
      setRecOpen(false); await refreshRec();
    } catch (e) { setRecMsg(e instanceof Error ? e.message : String(e)); }
  };
  const share = async () => {
    setShared('busy');
    try {
      const url = await createShareLink(channel.streams[0].aceId, ev.title || ev.competition);
      try { await navigator.clipboard.writeText(url); } catch { window.prompt('Enlace para compartir:', url); }
      setShared('ok');
    } catch (e) { setShared('err'); window.alert('No se pudo crear el enlace: ' + (e instanceof Error ? e.message : e)); }
    setTimeout(() => setShared('idle'), 3000);
  };
  const live = status === 'live';

  return (
    <div className="surface-card" style={{ position: 'relative', overflow: 'hidden', borderColor: live ? 'rgba(255,77,77,0.35)' : undefined, padding: '12px 16px 12px 20px', opacity: status === 'finished' ? 0.5 : 1 }}>
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: sportColor(ev.sport), opacity: links.length ? 0.9 : 0.35 }} />
      {live && <span style={{ position: 'absolute', left: 4, right: 0, bottom: 0, height: 2, background: 'rgba(255,255,255,0.06)' }}><span style={{ display: 'block', height: '100%', width: `${eventProgress(date, ev.time, ev.sport) * 100}%`, background: 'var(--live-red)' }} /></span>}
      <div className="ev-main">
        <div style={{ minWidth: '52px', textAlign: 'center' }}>
          <div className="font-display" style={{ fontSize: '1.3rem', color: live ? 'var(--live-red)' : 'var(--text-primary)', lineHeight: 1 }}>{ev.time}</div>
          {live && <span style={{ fontSize: '0.55rem', color: 'var(--live-red)', fontWeight: 700, letterSpacing: '0.08em' }}>DIRECTO</span>}
          {status === 'soon' && <span style={{ fontSize: '0.55rem', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.08em' }}>EN BREVE</span>}
        </div>
        <span style={{ fontSize: '1.2rem' }}>{emoji(ev.sport)}</span>
        {ev.logos.length === 2 && (
          <div className="flex items-center" style={{ gap: 2, flexShrink: 0 }}>
            {ev.logos.map((src, i) => <img key={i} src={src} alt="" width={24} height={24} loading="lazy" style={{ objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />)}
          </div>
        )}
        <div className="ev-info">
          <p className="ev-title" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>{ev.title}</p>
          <p className="ev-sub" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            {ev.competition}{ev.round ? ` · ${ev.round}` : ''}
          </p>
        </div>
        <div className="ev-chans">
          {ev.channelKeys.slice(0, 4).map(k => <span key={k} title={channels[k]?.name}><ChannelLogo name={channels[k]?.name ?? k} src={channels[k]?.logo} size={26} /></span>)}
        </div>
        {links.length > 0 ? (
          <div className="ev-actions">
            <button onClick={() => play(channel, channel.streams[0])} className="flex items-center gap-1.5"
              style={{ padding: '8px 16px', background: 'var(--accent-gradient)', color: '#080a0e', border: 'none', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
              <Play size={13} strokeWidth={2.5} fill="#080a0e" />Ver
            </button>
            {recAvailable && (
              <button onClick={() => existing ? navigate('/recordings') : setRecOpen(o => !o)} title={existing ? 'Ver en Grabaciones' : 'Grabar este evento para verlo después'}
                style={{ padding: '8px 12px', background: existing ? 'rgba(255,77,77,0.12)' : recOpen ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${existing ? 'rgba(255,77,77,0.45)' : 'var(--border-mid)'}`, borderRadius: 'var(--radius-md)', color: existing ? 'var(--live-red)' : 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Circle size={10} fill="var(--live-red)" style={{ color: 'var(--live-red)' }} />
                {existing ? (existing.status === 'done' ? 'Grabado' : existing.status === 'recording' ? 'Grabando' : 'Programada') : 'Grabar'}
              </button>
            )}
            {!Capacitor.isNativePlatform() && <button onClick={share} title="Copiar enlace para ver en otro dispositivo (navegador)"
              style={{ padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-md)', color: shared === 'ok' ? 'var(--online-green)' : shared === 'err' ? 'var(--offline-red)' : 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              {shared === 'ok' ? <Check size={14} /> : shared === 'busy' ? <RefreshCw size={14} className="animate-spin" /> : <Share2 size={14} />}
            </button>}
            <button onClick={() => setOpen(o => !o)} title="Opciones de enlace"
              style={{ padding: '8px 10px', background: open ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 'var(--radius-md)', color: open ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.7rem', cursor: 'pointer', flexShrink: 0 }}>
              {links.length} {links.length === 1 ? 'enlace' : 'enlaces'}
            </button>
          </div>
        ) : <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>Sin enlaces</span>}
      </div>
      {recOpen && !existing && (
        <div className="fade-in ev-links" style={{ marginTop: 10, padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-md)' }}>
          <div className="flex flex-wrap items-end gap-3">
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Empezar antes (min)
              <input type="number" min={0} max={60} value={pre} onChange={e => setPre(Math.max(0, Math.min(60, Number(e.target.value) || 0)))} style={{ display: 'block', width: 84, marginTop: 4, padding: '8px 10px', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }} />
            </label>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Duración desde el inicio (min)
              <input type="number" min={10} max={420} value={dur} onChange={e => setDur(Math.max(10, Math.min(420, Number(e.target.value) || 10)))} style={{ display: 'block', width: 84, marginTop: 4, padding: '8px 10px', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)' }} />
            </label>
            <button onClick={scheduleIt} disabled={winEnd <= Date.now()} style={{ minHeight: 40, padding: '0 18px', background: 'var(--accent-gradient)', color: '#080a0e', border: 'none', borderRadius: 100, fontSize: '0.78rem', fontWeight: 700, cursor: winEnd <= Date.now() ? 'not-allowed' : 'pointer', opacity: winEnd <= Date.now() ? 0.5 : 1 }}>Programar grabación</button>
          </div>
          <p style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {winEnd <= Date.now() ? 'Este evento ya terminó.' : `Grabará de ${hhmm(winStart)} a ${hhmm(winEnd)} (la duración del evento es una estimación). ${Capacitor.isNativePlatform() ? 'El móvil debe estar encendido con el motor AceStream en marcha.' : 'El PC debe estar encendido con TOPOTV abierto.'}`}
          </p>
          {recMsg && <p role="alert" style={{ marginTop: 4, fontSize: '0.72rem', color: 'var(--offline-red)' }}>{recMsg}</p>}
        </div>
      )}
      {open && (
        <div className="flex flex-wrap gap-2 fade-in ev-links" style={{ marginTop: '10px' }}>
          {channel.streams.map((s, i) => (
            <button key={s.aceId} onClick={() => play(channel, s)} className="flex items-center gap-2"
              style={{ padding: '4px 12px 4px 5px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: '100px', color: 'var(--text-secondary)', fontSize: '0.7rem', cursor: 'pointer' }}>
              <ChannelLogo name={links[i].channel} src={channels[links[i].channelKey]?.logo} size={20} />
              {links[i].channel} · {linkTag(links[i])}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EventsPage() {
  const reloadSources = useM3UStore(s => s.reloadSources);
  const { data, online, loading, error, load } = useCiriacoStore();
  const [day, setDay] = useState<string>(todayIso());
  const [sport, setSport] = useState(ALL);
  const [query, setQuery] = useState('');
  const [onlyLinks, setOnlyLinks] = useState(false);

  useEffect(() => { if (!useCiriacoStore.getState().data) load(); }, [load]);
  useEffect(() => { if (data && day !== ALL && !data.days.some(d => d.date === day)) setDay(data.days[0]?.date ?? ALL); }, [data, day]);
  useEffect(() => { const i = setInterval(() => useCiriacoStore.setState(s => ({ data: s.data && { ...s.data } })), 60000); return () => clearInterval(i); }, []);

  const channels = data?.channels ?? {};
  const visibleDays = useMemo(() => (data?.days ?? []).filter(d => day === ALL || d.date === day), [data, day]);
  const sports = useMemo(() => [ALL, ...Array.from(new Set(visibleDays.flatMap(d => d.events.map(e => e.sport)).filter(Boolean)))], [visibleDays]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => visibleDays.map(d => ({
    ...d,
    events: d.events.filter(e =>
      (sport === ALL || e.sport === sport) && (!onlyLinks || e.links.length > 0) &&
      (!q || `${e.title} ${e.competition} ${e.channelKeys.map(k => channels[k]?.name ?? k).join(' ')}`.toLowerCase().includes(q))),
  })).filter(d => d.events.length), [visibleDays, sport, onlyLinks, q, channels]);
  const total = filtered.reduce((n, d) => n + d.events.length, 0);

  const pill = (active: boolean) => ({ padding: '7px 16px', background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: '100px', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: active ? 600 : 400, cursor: 'pointer' as const, whiteSpace: 'nowrap' as const, flexShrink: 0 });

  return (
    <div className="fade-in page-pad" style={{ paddingBottom: '48px', maxWidth: '1180px' }}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays size={22} strokeWidth={1.8} style={{ color: 'var(--accent)' }} />
          <h1 className="font-display" style={{ fontSize: 'clamp(2rem,4vw,3rem)', lineHeight: 1, letterSpacing: '0.06em' }}>Eventos</h1>
          {data && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{total} eventos</span>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <UpdateControl />
          <button onClick={() => reloadSources()} disabled={!data} title="Recargar la lista de canales fusionando Elcano y Ciriaco"
            className="flex items-center gap-1.5" style={{ ...pill(false), opacity: data ? 1 : 0.4 }}><ListVideo size={13} />Recargar canales</button>
        </div>
      </div>

      <CiriacoAccessNotice />

      {online === false && (
        <div style={{ padding: '20px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-lg)' }}>
          <div className="flex items-center gap-2 mb-2"><WifiOff size={14} style={{ color: 'var(--offline-red)' }} /><p style={{ color: 'var(--offline-red)', fontSize: '0.82rem', fontWeight: 600 }}>Servidor TOPOTV no disponible (puerto 3004)</p></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Reinicia la aplicación o ejecuta: <code style={{ color: 'var(--accent)' }}>node tools/ciriaco-server.cjs</code></p>
        </div>
      )}
      {error && <div style={{ padding: '14px 16px', marginBottom: '12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-lg)', color: 'var(--offline-red)', fontSize: '0.78rem' }}>{error}<br /><span style={{ color: 'var(--text-muted)' }}>Si la fuente de eventos está bloqueada en tu red, instala Cloudflare WARP: el servidor lo conecta solo durante la actualización.</span></div>}
      {loading && !data && <LoadingState message="Cargando la agenda de TOPOTV… la primera vez puede tardar hasta 1 minuto" />}

      {data && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button onClick={() => { setDay(ALL); setSport(ALL); }} style={pill(day === ALL)}>Todos los días</button>
            {data.days.map(d => <button key={d.date} onClick={() => { setDay(d.date); setSport(ALL); }} style={pill(day === d.date)}>{d.label} <span style={{ opacity: 0.6 }}>({d.events.length})</span></button>)}
          </div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2" style={{ flex: '1 1 220px', padding: '7px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: '100px' }}>
              <Search size={13} style={{ color: 'var(--text-muted)' }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar equipo, competición o canal"
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.78rem' }} />
            </div>
            <button onClick={() => setOnlyLinks(v => !v)} style={pill(onlyLinks)}>Solo con enlaces</button>
          </div>
          <div className="scroll-x mb-5">
            {sports.map(s => <button key={s} onClick={() => setSport(s)} style={pill(sport === s)}>{s === ALL ? 'Todos los deportes' : `${emoji(s)} ${s}`}</button>)}
          </div>
          <div className="flex flex-col gap-5">
            {filtered.map(d => (
              <section key={d.date}>
                {day === ALL && <h2 className="font-body" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, marginBottom: '8px' }}>{d.label}</h2>}
                <div className="flex flex-col gap-2">{d.events.map(e => <EventRow key={e.id} ev={e} date={d.date} channels={channels} />)}</div>
              </section>
            ))}
            {!total && <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}><p>No hay eventos con estos filtros</p></div>}
          </div>
        </>
      )}
    </div>
  );
}

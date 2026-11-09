import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Copy, ExternalLink, Tv, Check, Radio, Heart, Clock } from 'lucide-react';
import { useM3UStore } from '@/store/useM3UStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useEPGStore } from '@/store/useEPGStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { copyStreamUrl, streamPlayUrl } from '@/lib/aceApi';
import { useSettingsStore } from '@/store/useSettingsStore';
import { orderStreams, streamHealth, useHealthStore } from '@/store/useHealthStore';
import { getNowPlaying, getUpNext, getProgressPercent, formatTime, formatDuration } from '@/lib/epg';
import { ErrorState } from '@/components/shared/States';
import type { EPGSchedule, Stream } from '@/types';

// ─── Full-day EPG panel ───────────────────────────────────────────────────────
function EPGDayPanel({ schedule }: { schedule: EPGSchedule }) {
  const now = Date.now();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

  const events = schedule.events.filter(e =>
    e.endTime.getTime() > today.getTime() && e.startTime.getTime() < tomorrow.getTime()
  );
  if (events.length === 0) return null;

  const nowPlaying = getNowPlaying(schedule);
  const upNext = getUpNext(schedule);

  return (
    <div style={{ width: '260px', minWidth: '260px', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
        <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '2px' }}>Programación de hoy</p>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          {today.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>
      <div style={{ flex: 1 }}>
        {events.map(event => {
          const isNow  = event === nowPlaying;
          const isNext = event === upNext;
          const isPast = event.endTime.getTime() < now;
          const progress = isNow ? getProgressPercent(event) : 0;
          return (
            <div key={event.startTime.getTime()}
              style={{ padding: '9px 14px', borderLeft: `3px solid ${isNow ? 'var(--accent)' : isNext ? 'var(--border-mid)' : 'transparent'}`, background: isNow ? 'rgba(226,201,126,0.05)' : 'transparent', opacity: isPast ? 0.42 : 1, borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.62rem', color: isNow ? 'var(--accent)' : 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {formatTime(event.startTime)}
                {isNow && <span style={{ fontSize: '0.55rem', background: 'rgba(229,53,53,0.15)', color: 'var(--live-red)', padding: '1px 5px', borderRadius: '100px', border: '1px solid rgba(229,53,53,0.3)', fontWeight: 700 }}>AHORA</span>}
                {isNext && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>Siguiente</span>}
              </div>
              <p style={{ fontSize: '0.76rem', fontWeight: isNow ? 600 : 400, color: isNow ? 'var(--text-primary)' : 'var(--text-secondary)', lineHeight: 1.3, marginBottom: event.category ? '2px' : 0 }}>
                {event.title}
              </p>
              {event.category && <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{event.category} · {formatDuration(event.startTime, event.endTime)}</p>}
              {isNow && (
                <div style={{ height: '2px', background: 'var(--border-subtle)', borderRadius: '1px', marginTop: '6px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', transition: 'width 10s linear' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function ChannelPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const getChannel = useM3UStore(s => s.getChannel);
  const channel = getChannel(id ?? '');
  const { play, status, channel: playingChannel } = usePlayerStore();
  const backendConfig = useSettingsStore(s => s.backendConfig);
  const { toggle: toggleFav, isFavorite } = useFavoritesStore();
  const healthMap = useHealthStore(s => s.streams);
  const epgStatus = useEPGStore(s => s.status);
  const getScheduleForChannel = useEPGStore(s => s.getScheduleForChannel);
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [schedule, setSchedule] = useState<EPGSchedule | null>(null);

  // Fetch EPG on demand when page opens
  useEffect(() => {
    if (!channel || epgStatus !== 'ready') return;
    let cancelled = false;
    getScheduleForChannel(channel).then(s => {
      if (!cancelled) setSchedule(s);
    });
    return () => { cancelled = true; };
  }, [channel, epgStatus, getScheduleForChannel]);

  if (!channel) return <ErrorState message={`Canal "${id}" no encontrado.`} />;

  const streamsOrdered = orderStreams(channel.streams, healthMap);
  const activeStream = selectedStream ?? streamsOrdered[0];
  const isThisPlaying = playingChannel?.id === channel.id;
  const isFav = isFavorite(channel.id);
  const nowPlaying = getNowPlaying(schedule ?? undefined);
  const upNext = getUpNext(schedule ?? undefined);

  async function handlePlay(stream?: Stream) {
    await play(channel!, stream ?? activeStream ?? undefined);
  }

  async function handleCopy(stream: Stream) {
    await copyStreamUrl(stream, backendConfig);
    setCopiedId(stream.aceId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      {/* Main */}
      <div className="fade-in" style={{ flex: 1, overflowY: 'auto', padding: '24px', paddingBottom: '48px', minWidth: 0 }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-6"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.82rem', padding: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
          <ArrowLeft size={16} strokeWidth={2} /> Volver
        </button>

        {/* Hero */}
        <div className="flex items-center gap-5 p-5 mb-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-lg)', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {channel.logo && !imgError
              ? <img src={channel.logo} alt={channel.name} style={{ width: '75%', height: '75%', objectFit: 'contain' }} onError={() => setImgError(true)} />
              : <Tv size={32} strokeWidth={1} style={{ color: 'var(--text-muted)' }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="font-display" style={{ fontSize: 'clamp(1.3rem, 2.5vw, 2rem)', lineHeight: 1 }}>{channel.name}</h1>
              {isThisPlaying && (
                <span className="live-pulse flex items-center gap-1.5" style={{ fontSize: '0.62rem', color: 'var(--live-red)', letterSpacing: '0.08em', textTransform: 'uppercase', background: 'rgba(229,53,53,0.12)', padding: '3px 8px', borderRadius: '100px', border: '1px solid rgba(229,53,53,0.3)', flexShrink: 0 }}>
                  <Radio size={9} fill="currentColor" strokeWidth={0} /> En emisión
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', letterSpacing: '0.04em', marginBottom: '10px' }}>
              {channel.group} · {channel.streams.length} {channel.streams.length === 1 ? 'stream' : 'streams'}
            </p>

            {nowPlaying && (
              <div style={{ padding: '7px 10px', background: 'rgba(226,201,126,0.06)', border: '1px solid rgba(226,201,126,0.15)', borderRadius: 'var(--radius-md)', marginBottom: '10px' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--accent)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px' }}>
                  Ahora · {formatTime(nowPlaying.startTime)} – {formatTime(nowPlaying.endTime)}
                </div>
                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{nowPlaying.title}</p>
              </div>
            )}
            {upNext && !nowPlaying && (
              <div style={{ padding: '7px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', marginBottom: '10px' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '2px' }}>A continuación · {formatTime(upNext.startTime)}</div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{upNext.title}</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button onClick={() => handlePlay()} disabled={status === 'connecting'}
                className="flex items-center gap-2"
                style={{ padding: '9px 20px', background: 'var(--accent)', color: '#080a0e', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: status === 'connecting' ? 'not-allowed' : 'pointer', opacity: status === 'connecting' ? 0.7 : 1 }}>
                <Play size={13} fill="#080a0e" strokeWidth={0} />
                {status === 'connecting' && isThisPlaying ? 'Conectando...' : 'Reproducir'}
              </button>
              <button onClick={() => toggleFav(channel.id)}
                title={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', background: isFav ? 'rgba(226,201,126,0.12)' : 'var(--bg-elevated)', border: `1px solid ${isFav ? 'var(--accent)' : 'var(--border-mid)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Heart size={15} strokeWidth={1.8} fill={isFav ? 'var(--accent)' : 'none'} style={{ color: isFav ? 'var(--accent)' : 'var(--text-secondary)' }} />
              </button>
            </div>
          </div>
        </div>

        {/* Streams */}
        <h2 className="font-display mb-3" style={{ fontSize: '1.3rem', letterSpacing: '0.05em' }}>Streams disponibles</h2>
        <div className="flex flex-col gap-2 mb-6">
          {streamsOrdered.map((stream, i) => {
            const isSelected = stream.aceId === (activeStream?.aceId ?? streamsOrdered[0]?.aceId);
            const health = streamHealth(healthMap, stream);
            const isCopied = copiedId === stream.aceId;
            return (
              <div key={stream.aceId} onClick={() => setSelectedStream(stream)} className="slide-up"
                style={{ animationDelay: `${i * 0.03}s`, display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 13px', background: isSelected ? 'var(--bg-hover)' : 'var(--bg-card)', border: `1px solid ${isSelected ? 'var(--border-accent)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-mid)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'; } }}
                onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-subtle)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card)'; } }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: isSelected ? 'var(--accent)' : 'var(--border-mid)', flexShrink: 0, boxShadow: isSelected ? '0 0 5px var(--accent)' : 'none' }} />
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'DM Mono, monospace' }}>{stream.label}{health !== 'unknown' && <span style={{ marginLeft: 8, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: health === 'ok' ? 'var(--online-green)' : 'var(--offline-red)' }}>{health === 'ok' ? '● funciona' : '● caído'}</span>}</p>
                  <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '1px' }}>{streamPlayUrl(stream, backendConfig)}</p>
                </div>
                <span style={{ fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '2px 7px', borderRadius: '100px', border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                  {stream.provider}
                </span>
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => handleCopy(stream)} title="Copiar URL"
                    style={{ width: '28px', height: '28px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isCopied ? 'var(--online-green)' : 'var(--text-muted)' }}
                    onMouseEnter={e => { if (!isCopied) e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    onMouseLeave={e => { if (!isCopied) e.currentTarget.style.color = 'var(--text-muted)'; }}>
                    {isCopied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={1.8} />}
                  </button>
                  <button onClick={() => handlePlay(stream)} title="Reproducir este stream"
                    style={{ width: '28px', height: '28px', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                    <ExternalLink size={13} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2" style={{ opacity: 0.35 }}>
          <Clock size={11} strokeWidth={1.8} style={{ color: 'var(--text-muted)' }} />
          <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Canal añadido al historial al reproducir</p>
        </div>
      </div>

      {/* Right EPG panel */}
      {schedule && <EPGDayPanel schedule={schedule} />}
    </div>
  );
}

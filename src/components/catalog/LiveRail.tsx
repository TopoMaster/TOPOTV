import { useNavigate } from 'react-router-dom';
import { ChevronRight, Play } from 'lucide-react';
import { useCiriacoStore } from '@/store/useCiriacoStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { ChannelLogo } from '@/components/shared/ChannelLogo';
import { emoji, sportColor } from '@/lib/sports';
import { eventProgress, eventToChannel, liveAndNext } from '@/lib/ciriaco';

/** Carrusel "En directo y próximos" de la portada (datos de TOPOTV). */
export function LiveRail() {
  const navigate = useNavigate();
  const data = useCiriacoStore(s => s.data);
  const play = usePlayerStore(s => s.play);
  const backend = useSettingsStore(s => s.backendConfig);
  const items = liveAndNext(data);
  if (!data || !items.length) return null;
  const liveCount = items.filter(i => i.status === 'live').length;

  return (
    <section className="slide-up" style={{ margin: '24px 0 36px' }}>
      <div className="flex items-center justify-between px-6 mb-4">
        <div className="flex items-center gap-3">
          {liveCount > 0 && <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--live-red)', animation: 'livePulse 1.6s ease-in-out infinite' }} />}
          <h2 className="section-heading">{liveCount > 0 ? 'En directo ahora' : 'Próximos eventos'}</h2>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', alignSelf: 'flex-end', paddingBottom: 2 }}>{items.length}</span>
        </div>
        <button onClick={() => navigate('/events')} className="flex items-center gap-1" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>Agenda completa <ChevronRight size={14} strokeWidth={2} /></button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-3" style={{ paddingLeft: 24, paddingRight: 24, scrollbarWidth: 'none' }}>
        {items.map(({ ev, date, status }, i) => {
          const color = sportColor(ev.sport);
          const live = status === 'live';
          const ch = eventToChannel(ev, ev.links, backend);
          const keys = [...new Set(ev.links.map(l => l.channelKey))].slice(0, 3);
          return (
            <button key={ev.id} className="event-card shrink-0 fade-in" onClick={() => play(ch, ch.streams[0])} style={{ width: 300, height: 176, padding: 16, animationDelay: `${i * 0.04}s`, background: `radial-gradient(120% 120% at 100% 0%, ${color}38 0%, transparent 55%), linear-gradient(160deg, var(--bg-elevated), var(--bg-card))`, borderColor: live ? 'rgba(255,77,77,0.45)' : undefined }}>
              <span style={{ position: 'absolute', right: -6, top: -12, fontSize: '5.4rem', opacity: 0.16, lineHeight: 1, pointerEvents: 'none' }}>{emoji(ev.sport)}</span>
              <div className="flex items-center gap-2" style={{ fontSize: '0.64rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
                {live ? <span style={{ color: '#fff', background: 'var(--live-red)', padding: '2px 8px', borderRadius: 100 }}>● Directo</span>
                  : <span style={{ color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 100 }}>{status === 'soon' ? 'En breve' : ev.time}</span>}
                <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{live ? `desde ${ev.time}` : ev.sport}</span>
              </div>
              <p style={{ marginTop: 12, fontSize: '1.02rem', fontWeight: 700, lineHeight: 1.22, color: 'var(--text-primary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ev.title}</p>
              <p style={{ marginTop: 4, fontSize: '0.7rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.competition}</p>
              <div className="flex items-center justify-between" style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
                <div className="flex items-center" style={{ gap: 5 }}>{keys.map(k => <ChannelLogo key={k} name={data.channels[k]?.name ?? k} src={data.channels[k]?.logo} size={28} />)}</div>
                <span className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-gradient)', boxShadow: '0 6px 18px rgba(226,201,126,0.3)' }}><Play size={14} fill="#080a0e" color="#080a0e" strokeWidth={0} /></span>
              </div>
              {live && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: 'rgba(255,255,255,0.08)' }}><div style={{ width: `${eventProgress(date, ev.time, ev.sport) * 100}%`, height: '100%', background: 'var(--live-red)' }} /></div>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

import { useNavigate } from 'react-router-dom';
import { Star, ChevronRight } from 'lucide-react';
import { useCiriacoStore } from '@/store/useCiriacoStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { myEventsToday } from '@/lib/teams';
import { EventRow } from '@/pages/EventsPage';

/** Portada: hoy juegan tus equipos. Solo aparece si has marcado equipos y hay partido. */
export function TeamsToday() {
  const navigate = useNavigate();
  const data = useCiriacoStore(s => s.data);
  const teams = useSettingsStore(s => s.favTeams);
  const items = myEventsToday(data, teams);
  if (!data || !items.length) return null;
  return (
    <section className="slide-up" style={{ marginTop: 20, marginBottom: 12 }}>
      <div className="flex items-center justify-between px-6 mb-4">
        <div className="flex items-center gap-2">
          <Star size={16} strokeWidth={1.8} fill="var(--accent)" style={{ color: 'var(--accent)' }} />
          <h2 className="section-heading" style={{ fontSize: '1.5rem' }}>Hoy en tus equipos</h2>
        </div>
        <button onClick={() => navigate('/events')} className="flex items-center gap-1" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Agenda completa <ChevronRight size={14} strokeWidth={2} />
        </button>
      </div>
      <div className="flex flex-col gap-2 px-6">
        {items.slice(0, 5).map(({ ev, date }) => <EventRow key={ev.id} ev={ev} date={date} channels={data.channels} />)}
      </div>
    </section>
  );
}

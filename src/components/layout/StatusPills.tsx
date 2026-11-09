import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useCiriacoStore } from '@/store/useCiriacoStore';
import { useEPGStore } from '@/store/useEPGStore';

type Level = 'ok' | 'warn' | 'bad' | 'idle';
const COLOR: Record<Level, string> = { ok: 'var(--online-green)', warn: '#f59e0b', bad: 'var(--offline-red)', idle: 'var(--text-muted)' };

function Pill({ label, level, detail, to }: { label: string; level: Level; detail: string; to: string }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(to)} title={`${label}: ${detail}`} aria-label={`${label}: ${detail}`}
      className="flex items-center gap-1.5 status-pill"
      style={{ height: 28, padding: '0 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 100, color: 'var(--text-secondary)', fontSize: '0.68rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLOR[level], boxShadow: level === 'ok' ? `0 0 6px ${COLOR[level]}` : 'none', flexShrink: 0 }} />
      <span className="pill-label">{label}</span>
    </button>
  );
}

/** Semáforo de lo que hace funcionar la app: motor, agenda y guía (y WARP mientras está conectado). */
export function StatusPills() {
  const backend = useSettingsStore(s => s.backendStatus);
  const ciriacoStatus = useCiriacoStore(s => s.status);
  const ciriacoOnline = useCiriacoStore(s => s.online);
  const updating = useCiriacoStore(s => s.updating);
  const epg = useEPGStore(s => s.status);
  const native = Capacitor.isNativePlatform();

  const motor: Level = backend === 'online' ? 'ok' : backend === 'offline' ? 'bad' : 'idle';
  const motorText = backend === 'online' ? 'el motor AceStream responde' : backend === 'offline' ? 'el motor AceStream no responde: los canales de AceStream no se verán' : 'comprobando…';

  let agenda: Level = 'idle'; let agendaText = 'sin datos todavía';
  if (updating) { agenda = 'warn'; agendaText = ciriacoStatus?.phase || 'actualizando…'; }
  else if (!native && ciriacoOnline === false) { agenda = 'bad'; agendaText = 'el servicio de la agenda no responde'; }
  else if (ciriacoStatus?.lastError) { agenda = 'bad'; agendaText = ciriacoStatus.lastError; }
  else if (ciriacoStatus?.fetchedAt) { agenda = ciriacoStatus.fresh ? 'ok' : 'warn'; agendaText = ciriacoStatus.fresh ? 'actualizada hoy' : 'desactualizada: pulsa Actualizar en Eventos'; }

  const guia: Level = epg === 'ready' ? 'ok' : epg === 'error' ? 'bad' : epg === 'loading' || epg === 'parsing' ? 'warn' : 'idle';
  const guiaText = epg === 'ready' ? 'guía de programación cargada' : epg === 'error' ? 'la guía no se pudo cargar' : epg === 'loading' || epg === 'parsing' ? 'cargando…' : 'sin cargar';
  const warp = ciriacoStatus?.warp?.connected;

  return (
    <div className="flex items-center gap-2 status-pills">
      <Pill label="Motor" level={motor} detail={motorText} to="/settings" />
      <Pill label="Agenda" level={agenda} detail={agendaText} to="/events" />
      <Pill label="Guía" level={guia} detail={guiaText} to="/settings" />
      {warp && <Pill label="WARP" level="warn" detail="conectado solo mientras se actualiza" to="/events" />}
    </div>
  );
}

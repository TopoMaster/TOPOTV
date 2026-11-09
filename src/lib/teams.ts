import { norm } from '@/lib/text';
import type { CiriacoData, CiriacoEvent } from '@/lib/ciriaco';
import { eventStatus, todayIso } from '@/lib/ciriaco';

/** ¿Juega alguno de mis equipos (o aparece mi competición) en este evento? Sin tildes ni mayúsculas. */
export function isMyEvent(ev: CiriacoEvent, teams: string[]): boolean {
  if (!teams.length) return false;
  const text = norm(`${ev.title} ${ev.home} ${ev.away} ${ev.competition}`);
  return teams.some(t => { const n = norm(t); return n.length >= 2 && text.includes(n); });
}

/** Eventos de hoy (y mañana si ya no quedan) de mis equipos que no han terminado, con enlaces primero. */
export function myEventsToday(data: CiriacoData | null, teams: string[], now = new Date()): { ev: CiriacoEvent; date: string }[] {
  if (!data || !teams.length) return [];
  const today = todayIso(now);
  const out: { ev: CiriacoEvent; date: string }[] = [];
  for (const d of data.days) {
    if (d.date !== today) continue;
    for (const ev of d.events) if (isMyEvent(ev, teams) && eventStatus(d.date, ev.time, now) !== 'finished') out.push({ ev, date: d.date });
  }
  return out.sort((a, b) => a.ev.time.localeCompare(b.ev.time));
}

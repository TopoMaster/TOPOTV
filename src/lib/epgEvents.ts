/**
 * Cruce de la guía (EPG) con los eventos.
 *
 *  1. A cada evento de Ciriaco se le buscan los canales de tus listas que lo emiten: por el nombre del
 *     canal que da Ciriaco y por la guía (mismo partido a la misma hora).
 *  2. Los partidos que la guía marca en DIRECTO en tus canales y que Ciriaco no tiene se convierten en
 *     eventos nuevos («de la guía»), que se ven con el canal de tu lista.
 *
 * Solo funciones puras: los datos (guía de hoy por canal) los trae useGuideEventsStore.
 */
import type { Channel, EPGEvent } from '@/types';
import type { CiriacoData, CiriacoEvent } from '@/lib/ciriaco';

export interface GuideEvent extends CiriacoEvent { guide: true; channelIds: string[]; start: number; end: number }
export interface GuideCross {
  /** id de evento de Ciriaco → ids de canales de tus listas que lo emiten */
  related: Record<string, string[]>;
  /** fecha (AAAA-MM-DD) → eventos nuevos sacados de la guía */
  extra: Record<string, GuideEvent[]>;
}
export interface ChannelGuide { channel: Channel; events: EPGEvent[] }

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Palabras que no distinguen a un equipo («Real», «Club», «CF»…). */
const STOP = new Set(['club', 'real', 'union', 'deportivo', 'sporting', 'athletic', 'city', 'united', 'calcio', 'football', 'futbol', 'basket', 'baloncesto', 'women', 'femenino', 'the', 'and', 'del', 'los', 'las']);
function tokens(s: string): string[] {
  return strip(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length >= 4 && !STOP.has(t) && !/^\d+$/.test(t));
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Género del programa: <category> o la primera parte de la descripción («Deportes,Fútbol | 2026 | …»). */
export function genreOf(e: EPGEvent): string {
  return (e.category || (e.description || '').split(/[|\n·]/)[0] || '').trim();
}
const LIVE_RE = /\bdirecto\b|\ben vivo\b|\blive\b|\(d\)/i;
const NOT_A_MATCH_RE = /\b(previa|post ?partido|resumen|resumenes|tertulia|magac\w*|magazine|programa|sorteo|rueda de prensa|entrevista|reportaje|documental|highlights|repeticion|diferido|news|noticias|informativ\w*|lunchtime|raceday|stateside|talk|show)\b/i;
/** Deportes con nombre propio: sin equipos, solo cuentan si el género dice cuál es. */
const KNOWN_SPORT_RE = /futbol|football|soccer|baloncesto|basket|tenis|tennis|motor|formula|motociclismo|ciclismo|cycling|golf|balonmano|handball|rugby|atletismo|athletics|boxeo|boxing|natacion|voleibol|volleyball|hockey|esqui|biathlon|cricket|nfl|nba|padel/;
/** ¿Es la emisión en directo de una competición (no una previa, un resumen ni una repetición)? */
export function isLiveSport(e: EPGEvent): boolean {
  const g = strip(genreOf(e));
  if (!/deport|sport/.test(g) || /programa|informacion|informativo|documental|magac|talk|news/.test(g)) return false;
  const t = strip(e.title);
  if (!LIVE_RE.test(t) || NOT_A_MATCH_RE.test(t)) return false;
  const { home, away } = parseTitle(e.title);
  return !!(home && away) || KNOWN_SPORT_RE.test(g);
}
/** Nombres de deporte de guías en otros idiomas → los de Ciriaco (así llevan su icono y su color). */
const SPORT_NAMES: [RegExp, string][] = [
  [/american football|nfl|futbol americano/, 'Fútbol americano'], [/futsal|futbol sala/, 'Fútbol sala'],
  [/futbol|football|soccer|calcio|fussball/, 'Fútbol'], [/baloncesto|basket/, 'Baloncesto'], [/tenis|tennis/, 'Tenis'],
  [/formula|motor|motociclismo|automovilismo|racing|motorizados|motogp/, 'Motor'], [/ciclismo|cycling/, 'Ciclismo'],
  [/rugby/, 'Rugby'], [/golf/, 'Golf'], [/boxeo|boxing/, 'Boxeo'], [/hockey/, 'Hockey'], [/beisbol|baseball/, 'Béisbol'],
  [/esqui|ski|biathlon|invierno|winter/, 'Deportes de invierno'], [/hipica|horse|equitacion/, 'Hípica'], [/snooker/, 'Snooker'],
  [/balonmano|handball/, 'Balonmano'], [/voleibol|volleyball/, 'Voleibol'], [/atletismo|athletics/, 'Atletismo'], [/cricket/, 'Cricket'],
];
/** Deporte a partir del género («Deportes,Fútbol» → «Fútbol»). */
export function sportOf(e: EPGEvent): string {
  const g = strip(genreOf(e));
  return SPORT_NAMES.find(([re]) => re.test(g))?.[1] ?? 'Otros';
}

/**
 * «DIRECTO Jornada 5: Crystal Palace - Real Sociedad T26/27 · UEFA Europa League»
 *   → { round: 'Jornada 5', home: 'Crystal Palace', away: 'Real Sociedad', competition: 'UEFA Europa League' }
 */
const VS_RE = /\s+[-–]\s+|\s+vs?\.?\s+|\s+@\s+/i;
export function parseTitle(raw: string): { title: string; round: string; competition: string; home: string; away: string } {
  // fuera marcas de directo, fechas, temporadas («T26/27», «T2026», «T1»), episodios («E84») y paréntesis vacíos
  let s = raw.replace(new RegExp(LIVE_RE.source, 'gi'), ' ').replace(/^\s*:\s*/, '').replace(/\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/g, ' ')
    .replace(/\bT\d{2}\/\d{2}\b|\bT\d{1,4}\b|\bE\d{1,4}\b/g, ' ').replace(/\(\s*\)/g, ' ');
  const parts = s.split(/\s+·\s+/).map(p => p.replace(/\s+/g, ' ').replace(/^[\s:·-]+|[\s:·-]+$/g, '').trim()).filter(Boolean);
  // la competición suele ir en la parte sin «:» ni equipos
  let main = parts.find(p => VS_RE.test(p)) ?? parts[0] ?? '';
  const competition = parts.filter(p => p !== main).join(' · ');
  let round = '';
  const colon = main.indexOf(':');
  if (colon > 0) { round = main.slice(0, colon).trim(); main = main.slice(colon + 1).trim(); }
  s = main;
  const vs = s.split(VS_RE);
  const home = vs.length === 2 ? vs[0].trim() : '';
  const away = vs.length === 2 ? vs[1].trim() : '';
  return { title: home && away ? `${home} vs ${away}` : s, round, competition: competition || round, home, away };
}

/** Dos palabras valen como la misma si son iguales o una empieza por la otra («hearts»/«heart», «salzburgo»/«salzburg»). */
const near = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));
function teamIn(team: string, text: Set<string>): boolean {
  const t = tokens(team);
  if (!t.length) return false;
  for (const x of t) { if (text.has(x)) return true; for (const y of text) if (near(x, y)) return true; }
  return false;
}
interface Prog { channel: Channel; p: EPGEvent; start: number; text: Set<string> }
const progOf = (channel: Channel, p: EPGEvent): Prog => ({ channel, p, start: p.startTime.getTime(), text: new Set(tokens(`${p.title} ${p.description ?? ''}`.slice(0, 400))) });
/**
 * ¿Este programa de la guía es este evento? 2 = seguro (los dos equipos y su hora), 1 = probable
 * (un equipo a su hora), 0 = no. La emisión suele empezar antes (en guías inglesas, hasta 1 h).
 */
function matches(ev: CiriacoEvent, evStart: number, g: Prog): 0 | 1 | 2 {
  const diff = g.start - evStart;
  if (diff < -60 * 60000 || diff > 45 * 60000) return 0;
  if (ev.home && ev.away) {
    const n = (teamIn(ev.home, g.text) ? 1 : 0) + (teamIn(ev.away, g.text) ? 1 : 0);
    return n === 2 && diff <= 20 * 60000 ? 2 : n >= 1 ? 1 : 0;
  }
  // sin equipos (F1, ciclismo…): casi todas las palabras del título deben aparecer
  const t = tokens(ev.title || ev.competition);
  return t.length >= 2 && t.filter(x => g.text.has(x)).length >= Math.ceil(t.length * 0.75) && diff <= 20 * 60000 ? 2 : 0;
}
export function sameEvent(ev: CiriacoEvent, date: string, p: EPGEvent, channel = {} as Channel): boolean {
  return matches(ev, new Date(`${date}T${ev.time}:00`).getTime(), progOf(channel, p)) === 2;
}

export function crossGuide(data: CiriacoData | null, guides: ChannelGuide[], canonName: (s: string) => string, now = new Date()): GuideCross {
  const related: Record<string, string[]> = {};
  const extra: Record<string, GuideEvent[]> = {};
  const byCanon = new Map<string, Channel[]>();
  for (const { channel } of guides) {
    const k = canonName(channel.name);
    if (!k) continue;
    if (!byCanon.has(k)) byCanon.set(k, []);
    byCanon.get(k)!.push(channel);
  }
  const add = (evId: string, chId: string) => { const l = (related[evId] ??= []); if (!l.includes(chId)) l.push(chId); };

  // programas deportivos de la guía, preparados una sola vez y ordenados por hora
  const progs: Prog[] = [];
  for (const { channel, events } of guides)
    for (const p of events) if (/deport|sport/.test(strip(genreOf(p))) && !NOT_A_MATCH_RE.test(strip(p.title))) progs.push(progOf(channel, p));
  progs.sort((a, b) => a.start - b.start);

  // 1) eventos de Ciriaco → canales de tus listas (por nombre y por la guía)
  const used = new Set<EPGEvent>();
  for (const day of data?.days ?? []) {
    for (const ev of day.events) {
      const evStart = new Date(`${day.date}T${ev.time}:00`).getTime();
      const byName = new Set<string>();
      for (const key of ev.channelKeys) {
        const name = data?.channels[key]?.name ?? key;
        for (const ch of byCanon.get(canonName(name)) ?? []) { add(ev.id, ch.id); byName.add(ch.id); }
      }
      // un canal no emite dos cosas a la vez: el directo de ese canal a esa hora es este evento (no se duplica)
      for (const g of progs) {
        if (g.start > evStart + 45 * 60000) break;
        if (byName.has(g.channel.id) && g.start >= evStart - 60 * 60000 && isLiveSport(g.p)) used.add(g.p);
      }
      for (const g of progs) {
        if (g.start > evStart + 45 * 60000) break;
        const m = matches(ev, evStart, g);
        // seguro: el canal lo emite. Probable (un equipo, a su hora) y en directo: también, y no se duplica como nuevo
        if (m === 2 || (m === 1 && isLiveSport(g.p))) { add(ev.id, g.channel.id); used.add(g.p); }
      }
    }
  }

  // 2) directos de la guía que Ciriaco no tiene → eventos nuevos (agrupando el mismo partido en varios canales)
  const fresh: GuideEvent[] = [];
  for (const { channel, events } of guides) {
    for (const p of events) {
      if (used.has(p) || !isLiveSport(p) || p.endTime.getTime() < now.getTime()) continue;
      const t = parseTitle(p.title);
      const start = p.startTime.getTime();
      const same = fresh.find(f => Math.abs(f.start - start) <= 15 * 60000 && strip(f.title) === strip(t.title));
      if (same) { if (!same.channelIds.includes(channel.id)) same.channelIds.push(channel.id); continue; }
      fresh.push({
        guide: true, id: `guia-${start}-${tokens(t.title).join('-').slice(0, 60)}`,
        time: hhmm(p.startTime), sport: sportOf(p), competition: t.competition, round: t.competition === t.round ? '' : t.round, flag: '',
        title: t.title, home: t.home, away: t.away, logos: [], channelKeys: [], links: [],
        channelIds: [channel.id], start, end: p.endTime.getTime(),
      });
    }
  }
  for (const f of fresh.sort((a, b) => a.start - b.start)) (extra[iso(new Date(f.start))] ??= []).push(f);
  return { related, extra };
}

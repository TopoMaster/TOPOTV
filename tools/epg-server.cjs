/**
 * Servidor EPG (guía XMLTV) — puerto 3003, solo 127.0.0.1
 *   GET  /health
 *   GET  /status                      -> { status, progress, channels, error, lastUpdated }
 *   POST /load  {urls[], knownIds[]}  -> descarga y procesa las guías en segundo plano
 *   GET  /all/<id>                     -> toda la programación guardada de ese canal
 *   POST /coverage {ids[]}             -> {have[]}: cuáles tienen programación
 *   GET  /today/<canal>               -> { events, now, next } con la programación de hoy
 *   GET  /clear-cache
 *
 * Es el contrato que ya usa la app (src/lib/epg.ts). Procesa las guías con expresiones regulares
 * (sin DOM) para aguantar ficheros de decenas de MB; acepta .xml y .xml.gz.
 */
const http = require('http');
const { guard } = require('./guard.cjs');
const https = require('https');
const zlib = require('zlib');

const PORT = Number(process.env.EPG_PORT || 3003);
/** Clave de comparación: minúsculas, sin tildes y solo letras y números de cualquier alfabeto (también cirílico). */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
/** Igual que norm() pero sin la calidad del nombre: «DAZN_Baloncesto_720p_», «DAZN Baloncesto HD» → «daznbaloncesto». */
const loose = s => norm(String(s || '').replace(/[_.*-]+/g, ' ').replace(/\b(?:4k|uhd|fhd|hd|sd|hevc|h265|backup|multiaudio)\b|\b\d{3,4}p\b/gi, ' '));

let state = { status: 'idle', progress: 0, channels: 0, error: null, lastUpdated: null };
/* Cada canal de cada guía guarda SU programación («n|id», n = guía). Dos guías pueden tener canales con el mismo
   nombre («Eurosport 1» en la española y en la polaca): antes se mezclaban; ahora cada búsqueda elige uno solo,
   primero por identificador exacto (el tvg-id de la lista) y si no, por nombre. */
let chan = new Map();           // «n|id» -> eventos ordenados
let idOwners = new Map();       // clave del id -> [«n|id», …] (en el orden de las guías)
let nameOwners = new Map();     // clave de un nombre -> [«n|id», …]
const claim = (map, k, uid) => { if (!k) return; const a = map.get(k); if (!a) map.set(k, [uid]); else if (!a.includes(uid)) a.push(uid); };
function lookup(id) {
  for (const owners of [idOwners, nameOwners]) for (const k of [norm(id), loose(id)]) for (const uid of owners.get(k) || []) { const arr = chan.get(uid); if (arr && arr.length) return arr; }
  return null;
}
let running = false;
let log = console.log;

const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').trim();

/** "20261109203000 +0100" -> ms */
function xmltvTime(v) {
  const m = String(v || '').trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4}|Z)?/);
  if (!m) return NaN;
  const [, y, mo, d, h, mi, s = '00', tz = '+0000'] = m;
  const off = tz === 'Z' ? '+00:00' : `${tz.slice(0, 3)}:${tz.slice(3)}`;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${off}`).getTime();
}

function download(url, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('Demasiadas redirecciones'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'TOPOTV/1.0' }, timeout: 60000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).href, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} en ${url}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        try { if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf); } catch (e) { return reject(new Error('No se pudo descomprimir la guía: ' + e.message)); }
        resolve(buf.toString('utf8'));
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado descargando la guía')));
    req.on('error', reject);
  });
}

/** Lee una guía XMLTV: fichas de canal (id y nombres) y los programas de los canales pedidos que caen en la ventana. */
function parseGuide(xml, wantedList, from, to) {
  const wanted = new Set(wantedList);
  const names = new Map();   // id -> nombres
  for (const m of xml.matchAll(/<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/g)) {
    names.set(decode(m[1]), [...m[2].matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)].map(x => decode(x[1])));
  }
  const events = new Map();  // id -> programas
  let kept = 0;
  for (const m of xml.matchAll(/<programme\s+([^>]*)>([\s\S]*?)<\/programme>/g)) {
    const attrs = m[1];
    const id = decode((attrs.match(/channel="([^"]*)"/) || [])[1]);
    const start = xmltvTime((attrs.match(/start="([^"]*)"/) || [])[1]);
    const end = xmltvTime((attrs.match(/stop="([^"]*)"/) || [])[1]);
    if (!id || Number.isNaN(start) || Number.isNaN(end) || end < from || start > to) continue;
    const all = [id, ...(names.get(id) || [])];
    const keys = [...new Set([...all.map(norm), ...all.map(loose)].filter(Boolean))];
    if (wanted.size && !keys.some(k => wanted.has(k))) continue;
    const body = m[2];
    const pick = tag => { const x = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return x ? decode(x[1]) : ''; };
    const icon = (body.match(/<icon\s+src="([^"]*)"/) || [])[1];
    const ev = { channelId: id, title: pick('title'), description: pick('desc'), startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), category: pick('category') || undefined, poster: icon ? decode(icon) : undefined };
    const arr = events.get(id) || []; arr.push(ev); events.set(id, arr);
    kept++;
  }
  return { channels: [...names.entries()], events: [...events.entries()], kept };
}

/** Junta lo leído de la guía n.º gi en los mapas del servidor */
function mergeGuide(gi, r) {
  const known = new Set();
  for (const [id, list] of r.channels) {
    known.add(id);
    const uid = `${gi}|${id}`;
    claim(idOwners, norm(id), uid); claim(idOwners, loose(id), uid);
    for (const n of list) { claim(nameOwners, norm(n), uid); claim(nameOwners, loose(n), uid); }
  }
  for (const [id, evs] of r.events) {
    const uid = `${gi}|${id}`;
    if (!known.has(id)) claim(idOwners, norm(id), uid);   // programas de un canal sin ficha <channel>
    chan.set(uid, (chan.get(uid) || []).concat(evs));
  }
  return r.kept;
}

/* Descargar y leer una guía grande (decenas de MB) bloqueaba la app de Windows unos segundos: se hace en un hilo
   aparte. Su código va aquí mismo (no en otro archivo) porque dentro del instalador los archivos van empaquetados. */
const WORKER_SRC = `
const https = require('https'), http = require('http'), zlib = require('zlib');
const { parentPort, workerData } = require('worker_threads');
const norm = ${norm.toString()};
const loose = ${loose.toString()};
const decode = ${decode.toString()};
${xmltvTime.toString()}
${download.toString()}
${parseGuide.toString()}
download(workerData.url).then(xml => parentPort.postMessage({ ok: true, r: parseGuide(xml, workerData.wanted, workerData.from, workerData.to) }), e => parentPort.postMessage({ ok: false, error: e.message }));
`;
function guideInWorker(url, wanted, from, to) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new (require('worker_threads').Worker)(WORKER_SRC, { eval: true, workerData: { url, wanted, from, to } }); }
    catch (e) { return download(url).then(xml => resolve(parseGuide(xml, wanted, from, to)), reject); }   // sin hilos: como antes
    w.once('message', m => { void w.terminate(); if (m.ok) resolve(m.r); else reject(new Error(m.error)); });
    w.once('error', e => { void w.terminate(); reject(e); });
  });
}

async function load(urls, knownIds) {
  if (running) return;
  running = true;
  state = { status: 'loading', progress: 10, channels: 0, error: null, lastUpdated: null };
  try {
    chan = new Map(); idOwners = new Map(); nameOwners = new Map();
    const wanted = new Set((knownIds || []).flatMap(k => [norm(k), loose(k)]).filter(Boolean));
    const from = Date.now() - 6 * 3600e3, to = Date.now() + 36 * 3600e3;
    let ok = 0, lastErr = '';
    const list = [...new Set((urls || []).filter(u => /^https?:\/\//i.test(u)))];
    for (let i = 0; i < list.length; i++) {
      try {
        state.progress = 10 + Math.round(60 * i / list.length);
        const n = mergeGuide(i, await guideInWorker(list[i], [...wanted], from, to));
        log(`[epg] ${list[i].slice(0, 70)} -> ${n} programas`);
        ok++;
      } catch (e) { lastErr = e.message; log('[epg] error', lastErr); }
    }
    for (const arr of chan.values()) arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (!ok) throw new Error(lastErr || 'No se pudo cargar ninguna guía EPG');
    state = { status: 'ready', progress: 100, channels: chan.size, error: null, lastUpdated: new Date().toISOString() };
  } catch (e) {
    state = { status: 'error', progress: 0, channels: 0, error: e.message, lastUpdated: null };
  } finally { running = false; }
}

function today(id) {
  const arr = lookup(id);
  if (!arr || !arr.length) return null;
  const now = Date.now();
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const a = d0.getTime(), b = a + 86400e3;
  const events = arr.filter(e => new Date(e.endTime).getTime() > a && new Date(e.startTime).getTime() < b);
  const cur = events.find(e => new Date(e.startTime).getTime() <= now && new Date(e.endTime).getTime() > now) || null;
  const next = events.find(e => new Date(e.startTime).getTime() > now) || null;
  return { events, now: cur, next };
}

/** Toda la programación guardada de un canal (de 6 h antes a 36 h después de cargar la guía). */
function all(id) {
  const arr = lookup(id);
  return arr && arr.length ? arr : null;
}
/** De una lista de ids, cuáles tienen programación. */
const covered = ids => (Array.isArray(ids) ? ids : []).slice(0, 20000).filter(id => typeof id === 'string' && !!all(id));

function start(opts = {}) {
  log = opts.log || console.log;
  const server = http.createServer(async (req, res) => {
    if (!guard(req, res)) return;   // Host y Origin de la propia app (evita que una web mande cargar guías)
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const json = (code, obj) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.writeHead(code); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    try {
      if (u.pathname === '/health') return json(200, { ok: true });
      if (u.pathname === '/status') return json(200, state);
      if (u.pathname === '/clear-cache') { chan = new Map(); idOwners = new Map(); nameOwners = new Map(); state = { status: 'idle', progress: 0, channels: 0, error: null, lastUpdated: null }; return json(200, { ok: true }); }
      if (u.pathname === '/load' && req.method === 'POST') {
        let body = ''; for await (const c of req) { body += c; if (body.length > 2e6) break; }
        const d = JSON.parse(body || '{}');
        void load(d.urls, d.knownIds);
        return json(200, { ok: true });
      }
      if (u.pathname.startsWith('/all/')) {
        const r = all(decodeURIComponent(u.pathname.slice(5)));
        return r ? json(200, { events: r }) : json(404, { error: 'sin programación' });
      }
      if (u.pathname === '/coverage' && req.method === 'POST') {
        let body = ''; for await (const c of req) { body += c; if (body.length > 2e6) break; }
        return json(200, { have: covered(JSON.parse(body || '{}').ids) });
      }
      if (u.pathname.startsWith('/today/')) {
        const r = today(decodeURIComponent(u.pathname.slice(7)));
        return r ? json(200, r) : json(404, { error: 'sin programación' });
      }
      json(404, { error: 'not found' });
    } catch (e) { json(500, { error: e.message }); }
  });
  server.listen(PORT, '127.0.0.1', () => log(`[epg] http://localhost:${PORT}`));
  server.on('error', e => log('[epg] ERROR', e.message));
  return server;
}

module.exports = { start, parseGuide, norm, loose };
if (require.main === module) start();

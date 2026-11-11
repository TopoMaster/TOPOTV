/**
 * Servidor EPG (guía XMLTV) — puerto 3003, solo 127.0.0.1
 *   GET  /health
 *   GET  /status                      -> { status, progress, channels, error, lastUpdated }
 *   POST /load  {urls[], knownIds[]}  -> descarga y procesa las guías en segundo plano
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
const norm = s => String(s || '').toLowerCase().replace(/[\s._-]+/g, '').replace(/[^a-z0-9]/g, '');

let state = { status: 'idle', progress: 0, channels: 0, error: null, lastUpdated: null };
let store = new Map();          // clave normalizada -> eventos ordenados
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

function parseInto(xml, wanted, from, to) {
  const names = new Map();   // id -> nombres
  for (const m of xml.matchAll(/<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/g)) {
    const list = [...m[2].matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)].map(x => decode(x[1]));
    names.set(decode(m[1]), list);
  }
  let kept = 0;
  for (const m of xml.matchAll(/<programme\s+([^>]*)>([\s\S]*?)<\/programme>/g)) {
    const attrs = m[1];
    const id = decode((attrs.match(/channel="([^"]*)"/) || [])[1]);
    const start = xmltvTime((attrs.match(/start="([^"]*)"/) || [])[1]);
    const end = xmltvTime((attrs.match(/stop="([^"]*)"/) || [])[1]);
    if (!id || Number.isNaN(start) || Number.isNaN(end) || end < from || start > to) continue;
    const keys = [...new Set([norm(id), ...(names.get(id) || []).map(norm)].filter(Boolean))];
    if (wanted.size && !keys.some(k => wanted.has(k))) continue;
    const body = m[2];
    const pick = tag => { const x = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)); return x ? decode(x[1]) : ''; };
    const icon = (body.match(/<icon\s+src="([^"]*)"/) || [])[1];
    const ev = { channelId: id, title: pick('title'), description: pick('desc'), startTime: new Date(start).toISOString(), endTime: new Date(end).toISOString(), category: pick('category') || undefined, poster: icon ? decode(icon) : undefined };
    for (const k of keys) { const arr = store.get(k) || []; arr.push(ev); store.set(k, arr); }
    kept++;
  }
  return kept;
}

async function load(urls, knownIds) {
  if (running) return;
  running = true;
  state = { status: 'loading', progress: 10, channels: 0, error: null, lastUpdated: null };
  try {
    store = new Map();
    const wanted = new Set((knownIds || []).map(norm).filter(Boolean));
    const from = Date.now() - 6 * 3600e3, to = Date.now() + 36 * 3600e3;
    let ok = 0, lastErr = '';
    const list = [...new Set((urls || []).filter(u => /^https?:\/\//i.test(u)))];
    for (let i = 0; i < list.length; i++) {
      try {
        state.progress = 10 + Math.round(60 * i / list.length);
        const xml = await download(list[i]);
        state = { ...state, status: 'parsing', progress: 75 };
        const n = parseInto(xml, wanted, from, to);
        log(`[epg] ${list[i].slice(0, 70)} -> ${n} programas`);
        ok++;
      } catch (e) { lastErr = e.message; log('[epg] error', lastErr); }
    }
    for (const arr of store.values()) arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (!ok) throw new Error(lastErr || 'No se pudo cargar ninguna guía EPG');
    state = { status: 'ready', progress: 100, channels: store.size, error: null, lastUpdated: new Date().toISOString() };
  } catch (e) {
    state = { status: 'error', progress: 0, channels: 0, error: e.message, lastUpdated: null };
  } finally { running = false; }
}

function today(id) {
  const arr = store.get(norm(id));
  if (!arr || !arr.length) return null;
  const now = Date.now();
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const a = d0.getTime(), b = a + 86400e3;
  const events = arr.filter(e => new Date(e.endTime).getTime() > a && new Date(e.startTime).getTime() < b);
  const cur = events.find(e => new Date(e.startTime).getTime() <= now && new Date(e.endTime).getTime() > now) || null;
  const next = events.find(e => new Date(e.startTime).getTime() > now) || null;
  return { events, now: cur, next };
}

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
      if (u.pathname === '/clear-cache') { store = new Map(); state = { status: 'idle', progress: 0, channels: 0, error: null, lastUpdated: null }; return json(200, { ok: true }); }
      if (u.pathname === '/load' && req.method === 'POST') {
        let body = ''; for await (const c of req) { body += c; if (body.length > 2e6) break; }
        const d = JSON.parse(body || '{}');
        void load(d.urls, d.knownIds);
        return json(200, { ok: true });
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

module.exports = { start, parseInto, norm };
if (require.main === module) start();

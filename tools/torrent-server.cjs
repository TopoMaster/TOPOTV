/**
 * Motor de torrents de TOPOTV (Windows) — puerto 3009, solo 127.0.0.1. Usa peerflix (MIT, github.com/mafintosh/peerflix).
 *   GET  /health
 *   POST /start        {infoHash, fileIdx?, trackers?[]} -> {id, state, ...}  (empieza a buscar fuentes)
 *   GET  /status/<id>  -> {state: starting|ready|error, url, name, size, peers, downloaded, speed}
 *   POST /stop/<id>  ·  POST /stop-all
 * Sirve el archivo de vídeo del torrent por HTTP en un puerto local (con Range) para que lo abra VLC o el reproductor
 * integrado. Solo hay un torrent activo a la vez; se borra lo descargado al pararlo y se para solo tras 10 min sin uso.
 * TOPOTV no incluye ni recomienda contenido: reproduce lo que el usuario elija de sus propios addons.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.TORRENT_PORT || 3009);
const TRUSTED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):(5173|5174|4173)$/;
const HASH_RE = /^[0-9a-f]{40}$/i;
const TRACKER_RE = /^(udp|http|https|ws|wss):\/\/[^\s]{4,300}$/i;
const READY_TIMEOUT_MS = Number(process.env.TORRENT_READY_MS || 90000);
const IDLE_MS = 10 * 60 * 1000;

let DIR = path.join(os.tmpdir(), 'topotv-torrents');
let log = console.log;
const sessions = new Map();   // id -> { engine, state, url, name, size, error, started, lastUse, timers }

function loadPeerflix() {
  try { return require('peerflix'); } catch (e) { throw new Error('Falta el módulo peerflix (' + e.message + ')'); }
}

function pub(s) {
  const e = s.engine;
  let peers = 0, downloaded = 0, speed = 0;
  try { peers = e.swarm.wires.length; downloaded = e.swarm.downloaded; speed = e.swarm.downloadSpeed(); } catch { /* aún sin datos */ }
  return { id: s.id, state: s.state, url: s.state === 'ready' ? s.url : undefined, name: s.name, size: s.size, peers, downloaded, speed, error: s.error };
}

function stop(id) {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  clearTimeout(s.readyTimer); clearInterval(s.idleTimer);
  try { s.engine.remove(false, () => { try { s.engine.destroy(() => {}); } catch { /* ya cerrado */ } }); } catch { try { s.engine.destroy(() => {}); } catch { /* ya cerrado */ } }
  setTimeout(() => { try { fs.rmSync(s.dir, { recursive: true, force: true }); } catch { /* en uso */ } }, 2000);
  log('[torrent] parado', id);
}
const stopAll = () => { for (const id of [...sessions.keys()]) stop(id); };

function start(spec) {
  const infoHash = String(spec.infoHash || '').toLowerCase();
  if (!HASH_RE.test(infoHash)) throw new Error('infoHash no válido');
  const fileIdx = Number.isInteger(spec.fileIdx) && spec.fileIdx >= 0 && spec.fileIdx < 5000 ? spec.fileIdx : undefined;
  const id = `${infoHash}${fileIdx === undefined ? '' : '-' + fileIdx}`;
  const existing = sessions.get(id);
  if (existing) { existing.lastUse = Date.now(); return existing; }
  stopAll();   // un torrent activo a la vez

  const trackers = (Array.isArray(spec.trackers) ? spec.trackers : []).filter(t => typeof t === 'string' && TRACKER_RE.test(t)).slice(0, 30);
  const magnet = `magnet:?xt=urn:btih:${infoHash}${trackers.map(t => '&tr=' + encodeURIComponent(t)).join('')}`;
  const dir = path.join(DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const peerflix = loadPeerflix();
  const opts = { path: dir, connections: 60, hostname: '127.0.0.1' };
  if (fileIdx !== undefined) opts.index = fileIdx;
  const engine = peerflix(magnet, opts);
  const s = { id, engine, dir, state: 'starting', url: null, name: '', size: 0, error: '', started: Date.now(), lastUse: Date.now() };
  sessions.set(id, s);
  log('[torrent] iniciado', id);

  engine.on('ready', () => {
    try { s.name = engine.torrent.name; } catch { /* sin nombre */ }
    try { const f = engine.server.index || engine.files[0]; if (f) { s.size = f.length; s.name = f.name || s.name; } } catch { /* sin tamaño */ }
  });
  engine.server.once('listening', () => {
    s.url = `http://127.0.0.1:${engine.server.address().port}/`;
    s.state = 'ready'; clearTimeout(s.readyTimer);
    log('[torrent] listo', s.name, s.url);
  });
  engine.server.on('request', () => { s.lastUse = Date.now(); });
  engine.on('error', e => { s.state = 'error'; s.error = String(e && e.message || e); });
  s.readyTimer = setTimeout(() => { if (s.state === 'starting') { s.state = 'error'; s.error = 'No se encontraron fuentes para este torrent en 90 s.'; setTimeout(() => stop(id), 15000); } }, READY_TIMEOUT_MS);
  s.idleTimer = setInterval(() => { if (Date.now() - s.lastUse > IDLE_MS) stop(id); }, 60000);
  return s;
}

function begin(o = {}) {
  log = o.log || console.log;
  if (o.dir) DIR = o.dir;
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch { /* sin restos */ }   // restos de una ejecución anterior
  fs.mkdirSync(DIR, { recursive: true });
  const server = http.createServer(async (req, res) => {
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end(); }
    const origin = req.headers.origin || '';
    if (origin && !TRUSTED_ORIGIN.test(origin)) { res.writeHead(403); return res.end(); }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const json = (code, obj) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.writeHead(code); res.end(JSON.stringify(obj)); };
    const parts = new URL(req.url, 'http://x').pathname.split('/').filter(Boolean);
    try {
      if (parts[0] === 'health') return json(200, { ok: true, active: sessions.size });
      if (parts[0] === 'start' && req.method === 'POST') {
        let body = ''; for await (const c of req) { body += c; if (body.length > 20000) break; }
        return json(200, pub(start(JSON.parse(body || '{}'))));
      }
      if (parts[0] === 'status' && parts[1]) { const s = sessions.get(parts[1]); if (!s) return json(404, { error: 'No existe ese torrent.' }); s.lastUse = Date.now(); return json(200, pub(s)); }
      if (parts[0] === 'stop' && req.method === 'POST' && parts[1]) { stop(parts[1]); return json(200, { ok: true }); }
      if (parts[0] === 'stop-all' && req.method === 'POST') { stopAll(); return json(200, { ok: true }); }
      json(404, { error: 'not found' });
    } catch (e) { json(400, { error: e.message }); }
  });
  server.listen(PORT, '127.0.0.1', () => log(`[torrent] http://localhost:${PORT}`));
  server.on('error', e => log('[torrent] ERROR', e.message));
  process.on('exit', stopAll);
  return { stop: () => { stopAll(); server.close(); } };
}

module.exports = { start: begin, stopAll };
if (require.main === module) begin();

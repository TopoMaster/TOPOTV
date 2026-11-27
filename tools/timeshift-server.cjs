/**
 * Pausar y rebobinar el directo (timeshift) — puerto 3010, solo 127.0.0.1.
 *
 * Mientras ves un canal en el reproductor de TOPOTV, este servicio va guardando en una carpeta caché los trozos de
 * vídeo (HLS) que da el motor AceStream y le ofrece al reproductor una lista con todos los guardados: así se puede
 * pausar, volver atrás y saltar de nuevo al directo. Todo lo decide el usuario en Ajustes:
 *   - cuánto se guarda por canal (minutos) y cuánto puede ocupar la caché en total (GB);
 *   - si al cambiar de canal se conserva lo ya visto (al volver a ese canal se puede rebobinar hasta ahí) o se borra.
 * Solo se graba el canal que estás viendo. La caché se vacía al arrancar la app y cuando el usuario lo pide.
 *
 *   POST /start {src, channelId, name, minutes, gb, keep} → {id, playlist, startedAt}
 *   POST /stop {id}            → deja de grabar (y borra, si no se conserva lo visto)
 *   GET  /s/<id>/index.m3u8    → lista con todos los trozos guardados del canal (sigue creciendo mientras se graba)
 *   GET  /s/<id>/<n>.ts        → un trozo
 *   GET  /cache                → {dir, bytes, channels:[{channelId, name, seconds, bytes, recording}]}
 *   POST /cache/clear          → vacía la caché (salvo lo que se está viendo)
 *   POST /cache/open           → abre la carpeta en el Explorador
 *   GET  /health
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { guard } = require('./guard.cjs');

const PORT = Number(process.env.TIMESHIFT_PORT || 3010);
const IDLE_MS = 60000;            // sin peticiones del reproductor durante 1 min → deja de grabar
const ENGINE_RE = /^http:\/\/(127\.0\.0\.1|localhost):6878\//;

let log = console.log;
let baseDir = path.join(require('os').tmpdir(), 'topotv-timeshift');
const sessions = new Map();   // id → { id, channelId, name, src, dir, segs[], seq, lastSeqSeen, target, bytes, recording, timer, lastAccess, gapNext, error, ended }
let limits = { seconds: 2 * 3600, bytes: 5 * 1024 ** 3, keep: false };

function get(url, asBuffer = false, redirects = 4) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 30000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) { res.resume(); return resolve(get(new URL(res.headers.location, url).href, asBuffer, redirects - 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { const b = Buffer.concat(chunks); resolve({ body: asBuffer ? b : b.toString('utf8'), url }); });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('tiempo agotado')));
    req.on('error', reject);
  });
}

/** Trozos de una media playlist (si es una master playlist, se usa la primera variante) */
async function readPlaylist(src) {
  let { body, url } = await get(src);
  if (/#EXT-X-STREAM-INF/.test(body)) {
    const variant = body.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#'));
    if (!variant) throw new Error('lista sin variantes');
    ({ body, url } = await get(new URL(variant, url).href));
  }
  const seq0 = Number((body.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/) || [])[1] || 0);
  const target = Number((body.match(/#EXT-X-TARGETDURATION:(\d+)/) || [])[1] || 10);
  const segs = []; let dur = 0, n = seq0;
  for (const l of body.split('\n').map(x => x.trim())) {
    if (l.startsWith('#EXTINF:')) dur = parseFloat(l.slice(8)) || target;
    else if (l && !l.startsWith('#')) { segs.push({ n: n++, dur, uri: new URL(l, url).href }); dur = 0; }
  }
  return { segs, target, ended: /#EXT-X-ENDLIST/.test(body) };
}

const seconds = s => s.segs.reduce((a, x) => a + x.dur, 0);
function dropOldest(s) { const old = s.segs.shift(); if (!old) return; s.bytes -= old.bytes; fs.rm(old.file, { force: true }, () => {}); if (s.segs[0]) s.segs[0].gap = false; }
function deleteSession(s, reason) {
  clearTimeout(s.timer); s.recording = false;
  sessions.delete(s.id);
  fs.rm(s.dir, { recursive: true, force: true }, () => {});
  if (reason) log(`[timeshift] borrado «${s.name}» (${reason})`);
}
function stopRecording(s, reason) {
  if (!s || !s.recording) return;
  s.recording = false; clearTimeout(s.timer);
  log(`[timeshift] deja de grabar «${s.name}» (${reason}); ${Math.round(seconds(s) / 60)} min, ${(s.bytes / 1048576).toFixed(0)} MB`);
  if (!limits.keep) deleteSession(s);
}
/** Límites: por canal (minutos) y de toda la caché (GB). Primero se borra lo más antiguo de los canales que no se ven. */
function enforce() {
  for (const s of sessions.values()) while (s.segs.length > 3 && seconds(s) > limits.seconds) dropOldest(s);
  let total = [...sessions.values()].reduce((a, s) => a + s.bytes, 0);
  const order = [...sessions.values()].sort((a, b) => Number(a.recording) - Number(b.recording) || (a.segs[0]?.at ?? 0) - (b.segs[0]?.at ?? 0));
  for (const s of order) {
    while (total > limits.bytes && s.segs.length > (s.recording ? 3 : 0)) { const b = s.segs[0].bytes; dropOldest(s); total -= b; }
    if (!s.recording && !s.segs.length) deleteSession(s);
  }
}

async function poll(s) {
  if (!s.recording) return;
  if (Date.now() - s.lastAccess > IDLE_MS) return stopRecording(s, 'sin reproductor');
  try {
    const { segs, target, ended } = await readPlaylist(s.src);
    s.target = Math.max(s.target, target);
    if (s.lastSeqSeen === -Infinity && segs.length > 3) s.lastSeqSeen = segs[segs.length - 4].n;   // no se baja todo lo de atrás
    if (segs.length && segs[segs.length - 1].n < s.lastSeqSeen - 1000) s.lastSeqSeen = segs[0].n - 1;   // el motor reinició su lista
    for (const seg of segs) {
      if (seg.n <= s.lastSeqSeen || !s.recording) continue;
      const { body } = await get(seg.uri, true);
      if (!s.recording) return;
      const n = s.seq++;
      const file = path.join(s.dir, `${n}.ts`);
      await fs.promises.writeFile(file, body);
      s.segs.push({ n, dur: seg.dur || target, file, bytes: body.length, at: Date.now(), gap: s.gapNext });
      s.gapNext = false;
      s.bytes += body.length;
      s.lastSeqSeen = seg.n;
    }
    enforce();
    s.error = null;
    if (ended) s.ended = true;
  } catch (e) { s.error = e.message; }
  if (s.recording && !s.ended) s.timer = setTimeout(() => void poll(s), s.error ? 3000 : Math.max(1000, (s.target || 4) * 500));
}

function playlistText(s) {
  const target = Math.ceil(Math.max(s.target || 4, ...s.segs.map(x => x.dur)));
  const out = ['#EXTM3U', '#EXT-X-VERSION:3', `#EXT-X-TARGETDURATION:${target}`, `#EXT-X-MEDIA-SEQUENCE:${s.segs.length ? s.segs[0].n : 0}`];
  for (const x of s.segs) {
    if (x.gap) out.push('#EXT-X-DISCONTINUITY');   // aquí se dejó de ver el canal y se volvió más tarde
    out.push(`#EXT-X-PROGRAM-DATE-TIME:${new Date(x.at - x.dur * 1000).toISOString()}`, `#EXTINF:${x.dur.toFixed(3)},`, `${x.n}.ts`);
  }
  if (s.ended || !s.recording) out.push('#EXT-X-ENDLIST');
  return out.join('\n') + '\n';
}

function readBody(req) {
  return new Promise(resolve => { let d = ''; req.on('data', c => { d += c; if (d.length > 8192) req.destroy(); }); req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } }); });
}
const cacheInfo = () => ({ dir: baseDir, bytes: [...sessions.values()].reduce((a, s) => a + s.bytes, 0),
  channels: [...sessions.values()].map(s => ({ channelId: s.channelId, name: s.name, seconds: Math.round(seconds(s)), bytes: s.bytes, recording: s.recording })) });

function start({ log: logger, dir } = {}) {
  if (logger) log = logger;
  if (dir) baseDir = dir;
  fs.rmSync(baseDir, { recursive: true, force: true });   // la caché no sobrevive a cerrar la app
  fs.mkdirSync(baseDir, { recursive: true });
  const server = http.createServer(async (req, res) => {
    if (!guard(req, res)) return;
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const u = new URL(req.url, 'http://x');
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    try {
      if (u.pathname === '/health') return json(200, { ok: true });
      if (u.pathname === '/cache' && req.method === 'GET') return json(200, cacheInfo());
      if (u.pathname === '/cache/clear' && req.method === 'POST') { for (const s of [...sessions.values()]) if (!s.recording) deleteSession(s, 'vaciar caché'); return json(200, cacheInfo()); }
      if (u.pathname === '/cache/open' && req.method === 'POST') { require('child_process').spawn('explorer.exe', [baseDir], { detached: true, stdio: 'ignore' }).unref(); return json(200, { ok: true }); }

      if (u.pathname === '/start' && req.method === 'POST') {
        const b = await readBody(req);
        if (typeof b.src !== 'string' || !ENGINE_RE.test(b.src)) return json(400, { error: 'Solo se graba el vídeo del motor AceStream local.' });
        limits = {
          seconds: Math.min(Math.max(Number(b.minutes) || 120, 5), 12 * 60) * 60,
          bytes: Math.min(Math.max(Number(b.gb) || 5, 0.5), 200) * 1024 ** 3,
          keep: !!b.keep,
        };
        const channelId = typeof b.channelId === 'string' ? b.channelId.slice(0, 200) : '';
        for (const s of sessions.values()) if (s.recording) stopRecording(s, 'otro canal');
        // ¿ya tenías guardado algo de este canal? → se sigue en la misma lista (con un salto donde lo dejaste)
        let s = limits.keep && channelId ? [...sessions.values()].find(x => x.channelId === channelId) : null;
        if (s) { Object.assign(s, { src: b.src, recording: true, lastSeqSeen: -Infinity, gapNext: s.segs.length > 0, lastAccess: Date.now(), error: null, ended: false }); }
        else {
          const id = crypto.randomBytes(8).toString('hex');
          s = { id, channelId, name: String(b.name || channelId || 'canal').slice(0, 80), src: b.src, dir: path.join(baseDir, id), segs: [], seq: 0, lastSeqSeen: -Infinity, target: 4, bytes: 0, recording: true, timer: null, lastAccess: Date.now(), gapNext: false, error: null, ended: false };
          fs.mkdirSync(s.dir, { recursive: true });
          sessions.set(id, s);
        }
        const have = s.segs.length;
        void poll(s);
        for (let i = 0; i < 180 && s.segs.length < have + 2 && s.recording; i++) await new Promise(r => setTimeout(r, 500));   // hasta 90 s
        if (s.segs.length < have + 2) { const err = s.error; stopRecording(s, 'sin vídeo'); return json(504, { error: err || 'El canal no da vídeo todavía.' }); }
        return json(200, { id: s.id, playlist: `http://127.0.0.1:${PORT}/s/${s.id}/index.m3u8`, startedAt: s.segs[0].at - s.segs[0].dur * 1000 });
      }
      if (u.pathname === '/stop' && req.method === 'POST') {
        const { id } = await readBody(req);
        stopRecording(sessions.get(id), 'cerrado');
        return json(200, { ok: true });
      }

      const m = u.pathname.match(/^\/s\/([0-9a-f]{16})\/(index\.m3u8|(\d+)\.ts)$/);
      if (m) {
        const s = sessions.get(m[1]);
        if (!s) { res.writeHead(404); return res.end(); }
        s.lastAccess = Date.now();
        if (m[2] === 'index.m3u8') { res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' }); return res.end(playlistText(s)); }
        const seg = s.segs.find(x => x.n === Number(m[3]));
        if (!seg) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Length': seg.bytes, 'Cache-Control': 'no-cache' });
        return fs.createReadStream(seg.file).on('error', () => res.end()).pipe(res);
      }
      res.writeHead(404); res.end();
    } catch (e) { json(500, { error: e.message }); }
  });
  server.listen(PORT, '127.0.0.1', () => log(`[timeshift] :${PORT}`));
  return server;
}

module.exports = { start };
if (require.main === module) start();

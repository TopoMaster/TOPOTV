/**
 * Grabador de eventos — puerto 3007 (solo 127.0.0.1)
 *   GET    /health
 *   GET    /recordings                  -> lista (programadas, grabando y terminadas)
 *   POST   /recordings                  -> programa {title,sport,start,end,hashes[],host,port}
 *   POST   /recordings/<id>/cancel      -> cancela (si está grabando, la corta y conserva lo grabado)
 *   POST   /recordings/<id>/open        -> abre el archivo en VLC (o en el reproductor del sistema)
 *   DELETE /recordings/<id>             -> borra la entrada y el archivo
 *   POST   /recordings/open-folder      -> abre la carpeta de grabaciones
 *   GET    /file/<id>                   -> sirve el archivo (con Range) para verlo desde la app
 *
 * Graba el stream HTTP del motor AceStream (/ace/getstream?id=HASH) tal cual, en un .ts.
 * Si un enlace no da datos o se corta, prueba el siguiente mientras dure la ventana de grabación.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.RECORDER_PORT || 3007);
const TRUSTED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):(5173|5174|4173)$/;
const HASH_RE = /^[0-9a-f]{40}$/i;
const MAX_MS = 8 * 3600 * 1000;
const FIRST_DATA_MS = 60000;

let recs = [];
let FILE = path.join(__dirname, '.recordings.json');
let DIR = path.join(__dirname, 'recordings');
let log = console.log;
let opts = {};
const active = new Map();   // id -> { stop() }

const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(recs, null, 1)); } catch (e) { log('[rec] no se pudo guardar', e.message); } };
const load = () => { try { recs = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { recs = []; } };
const safeName = s => String(s || 'evento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 _-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'evento';
const stamp = ms => { const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`; };
const fileSize = f => { try { return fs.statSync(f).size; } catch { return 0; } };
const busy = () => { try { opts.onBusy && opts.onBusy(active.size > 0); } catch { /* sin bloqueo de suspensión */ } };
const pub = r => ({ id: r.id, key: r.key || '', title: r.title, sport: r.sport, start: r.start, end: r.end, status: r.status, file: r.file ? path.basename(r.file) : '', bytes: r.status === 'recording' && r.file ? fileSize(r.file) : r.bytes || 0, error: r.error || '', linkCount: r.hashes.length });

/** Una conexión al motor: resuelve con los bytes recibidos cuando termina, falla o se pide parar. */
function pullStream(rec, hash, ws, handle) {
  return new Promise(resolve => {
    let got = 0, finished = false, firstTimer = null;
    const done = () => { if (finished) return; finished = true; clearTimeout(firstTimer); resolve(got); };
    const req = http.get({ host: rec.host, port: rec.port, path: `/ace/getstream?id=${hash}` }, res => {
      if (res.statusCode !== 200) { res.resume(); return done(); }
      handle.res = res;
      res.on('data', chunk => { got += chunk.length; rec.bytes = (rec.bytes || 0) + chunk.length; ws.write(chunk); });
      res.on('end', done); res.on('error', done); res.on('close', done);
    });
    handle.req = req;
    req.on('error', done);
    firstTimer = setTimeout(() => { if (!got) { req.destroy(); done(); } }, FIRST_DATA_MS);
  });
}

async function runRecording(rec) {
  rec.status = 'recording'; rec.error = ''; rec.bytes = 0;
  fs.mkdirSync(DIR, { recursive: true });
  rec.file = path.join(DIR, `${safeName(rec.title)} ${stamp(rec.start)}.ts`);
  save();
  const handle = { stopped: false, byUser: false, req: null, res: null, stop(byUser = false) { handle.stopped = true; if (byUser) handle.byUser = true; try { handle.req && handle.req.destroy(); handle.res && handle.res.destroy(); } catch { /* ya cerrado */ } } };
  active.set(rec.id, handle); busy();
  const ws = fs.createWriteStream(rec.file, { flags: 'a' });
  const endTimer = setTimeout(() => handle.stop(), Math.max(0, rec.end - Date.now()));   // corta el stream al acabar la ventana
  try {
    if (opts.ensureEngine) { const r = await opts.ensureEngine(log); log('[rec] motor:', r); }
    let i = 0, emptyRounds = 0;
    while (!handle.stopped && Date.now() < rec.end) {
      const before = rec.bytes || 0;
      await pullStream(rec, rec.hashes[i % rec.hashes.length], ws, handle);
      if (handle.stopped || Date.now() >= rec.end) break;
      // sin datos → siguiente enlace; con datos que se cortaron → reintenta el mismo
      if ((rec.bytes || 0) === before) { i++; emptyRounds++; } else emptyRounds = 0;
      await new Promise(r => setTimeout(r, emptyRounds > rec.hashes.length ? 15000 : 3000));
    }
  } catch (e) { rec.error = e.message; }
  clearTimeout(endTimer);
  await new Promise(r => ws.end(r));
  active.delete(rec.id); busy();
  rec.bytes = fileSize(rec.file);
  if (rec.status === 'recording') {
    if (rec.bytes === 0 && handle.byUser) { rec.status = 'cancelled'; rec.file = ''; try { fs.unlinkSync(path.join(DIR, `${safeName(rec.title)} ${stamp(rec.start)}.ts`)); } catch { /* sin archivo */ } }
    else if (rec.bytes > 0) rec.status = 'done';
    else { rec.status = 'failed'; rec.error = rec.error || 'No llegaron datos del motor AceStream (¿está activo y el canal emite?).'; try { fs.unlinkSync(rec.file); } catch { /* sin archivo */ } rec.file = ''; }
  }
  log(`[rec] ${rec.title}: ${rec.status} (${rec.bytes} bytes)`);
  save();
}

function tick() {
  const now = Date.now();
  for (const r of recs) {
    if (r.status === 'scheduled') {
      if (now >= r.end) { r.status = 'missed'; r.error = 'La app estaba cerrada o apagada a la hora del evento.'; save(); }
      else if (now >= r.start && !active.has(r.id)) runRecording(r).catch(e => log('[rec] error', e.message));
    } else if (r.status === 'recording' && !active.has(r.id)) {
      r.status = r.bytes > 0 || fileSize(r.file) > 0 ? 'done' : 'failed'; save();   // quedó a medias por un cierre de la app
    }
  }
}

function serveFile(req, res, rec) {
  if (!rec || !rec.file || !fs.existsSync(rec.file)) { res.writeHead(404); return res.end(); }
  const size = fileSize(rec.file);
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  let start = 0, end = size - 1, code = 200;
  if (range) { if (range[1]) start = Number(range[1]); if (range[2]) end = Number(range[2]); if (!range[1] && range[2]) { start = size - Number(range[2]); end = size - 1; } code = 206; }
  if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
  const headers = { 'Content-Type': 'video/mp2t', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 };
  if (code === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  res.writeHead(code, headers);
  fs.createReadStream(rec.file, { start, end }).pipe(res);
}

function start(o = {}) {
  opts = o; log = o.log || console.log;
  if (o.file) FILE = o.file;
  if (o.dir) DIR = o.dir;
  load();
  const server = http.createServer(async (req, res) => {
    const hostOk = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
    if (!hostOk) { res.writeHead(403); return res.end(); }
    const origin = req.headers.origin || '';
    if (origin && !TRUSTED_ORIGIN.test(origin) && !req.url.startsWith('/file/')) { res.writeHead(403); return res.end(); }
    if (TRUSTED_ORIGIN.test(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const json = (code, obj) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.writeHead(code); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    const parts = u.pathname.split('/').filter(Boolean);
    try {
      if (parts[0] === 'file' && parts[1]) return serveFile(req, res, recs.find(r => r.id === parts[1]));
      if (parts[0] === 'health') return json(200, { ok: true, dir: DIR });
      if (parts[0] !== 'recordings') return json(404, { error: 'not found' });
      if (req.method === 'GET' && parts.length === 1) return json(200, { dir: DIR, recordings: [...recs].sort((a, b) => b.start - a.start).map(pub) });
      if (req.method === 'POST' && parts[1] === 'open-folder') { fs.mkdirSync(DIR, { recursive: true }); opts.openFolder && opts.openFolder(DIR); return json(200, { ok: true }); }
      if (req.method === 'POST' && parts.length === 1) {
        let body = ''; for await (const c of req) { body += c; if (body.length > 20000) break; }
        const d = JSON.parse(body || '{}');
        const hashes = (Array.isArray(d.hashes) ? d.hashes : []).filter(h => HASH_RE.test(h));
        const host = /^(127\.0\.0\.1|localhost)$/.test(d.host) ? d.host : '127.0.0.1';
        const port = Number(d.port) || 6878;
        if (!hashes.length) return json(400, { error: 'El evento no tiene enlaces válidos.' });
        if (!(d.end > d.start) || d.end <= Date.now()) return json(400, { error: 'La hora de fin debe ser futura.' });
        if (d.end - d.start > MAX_MS) return json(400, { error: 'Máximo 8 horas por grabación.' });
        const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: String(d.title || 'Evento').slice(0, 120), sport: String(d.sport || '').slice(0, 40), key: String(d.key || '').slice(0, 200), start: Number(d.start), end: Number(d.end), hashes, host, port, status: 'scheduled', file: '', bytes: 0, error: '', createdAt: Date.now() };
        recs.push(rec); save(); tick();
        setTimeout(tick, Math.min(2 ** 30, Math.max(0, rec.start - Date.now()) + 300));   // arranque puntual, sin esperar al sondeo
        return json(200, pub(rec));
      }
      const rec = recs.find(r => r.id === parts[1]);
      if (!rec) return json(404, { error: 'No existe esa grabación.' });
      if (req.method === 'POST' && parts[2] === 'cancel') {
        if (active.has(rec.id)) active.get(rec.id).stop(true);
        else if (rec.status === 'scheduled') { rec.status = 'cancelled'; save(); }
        return json(200, pub(rec));
      }
      if (req.method === 'POST' && parts[2] === 'open') {
        if (!rec.file || !fs.existsSync(rec.file)) return json(404, { error: 'El archivo ya no existe.' });
        opts.openFile && opts.openFile(rec.file);
        return json(200, { ok: true });
      }
      if (req.method === 'DELETE' && parts.length === 2) {
        if (active.has(rec.id)) active.get(rec.id).stop(true);
        if (rec.file) { try { fs.unlinkSync(rec.file); } catch { /* ya borrado */ } }
        recs = recs.filter(r => r.id !== rec.id); save();
        return json(200, { ok: true });
      }
      json(404, { error: 'not found' });
    } catch (e) { json(500, { error: e.message }); }
  });
  server.listen(PORT, '127.0.0.1', () => log(`[rec] http://localhost:${PORT} · carpeta ${DIR}`));
  server.on('error', e => log('[rec] ERROR', e.message));
  setInterval(tick, 5000); tick();
  return server;
}

module.exports = { start };
if (require.main === module) start();

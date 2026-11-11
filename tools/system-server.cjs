/**
 * Servicio del sistema de TOPOTV (Windows) — puerto 3008, solo 127.0.0.1
 *   GET  /health
 *   GET  /version
 *   GET  /update/check     -> mira la última release de GitHub y dice si hay versión nueva
 *   POST /update/install   -> descarga el instalador oficial y lo abre (la app se cierra para actualizarse)
 *   GET  /update/status    -> progreso de la descarga
 *   GET  /log?lines=200    -> últimas líneas del registro
 *   POST /log/open         -> muestra el archivo de registro en el explorador
 *   GET  /diagnostic       -> resumen para copiar y pasar cuando algo falla
 */
const http = require('http');
const { check: guardCheck } = require('./guard.cjs');
const https = require('https');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const path = require('path');

const PORT = Number(process.env.SYSTEM_PORT || 3008);
const TRUSTED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):(5173|5174|4173)$/;
const REPO = 'TopoMaster/TOPOTV';
const ASSET_RE = /^TOPOTV-Setup-\d+\.\d+\.\d+\.exe$/;
const DL_HOSTS = /(^|\.)(github\.com|githubusercontent\.com)$/;
const PORTS = { web: 5174, agenda: 3004, guia: 3003, vlc: 3002, grabador: 3007, compartir: 3005 };

let opts = {};
let log = console.log;
const up = { phase: 'idle', percent: 0, error: '', file: '' };

const semver = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
function isNewer(a, b) { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'TOPOTV-updater', Accept: 'application/vnd.github+json' }, timeout: 12000 }, res => {
      let body = '';
      res.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
      res.on('end', () => { if (res.statusCode !== 200) return reject(new Error(`GitHub respondió ${res.statusCode}`)); try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('Sin respuesta de GitHub')));
    req.on('error', reject);
  });
}

async function checkUpdate() {
  const rel = await getJson(`https://api.github.com/repos/${REPO}/releases/latest`);
  const latest = String(rel.tag_name || '').replace(/^v/, '');
  const asset = (rel.assets || []).find(a => ASSET_RE.test(a.name));
  return { current: opts.version, latest, newer: !!latest && isNewer(latest, opts.version) && !!asset, asset: asset ? { name: asset.name, size: asset.size, url: asset.browser_download_url, sha256: /^sha256:([0-9a-f]{64})$/i.test(asset.digest || '') ? asset.digest.slice(7).toLowerCase() : '' } : null, page: rel.html_url || '', notes: String(rel.body || '').slice(0, 1500) };
}

function download(url, dest, size, sha256, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 6) return reject(new Error('Demasiadas redirecciones'));
    const u = new URL(url);
    if (u.protocol !== 'https:' || !DL_HOSTS.test(u.hostname)) return reject(new Error('Origen de descarga no permitido'));
    https.get(url, { headers: { 'User-Agent': 'TOPOTV-updater' } }, res => {
      if (Math.floor(res.statusCode / 100) === 3 && res.headers.location) { res.resume(); return resolve(download(new URL(res.headers.location, url).toString(), dest, size, sha256, hops + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`La descarga falló (${res.statusCode})`)); }
      const total = Number(res.headers['content-length']) || size || 0;
      let got = 0;
      const hash = crypto.createHash('sha256');
      const ws = fs.createWriteStream(dest);
      res.on('data', c => { got += c.length; hash.update(c); if (total) up.percent = Math.round(100 * got / total); });
      res.pipe(ws);
      ws.on('finish', () => ws.close(() => {
        if (size && got !== size) return reject(new Error('El archivo descargado está incompleto'));
        if (sha256 && hash.digest('hex') !== sha256) return reject(new Error('La huella del archivo no coincide con la publicada en GitHub: descarga cancelada'));
        resolve(got);
      }));
      ws.on('error', reject); res.on('error', reject);
    }).on('error', reject);
  });
}

async function install() {
  if (up.phase === 'downloading') return;
  Object.assign(up, { phase: 'downloading', percent: 0, error: '', file: '' });
  try {
    const info = await checkUpdate();
    if (!info.newer) throw new Error('Ya tienes la última versión.');
    const dir = path.join(os.tmpdir(), 'topotv-update');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, info.asset.name);
    await download(info.asset.url, file, info.asset.size, info.asset.sha256);
    if (!info.asset.size) throw new Error('GitHub no indicó el tamaño del instalador');
    up.phase = 'ready'; up.percent = 100; up.file = file;
    log('[sys] instalador descargado', file);
    opts.runInstaller && opts.runInstaller(file);
  } catch (e) { up.phase = 'error'; up.error = e.message; log('[sys] actualización falló:', e.message); }
}

function tailLog(n) {
  try {
    const lines = fs.readFileSync(opts.logFile, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.slice(-Math.max(1, Math.min(2000, n))).join('\n');
  } catch { return ''; }
}

function probePort(port) {
  return new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, res => { res.resume(); resolve(true); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function diagnostic() {
  const ports = {};
  await Promise.all(Object.entries(PORTS).map(async ([k, p]) => { ports[k] = (await probePort(p)) ? 'responde' : 'NO responde'; }));
  let motor = 'sin comprobar';
  try { motor = await new Promise(resolve => { const r = http.get({ host: '127.0.0.1', port: 6878, path: '/webui/api/service?method=get_version', timeout: 2000 }, res => { res.resume(); resolve(res.statusCode === 200 ? 'responde' : `HTTP ${res.statusCode}`); }); r.on('timeout', () => { r.destroy(); resolve('NO responde'); }); r.on('error', () => resolve('NO responde')); }); } catch { /* sin motor */ }
  return [
    `TOPOTV ${opts.version} · ${os.type()} ${os.release()} · ${os.arch()} · RAM libre ${(os.freemem() / 1e9).toFixed(1)} GB`,
    `Electron ${process.versions.electron || '-'} · Chromium ${process.versions.chrome || '-'} · Node ${process.versions.node}`,
    `Motor AceStream (6878): ${motor}`,
    ...Object.entries(ports).map(([k, v]) => `Servicio ${k} (${PORTS[k]}): ${v}`),
    '--- últimas líneas del registro ---',
    tailLog(60),
  ].join('\n');
}

function start(o = {}) {
  opts = o; log = o.log || console.log;
  const server = http.createServer(async (req, res) => {
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end(); }
    const origin = req.headers.origin || '';
    if (origin && !TRUSTED_ORIGIN.test(origin)) { res.writeHead(403); return res.end(); }
    if (guardCheck(req)) { res.writeHead(403); return res.end(); }   // petición de otra web sin Origin
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const json = (code, obj) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.writeHead(code); res.end(JSON.stringify(obj)); };
    const text = (code, s) => { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.writeHead(code); res.end(s); };
    const u = new URL(req.url, 'http://x');
    try {
      if (u.pathname === '/health') return json(200, { ok: true });
      if (u.pathname === '/version') return json(200, { version: opts.version });
      if (u.pathname === '/update/check') return json(200, await checkUpdate());
      if (u.pathname === '/update/status') return json(200, up);
      if (u.pathname === '/update/install' && req.method === 'POST') { void install(); return json(200, up); }
      if (u.pathname === '/log') return text(200, tailLog(Number(u.searchParams.get('lines')) || 200));
      if (u.pathname === '/log/open' && req.method === 'POST') { opts.openLog && opts.openLog(); return json(200, { ok: true }); }
      if (u.pathname === '/diagnostic') return text(200, await diagnostic());
      json(404, { error: 'not found' });
    } catch (e) { json(500, { error: e.message }); }
  });
  server.listen(PORT, '127.0.0.1', () => log(`[sys] http://localhost:${PORT}`));
  server.on('error', e => log('[sys] ERROR', e.message));
  return server;
}

module.exports = { start, isNewer };
if (require.main === module) start({ version: '0.0.0', logFile: '' });

/**
 * VLC Helper — puerto 3002
 *   GET /health
 *   GET /open?url=<streamUrl>[&direct=1] -> lanza VLC con la URL del motor local (o una emisión http/https directa)
 *   GET /engine/start | /engine/stop -> enciende / apaga el motor AceStream
 *   GET /deps                   -> estado de VLC, WARP y AceStream (para la pantalla de Ajustes)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const PORT = Number(process.env.VLC_HELPER_PORT || 3002);

function findVlc() {
  const c = [process.env.VLC_PATH,
    'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
    process.env.LOCALAPPDATA && process.env.LOCALAPPDATA + '\\Programs\\VideoLAN\\VLC\\vlc.exe',
    '/Applications/VLC.app/Contents/MacOS/VLC', '/usr/bin/vlc'].filter(Boolean);
  for (const p of c) if (fs.existsSync(p)) return p;
  if (process.platform === 'win32') {
    for (const key of ['HKLM\\SOFTWARE\\VideoLAN\\VLC', 'HKLM\\SOFTWARE\\WOW6432Node\\VideoLAN\\VLC']) {
      try {
        const out = execFileSync('reg', ['query', key, '/ve'], { encoding: 'utf8', windowsHide: true });
        const m = out.match(/REG_SZ\s+(.+)/);
        if (m && fs.existsSync(m[1].trim())) return m[1].trim();
      } catch { /* siguiente */ }
    }
  }
  return null;
}
function findWarp() {
  return ['C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe', 'C:\\Program Files (x86)\\Cloudflare\\Cloudflare WARP\\warp-cli.exe'].find(p => fs.existsSync(p)) || null;
}
/** Carpeta del motor AceStream (Windows): registro HKCU\\Software\\ACEStream\\InstallDir o %APPDATA%\\ACEStream\\engine */
function aceEngineDir() {
  const dirs = [];
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('reg', ['query', 'HKCU\\Software\\ACEStream', '/v', 'InstallDir'], { encoding: 'utf8', windowsHide: true });
      const m = out.match(/InstallDir\s+REG_\w+\s+(.+)/);
      if (m) dirs.push(m[1].trim(), path.join(m[1].trim(), 'engine'));
    } catch { /* sin clave */ }
  }
  for (const r of [process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean)) dirs.push(path.join(r, 'ACEStream', 'engine'), path.join(r, 'ACEStream'));
  dirs.push('C:\\Program Files\\ACEStream\\engine', 'C:\\Program Files (x86)\\ACEStream\\engine');
  return dirs.find(d => fs.existsSync(path.join(d, 'ace_console.exe')) || fs.existsSync(path.join(d, 'ace_engine.exe'))) || null;
}
/** Ejecutable del motor: ace_console.exe --client-console (modo consola, sin icono) o ace_engine.exe (modo GUI). */
function findAceEngine() {
  const d = aceEngineDir();
  if (!d) return null;
  const con = path.join(d, 'ace_console.exe');
  return fs.existsSync(con) ? con : path.join(d, 'ace_engine.exe');
}
function engineOnline(host = '127.0.0.1', port = 6878) {
  return new Promise(resolve => {
    const req = http.get({ host, port, path: '/webui/api/service?method=get_version', timeout: 2500 }, res => { res.resume(); resolve(res.statusCode < 500); });
    req.on('error', () => resolve(false)); req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}
/** Apaga el motor AceStream (cierra sus procesos). */
function stopEngine() {
  const names = process.platform === 'win32' ? ['ace_console.exe', 'ace_engine.exe'] : ['ace_engine', 'ace_console'];
  for (const n of names) {
    try { if (process.platform === 'win32') execFileSync('taskkill', ['/F', '/IM', n], { windowsHide: true, stdio: 'ignore' }); else execFileSync('pkill', ['-f', n], { stdio: 'ignore' }); }
    catch { /* no estaba en marcha */ }
  }
}
/** Arranca el motor AceStream si está instalado y no responde (best-effort). */
async function ensureEngine(log = console.log) {
  if (await engineOnline()) return 'running';
  const exe = findAceEngine();
  if (!exe) return 'missing';
  try { spawn(exe, /ace_console/i.test(exe) ? ['--client-console'] : [], { detached: true, stdio: 'ignore', windowsHide: true, cwd: path.dirname(exe) }).unref(); log('[ace] motor lanzado', exe); }
  catch (e) { log('[ace] no se pudo lanzar', e.message); return 'error'; }
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 1000)); if (await engineOnline()) return 'started'; }
  return 'timeout';
}

function start(opts = {}) {
  const log = opts.log || console.log;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const send = (code, obj) => { res.writeHead(code); res.end(JSON.stringify(obj)); };
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const u = new URL(req.url, 'http://x');
    const vlc = findVlc();
    if (u.pathname === '/health') return send(200, { ok: true, vlc });
    if (u.pathname === '/deps') return send(200, { vlc: !!vlc, warp: !!findWarp(), aceInstalled: !!findAceEngine(), aceRunning: await engineOnline() });
    if (u.pathname === '/engine/start') return send(200, { result: await ensureEngine(log) });
    if (u.pathname === '/engine/stop') { stopEngine(); return send(200, { ok: true }); }
    if (u.pathname === '/open') {
      const target = u.searchParams.get('url');
      const direct = u.searchParams.get('direct') === '1';   // emisión HLS normal (TDT), sin motor
      const allowed = direct ? /^https?:\/\/[^\s"']+$/i : /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/i;
      if (!target || !allowed.test(target)) return send(400, { ok: false, error: 'URL no permitida (solo motor local o emisión directa http/https)' });
      if (!vlc) return send(500, { ok: false, error: 'No se encontró VLC. Instálalo o define VLC_PATH.' });
      try {
        const boundedCaching = (value, fallback) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? Math.min(30000, Math.max(100, Math.round(parsed))) : fallback;
        };
        const networkCaching = boundedCaching(u.searchParams.get('networkCaching'), 3000);
        const liveCaching = boundedCaching(u.searchParams.get('liveCaching'), 3000);
        const p = spawn(vlc, [target, `--network-caching=${networkCaching}`, `--live-caching=${liveCaching}`], { detached: true, stdio: 'ignore' });
        p.on('error', e => log('[vlc] error', e.message));
        p.unref();
        log('[vlc] abierto', target);
        return send(200, { ok: true, vlc });
      } catch (e) { return send(500, { ok: false, error: e.message }); }
    }
    send(404, { ok: false, error: 'not found' });
  });
  server.listen(PORT, '127.0.0.1', () => log(`[vlc-helper] http://localhost:${PORT} — VLC: ${findVlc() || 'NO ENCONTRADO'}`));
  server.on('error', e => log('[vlc-helper] ERROR', e.message));
  return server;
}

module.exports = { start, ensureEngine, findVlc, findWarp, findAceEngine, engineOnline };
if (require.main === module) start();

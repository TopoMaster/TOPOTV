/**
 * Compartir canales por enlace (acceso remoto vía navegador).
 *  - Servidor PÚBLICO 127.0.0.1:3005  -> /ver/<token> (reproductor), /s/<token>/... (proxy HLS del motor).
 *    Es lo único que se expone por el túnel de Cloudflare. Nunca da acceso al resto de TOPOTV ni al motor.
 *  - Servidor ADMIN  127.0.0.1:3006  -> crear/revocar enlaces y controlar el túnel. Solo local.
 */
const http = require('http');
const { guard } = require('./guard.cjs');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const PUBLIC_PORT = Number(process.env.SHARE_PORT || 3005);
const ADMIN_PORT = Number(process.env.SHARE_ADMIN_PORT || 3006);
const ENGINE = { host: '127.0.0.1', port: 6878 };
const HASH_RE = /^[0-9a-f]{40}$/i;
const CF_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

const shares = new Map(); // token -> {token,hash,name,expires,maxViewers,created,viewers:Map<ip,ts>}
const tunnel = { state: 'off', url: null, error: null, proc: null };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clientIp = req => req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '?';
function getShare(token) {
  const s = shares.get(token);
  if (!s) return null;
  if (Date.now() > s.expires) { shares.delete(token); return null; }
  return s;
}
function pruneViewers(s) { const lim = Date.now() - 30000; for (const [ip, ts] of s.viewers) if (ts < lim) s.viewers.delete(ip); }
function publicView(s) {
  pruneViewers(s);
  return { token: s.token, name: s.name, hash: s.hash, created: s.created, expires: s.expires, maxViewers: s.maxViewers, viewers: s.viewers.size, url: tunnel.url ? `${tunnel.url}/ver/${s.token}` : null };
}

/* ---------- Página de reproducción ---------- */
function playerPage(s) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(s.name)} · TOPOTV</title><meta name="robots" content="noindex">
<style>html,body{margin:0;height:100%;background:#080a0e;color:#e8eaf0;font-family:system-ui,sans-serif}
.w{display:flex;flex-direction:column;height:100%}header{padding:12px 16px;display:flex;gap:10px;align-items:center}
b{font-size:1.1rem;letter-spacing:.12em;color:#4cc9a7}span{opacity:.75;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
video{flex:1;min-height:0;width:100%;background:#000}#m{padding:10px 16px;font-size:.85rem;opacity:.8;min-height:1.2em}</style></head>
<body><div class="w"><header><b>TOPOTV</b><span>${esc(s.name)}</span></header><video id="v" controls autoplay playsinline></video><div id="m">Conectando con el canal…</div></div>
<script src="/hls.js"></script><script>
const v=document.getElementById('v'),m=document.getElementById('m'),src='/s/${s.token}/m.m3u8';
let tries=0;
function say(t){m.textContent=t}
function start(){
 if(window.Hls&&Hls.isSupported()){
  const h=new Hls({lowLatencyMode:false,manifestLoadingTimeOut:30000,manifestLoadingMaxRetry:6,levelLoadingMaxRetry:6,fragLoadingMaxRetry:6});
  h.loadSource(src);h.attachMedia(v);
  h.on(Hls.Events.MANIFEST_PARSED,()=>{say('');v.play().catch(()=>say('Pulsa play para empezar'))});
  h.on(Hls.Events.ERROR,(e,d)=>{if(!d.fatal)return;
   if(d.type===Hls.ErrorTypes.NETWORK_ERROR&&tries++<5){say('Reconectando…');h.startLoad()}
   else{say('No se pudo reproducir (enlace caducado, límite de espectadores o canal caído).');h.destroy()}});
 }else if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=src;v.addEventListener('loadedmetadata',()=>say(''))}
 else say('Tu navegador no soporta la reproducción.');
}
v.addEventListener('playing',()=>say(''));start();
</script></body></html>`;
}
const notFound = res => { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Enlace no válido o caducado'); };

/* ---------- Servidor público ---------- */
function proxyEngine(req, res, enginePath, rewrite, share) {
  const up = http.get({ ...ENGINE, path: enginePath, timeout: 45000 }, r => {
    if (rewrite) {
      let body = '';
      r.setEncoding('utf8'); r.on('data', c => body += c);
      r.on('end', () => {
        if (r.statusCode !== 200) { res.writeHead(r.statusCode || 502); return res.end('Motor: ' + r.statusCode); }
        const base = new URL('http://' + ENGINE.host + ':' + ENGINE.port + enginePath);
        const map = ref => {
          let u; try { u = new URL(ref, base); } catch { return ref; }
          if (u.hostname !== ENGINE.host && u.hostname !== 'localhost') return ref;
          return 'p' + u.pathname + u.search;
        };
        const out = body.split(/\r?\n/).map(l => {
          if (!l) return l;
          if (l.startsWith('#')) return l.replace(/URI="([^"]+)"/g, (_, u) => `URI="${map(u)}"`);
          return map(l.trim());
        }).join('\n');
        res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
        res.end(out);
      });
    } else {
      const h = { 'Cache-Control': 'no-store' };
      if (r.headers['content-type']) h['Content-Type'] = r.headers['content-type'];
      if (r.headers['content-length']) h['Content-Length'] = r.headers['content-length'];
      res.writeHead(r.statusCode || 502, h);
      r.pipe(res);
      res.on('close', () => up.destroy());
    }
  });
  up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Motor AceStream no disponible'); });
  up.on('timeout', () => { up.destroy(); if (!res.headersSent) res.writeHead(504); res.end(); });
}
function publicServer() {
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    if (p === '/hls.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'public,max-age=86400' });
      return fs.createReadStream(path.join(__dirname, 'hls.min.js')).pipe(res);
    }
    let m = p.match(/^\/ver\/([a-f0-9]{32})$/);
    if (m) {
      const s = getShare(m[1]); if (!s) return notFound(res);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      return res.end(playerPage(s));
    }
    m = p.match(/^\/s\/([a-f0-9]{32})\/(m\.m3u8|p\/.+)$/);
    if (!m) return notFound(res);
    const s = getShare(m[1]); if (!s) return notFound(res);
    const ip = clientIp(req);
    pruneViewers(s);
    if (!s.viewers.has(ip) && s.viewers.size >= s.maxViewers) { res.writeHead(429); return res.end('Límite de espectadores alcanzado'); }
    s.viewers.set(ip, Date.now());
    if (m[2] === 'm.m3u8') return proxyEngine(req, res, `/ace/manifest.m3u8?id=${s.hash}`, true, s);
    const ep = '/' + m[2].slice(2); // /ace/...
    if (!ep.startsWith('/ace/') || ep.includes('..')) { res.writeHead(403); return res.end(); }
    proxyEngine(req, res, ep + u.search, false, s);
  });
}

/* ---------- Túnel Cloudflare ---------- */
function findCloudflared(binDir) {
  const c = [process.env.CLOUDFLARED_PATH, path.join(binDir, 'cloudflared.exe'), 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe'].filter(Boolean);
  for (const p of c) if (fs.existsSync(p)) return p;
  try { return execFileSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/)[0].trim() || null; } catch { return null; }
}
function download(url, dest, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 6) return reject(new Error('demasiadas redirecciones'));
    https.get(url, { headers: { 'User-Agent': 'TOPOTV' } }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) { r.resume(); return resolve(download(new URL(r.headers.location, url).href, dest, hops + 1)); }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error('HTTP ' + r.statusCode)); }
      const tmp = dest + '.part', f = fs.createWriteStream(tmp);
      const expected = Number(r.headers['content-length']) || 0;
      let got = 0, failed = false;
      const fail = e => { if (failed) return; failed = true; f.destroy(); try { fs.unlinkSync(tmp); } catch { /* sin archivo */ } reject(e); };
      r.on('data', c => { got += c.length; });
      r.pipe(f);
      f.on('finish', () => f.close(() => {
        if (failed) return;
        if (expected && got !== expected) return fail(new Error('La descarga del túnel quedó incompleta'));
        fs.renameSync(tmp, dest); resolve(dest);
      }));
      f.on('error', fail); r.on('error', fail); r.on('aborted', () => fail(new Error('Se cortó la descarga del túnel')));
    }).on('error', reject);
  });
}
/** ¿Arranca el ejecutable? (una descarga a medias deja un .exe que Windows rechaza con 0xC000007B) */
function usable(exe) {
  try { execFileSync(exe, ['--version'], { timeout: 10000, windowsHide: true, stdio: 'ignore' }); return true; } catch { return false; }
}
async function startTunnel(binDir, log) {
  if (tunnel.state === 'starting' || tunnel.state === 'on') return;
  Object.assign(tunnel, { state: 'starting', url: null, error: null });
  try {
    let exe = findCloudflared(binDir);
    if (exe && !usable(exe)) {
      if (path.dirname(exe) !== binDir) throw new Error('El cloudflared instalado en el equipo no arranca. Reinstálalo o bórralo para que TOPOTV use el suyo.');
      log('[share] cloudflared dañado, se descarga de nuevo');
      try { fs.unlinkSync(exe); } catch { /* en uso */ }
      exe = null;
    }
    if (!exe) {
      if (process.platform !== 'win32') throw new Error('cloudflared no está instalado');
      fs.mkdirSync(binDir, { recursive: true });
      tunnel.state = 'downloading';
      log('[share] descargando cloudflared…');
      exe = await download(CF_URL, path.join(binDir, 'cloudflared.exe'));
      if (!usable(exe)) { try { fs.unlinkSync(exe); } catch { /* en uso */ } throw new Error('No se pudo preparar el túnel: el archivo descargado no arranca. Reintenta o instala cloudflared a mano.'); }
      tunnel.state = 'starting';
    }
    const proc = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${PUBLIC_PORT}`], { windowsHide: true });
    tunnel.proc = proc;
    const onData = d => {
      const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && tunnel.state !== 'on') { tunnel.url = m[0]; tunnel.state = 'on'; log('[share] túnel', m[0]); }
    };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData);
    proc.on('exit', code => { if (tunnel.proc === proc) { tunnel.proc = null; if (tunnel.state !== 'off') Object.assign(tunnel, { state: tunnel.url ? 'off' : 'error', url: null, error: tunnel.url ? null : 'El túnel se cerró al arrancar (código ' + code + ')' }); } });
    proc.on('error', e => Object.assign(tunnel, { state: 'error', error: e.message }));
    setTimeout(() => { if (tunnel.state === 'starting') { Object.assign(tunnel, { state: 'error', error: 'El túnel no respondió en 40 s' }); stopTunnel(true); } }, 40000);
  } catch (e) { Object.assign(tunnel, { state: 'error', error: e.message }); }
}
function stopTunnel(keepState) {
  const p = tunnel.proc; tunnel.proc = null;
  if (!keepState) Object.assign(tunnel, { state: 'off', url: null, error: null });
  if (p) try { p.kill(); } catch { /* ya terminado */ }
}

/* ---------- Servidor admin (solo local) ---------- */
function adminServer(binDir, log) {
  return http.createServer((req, res) => {
    if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) { res.writeHead(403); return res.end(); }   // nunca desde el túnel
    if (!guard(req, res)) return;
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
    const u = new URL(req.url, 'http://x');
    const status = () => { for (const s of shares.values()) getShare(s.token); return { tunnel: { state: tunnel.state, url: tunnel.url, error: tunnel.error }, shares: [...shares.values()].map(publicView) }; };
    if (u.pathname === '/health') return json(200, { ok: true });
    if (u.pathname === '/status') return json(200, status());
    if (u.pathname === '/tunnel/start' && req.method === 'POST') { startTunnel(binDir, log); return json(200, status()); }
    if (u.pathname === '/tunnel/stop' && req.method === 'POST') { stopTunnel(); return json(200, status()); }
    if (u.pathname === '/share/revoke' && req.method === 'POST') { shares.delete(u.searchParams.get('token')); return json(200, status()); }
    if (u.pathname === '/share' && req.method === 'POST') {
      let body = ''; req.on('data', c => { body += c; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        let d; try { d = JSON.parse(body); } catch { return json(400, { error: 'JSON inválido' }); }
        if (!HASH_RE.test(d.hash || '')) return json(400, { error: 'hash inválido' });
        const ttl = Math.min(Math.max(Number(d.ttlHours) || 6, 0.25), 72);
        const token = crypto.randomBytes(16).toString('hex');
        const s = { token, hash: d.hash.toLowerCase(), name: String(d.name || 'Canal').slice(0, 120), created: Date.now(), expires: Date.now() + ttl * 3600e3, maxViewers: Math.min(Math.max(parseInt(d.maxViewers) || 3, 1), 20), viewers: new Map() };
        shares.set(token, s);
        if (tunnel.state === 'off' || tunnel.state === 'error') startTunnel(binDir, log);
        json(200, { share: publicView(s), tunnel: status().tunnel });
      });
      return;
    }
    json(404, { error: 'no encontrado' });
  });
}

function start(opts = {}) {
  const log = opts.log || console.log;
  const binDir = opts.binDir || path.join(__dirname, 'bin');
  const pub = publicServer(), adm = adminServer(binDir, log);
  pub.listen(PUBLIC_PORT, '127.0.0.1', () => log('[share] público :' + PUBLIC_PORT));
  adm.listen(ADMIN_PORT, '127.0.0.1', () => log('[share] admin :' + ADMIN_PORT));
  for (const s of [pub, adm]) s.on('error', e => log('[share] error', e.message));
  process.on('exit', () => stopTunnel());
  return { stop() { stopTunnel(); pub.close(); adm.close(); } };
}
module.exports = { start };
if (require.main === module) start();

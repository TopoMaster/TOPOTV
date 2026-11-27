/**
 * TOPOTV — aplicación de escritorio.
 * Arranca en el propio proceso: servidor de la web (5174), servicio de eventos (3004) y VLC helper (3002).
 * La agenda se lee con un BrowserWindow oculto (Chromium de Electron): no hace falta Playwright.
 */
const { app, BrowserWindow, shell, session, Menu, dialog, powerSaveBlocker } = require('electron');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WEB_PORT = 5174;
const APP_DIR = path.join(__dirname, '..', 'app');
const TOOLS = path.join(__dirname, '..', 'tools');
const LOG = () => path.join(app.getPath('userData'), 'topotv.log');
const log = (...a) => { const line = `${new Date().toISOString()} ${a.join(' ')}\n`; try { fs.appendFileSync(LOG(), line); } catch { /* sin log */ } console.log(...a); };

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

/* ── Paquetes de idioma del traductor (Firefox Translations) ────
 * Los modelos están en un almacén público que no deja que una web los pida directamente (sin CORS):
 * el servidor local los descarga una vez, los guarda en el equipo y se los da a la web (mismo origen).
 * Solo sirve archivos que aparecen en el registro oficial, y la web comprueba la huella SHA-256 de cada uno. */
const MODELS_BASE = 'https://storage.googleapis.com/bergamot-models-sandbox/0.3.3';
const MODELS_DIR = () => path.join(app.getPath('userData'), 'translation-models');
const downloading = new Map();
function download(url, dest, redirects = 3) {
  if (downloading.has(dest)) return downloading.get(dest);
  const job = new Promise((resolve, reject) => {
    const req = require('https').get(url, { headers: { 'Accept-Encoding': 'identity', 'User-Agent': 'TOPOTV' }, timeout: 60000 }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && redirects > 0) { r.resume(); downloading.delete(dest); return download(new URL(r.headers.location, url).href, dest, redirects - 1).then(resolve, reject); }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error(`HTTP ${r.statusCode}`)); }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.part`;
      const src = /gzip/i.test(r.headers['content-encoding'] || '') ? r.pipe(require('zlib').createGunzip()) : r;
      const out = fs.createWriteStream(tmp);
      src.pipe(out);
      src.on('error', reject);
      out.on('error', reject);
      out.on('finish', () => { try { fs.renameSync(tmp, dest); resolve(dest); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('tiempo agotado')));
    req.on('error', reject);
  }).finally(() => downloading.delete(dest));
  downloading.set(dest, job);
  return job;
}
async function modelRegistry() {
  const file = path.join(MODELS_DIR(), 'registry.json');
  const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 7 * 864e5;
  if (!fresh) { try { await download(`${MODELS_BASE}/registry.json`, file); } catch (e) { if (!fs.existsSync(file)) throw e; } }
  return file;
}
async function serveModel(rel, res) {
  try {
    const regFile = await modelRegistry();
    if (rel === 'registry.json') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }); return fs.createReadStream(regFile).pipe(res); }
    const [pair, name, extra] = rel.split('/');
    const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
    const known = !extra && /^[a-z]{4}$/.test(pair || '') && reg[pair] && Object.values(reg[pair]).some(f => f && f.name === name);
    if (!known) { res.writeHead(404); return res.end(); }
    const dest = path.join(MODELS_DIR(), pair, name);
    if (!fs.existsSync(dest)) { log('traductor: descargando', pair, name); await download(`${MODELS_BASE}/${pair}/${name}`, dest); }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': fs.statSync(dest).size, 'Cache-Control': 'no-cache' });
    fs.createReadStream(dest).pipe(res);
  } catch (e) {
    log('traductor: no se pudo descargar', rel, e.message);
    res.writeHead(502); res.end();
  }
}

/* ── Enlaces magnet y archivos .torrent (opcional: el usuario lo activa en Ajustes) ── */
const OWN = `http://127.0.0.1:${WEB_PORT}`;
/** .torrent → magnet (identificador = SHA-1 del diccionario «info» tal cual está en el archivo) */
function torrentToMagnet(file) {
  const buf = fs.readFileSync(file);
  if (buf.length > 20 * 1024 * 1024) throw new Error('archivo demasiado grande');
  let i = 0, info = null;
  const parse = depth => {
    const c = buf[i];
    if (c === 0x69) { const e = buf.indexOf(0x65, i); const n = Number(buf.slice(i + 1, e).toString()); i = e + 1; return n; }   // i…e
    if (c === 0x6c) { i++; const a = []; while (buf[i] !== 0x65) { if (i >= buf.length) throw new Error('torrent roto'); a.push(parse(depth + 1)); } i++; return a; }
    if (c === 0x64) { i++; const o = {}; while (buf[i] !== 0x65) { if (i >= buf.length) throw new Error('torrent roto'); const k = parse(depth + 1).toString('latin1'); const start = i; o[k] = parse(depth + 1); if (depth === 0 && k === 'info') info = [start, i]; } i++; return o; }
    if (c >= 0x30 && c <= 0x39) { const colon = buf.indexOf(0x3a, i); const len = Number(buf.slice(i, colon).toString()); const v = buf.slice(colon + 1, colon + 1 + len); i = colon + 1 + len; return v; }
    throw new Error('no es un archivo .torrent');
  };
  const root = parse(0);
  if (!info) throw new Error('no es un archivo .torrent');
  const hash = crypto.createHash('sha1').update(buf.slice(info[0], info[1])).digest('hex');
  const str = b => (Buffer.isBuffer(b) ? b.toString('utf8') : '');
  const name = root.info && str(root.info.name);
  const trackers = [...new Set([str(root.announce), ...(Array.isArray(root['announce-list']) ? root['announce-list'].flat().map(str) : [])].filter(t => /^(udp|https?|wss?):\/\//i.test(t)))].slice(0, 20);
  return `magnet:?xt=urn:btih:${hash}${name ? `&dn=${encodeURIComponent(name)}` : ''}${trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('')}`;
}
/** ¿Trae la línea de órdenes un magnet o un .torrent? → la página de la app que lo reproduce */
function linkPage(argv) {
  for (const a of argv.slice(1)) {
    try {
      if (/^magnet:\?/i.test(a)) return `${OWN}/abrir?magnet=${encodeURIComponent(a)}`;
      if (/\.torrent$/i.test(a) && fs.existsSync(a)) return `${OWN}/abrir?magnet=${encodeURIComponent(torrentToMagnet(a))}`;
    } catch (e) { log('enlace no válido:', e.message); }
  }
  return null;
}
const launchArgs = app.isPackaged ? [] : [path.resolve(__dirname, '..')];   // en desarrollo: electron.exe + carpeta de la app
const exeCmd = () => [process.execPath, ...launchArgs].map(x => `"${x}"`).join(' ');
const reg = args => require('child_process').execFileSync('reg', args, { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const handlers = {
  get() {
    let torrent = false;
    try { torrent = /TOPOTV\.torrent/.test(reg(['query', 'HKCU\\Software\\Classes\\.torrent', '/ve'])); } catch { /* no hay asociación */ }
    return { magnet: app.isDefaultProtocolClient('magnet', process.execPath, launchArgs), torrent };
  },
  set({ magnet, torrent }) {
    if (typeof magnet === 'boolean') {
      if (magnet) app.setAsDefaultProtocolClient('magnet', process.execPath, launchArgs);
      else app.removeAsDefaultProtocolClient('magnet', process.execPath, launchArgs);
    }
    if (typeof torrent === 'boolean') {
      // lo que tuviera antes .torrent (p. ej. «AceStream.engine») se guarda y se devuelve al desactivarlo
      const saved = path.join(app.getPath('userData'), 'asociacion-torrent.json');
      if (torrent) {
        if (!handlers.get().torrent) {
          let prev = '';
          try { prev = (reg(['query', 'HKCU\\Software\\Classes\\.torrent', '/ve']).match(/REG_SZ\s+(.+)/) || [])[1]?.trim() ?? ''; } catch { /* no había */ }
          fs.writeFileSync(saved, JSON.stringify({ prev }));
        }
        reg(['add', 'HKCU\\Software\\Classes\\TOPOTV.torrent', '/ve', '/d', 'Torrent (TOPOTV)', '/f']);
        reg(['add', 'HKCU\\Software\\Classes\\TOPOTV.torrent\\shell\\open\\command', '/ve', '/d', `${exeCmd()} "%1"`, '/f']);
        reg(['add', 'HKCU\\Software\\Classes\\.torrent', '/ve', '/d', 'TOPOTV.torrent', '/f']);
      } else if (handlers.get().torrent) {
        let prev = '';
        try { prev = JSON.parse(fs.readFileSync(saved, 'utf8')).prev || ''; } catch { /* sin copia */ }
        if (prev) reg(['add', 'HKCU\\Software\\Classes\\.torrent', '/ve', '/d', prev, '/f']);
        else try { reg(['delete', 'HKCU\\Software\\Classes\\.torrent', '/ve', '/f']); } catch { /* ya no estaba */ }
        try { reg(['delete', 'HKCU\\Software\\Classes\\TOPOTV.torrent', '/f']); } catch { /* ya no estaba */ }
        try { fs.unlinkSync(saved); } catch { /* ya no estaba */ }
      }
    }
    return handlers.get();
  },
};

/* ── Servidor de la web (SPA) ───────────────────────────────── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };
function startWeb() {
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
    if (p.startsWith('/bergamot-models/')) return void serveModel(p.slice('/bergamot-models/'.length), res);
    let file = path.normalize(path.join(APP_DIR, p));
    const rel = path.relative(APP_DIR, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403); return res.end(); }   // nada fuera de la carpeta de la web
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(APP_DIR, 'index.html');   // SPA fallback
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(WEB_PORT, '127.0.0.1', () => resolve(server)); });
}

/* ── Lectura de la agenda con Chromium de Electron ──────────── */
function electronScrape(extractInBrowser, source) {
  return async (proxy, timeout) => {
    const partition = `scrape-${Date.now()}`;
    const ses = session.fromPartition(partition, { cache: false });
    if (proxy) await ses.setProxy({ proxyRules: proxy });
    const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { session: ses, sandbox: true, contextIsolation: true, backgroundThrottling: false } });
    try {
      await Promise.race([
        win.loadURL(source),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Tiempo de espera agotado cargando la agenda')), timeout)),
      ]);
      for (let i = 0; i < 30; i++) {
        if (await win.webContents.executeJavaScript(`!!document.querySelector('table.tabla-eventos tbody tr')`)) break;
        await new Promise(r => setTimeout(r, 500));
      }
      return await win.webContents.executeJavaScript(`(${extractInBrowser.toString()})()`);
    } finally { if (!win.isDestroyed()) win.destroy(); await ses.clearStorageData().catch(() => {}); }
  };
}

/* ── Ventana principal ──────────────────────────────────────── */
let mainWin = null;
function createWindow() {
  mainWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 640, backgroundColor: '#080a0e', title: 'TOPOTV', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'), fullscreen: process.argv.includes('--fullscreen'),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'TOPOTV', submenu: [
    { label: 'Pantalla completa', accelerator: 'F11', click: () => mainWin.setFullScreen(!mainWin.isFullScreen()) },
    { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => mainWin.reload() },
    { label: 'Abrir registro', click: () => shell.showItemInFolder(LOG()) },
    { type: 'separator' }, { role: 'quit', label: 'Salir' }] }]));
  // Enlaces externos: solo http/https (otros esquemas como file:, smb: o ms-msdt: pueden ejecutar programas en Windows)
  const openSafe = url => { try { if (/^https?:$/.test(new URL(url).protocol)) void shell.openExternal(url); } catch { /* dirección no válida */ } };
  mainWin.webContents.setWindowOpenHandler(({ url }) => { openSafe(url); return { action: 'deny' }; });
  // La ventana principal no debe cargar páginas ajenas (tendrían a mano los servicios locales): se abren en el navegador
  const ownOrigin = `http://127.0.0.1:${WEB_PORT}`;
  // (los archivos que genera la propia app, como la copia de seguridad, son «blob:» de su mismo origen: se descargan)
  const keepInside = (e, url) => { if (!url.startsWith(ownOrigin + '/') && url !== ownOrigin && !url.startsWith(`blob:${ownOrigin}/`)) { e.preventDefault(); openSafe(url); } };
  mainWin.webContents.on('will-navigate', keepInside);
  mainWin.webContents.on('will-redirect', keepInside);
  mainWin.loadURL(linkPage(process.argv) ?? `http://127.0.0.1:${WEB_PORT}/`);   // abierto con un magnet o un .torrent: directo a reproducirlo
  mainWin.on('closed', () => { mainWin = null; });
}

app.on('second-instance', (_e, argv) => {
  if (!mainWin) return;
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.focus();
  const page = linkPage(argv);   // otro magnet o .torrent con la app ya abierta
  if (page) void mainWin.loadURL(page);
});
app.on('window-all-closed', () => app.quit());

if (gotLock) app.whenReady().then(async () => {
  log('TOPOTV arrancando', app.getVersion());
  // El motor AceStream no envía CORS en todas las versiones: lo permitimos para la web local.
  // (los servicios de TOPOTV ya responden con CORS solo para la app; el motor AceStream no, y se le añade solo para la app)
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
    const h = d.responseHeaders || {};
    const fromApp = (d.referrer || '').startsWith(`http://127.0.0.1:${WEB_PORT}`);
    if (fromApp && /^https?:\/\/(127\.0\.0\.1|localhost):6878\//.test(d.url)) h['Access-Control-Allow-Origin'] = ['*'];
    cb({ responseHeaders: h });
  });
  // permisos del navegador: solo notificaciones, pantalla completa y copiar al portapapeles (nada de cámara, micrófono, ubicación…)
  const GRANTED = new Set(['notifications', 'fullscreen', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(GRANTED.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => GRANTED.has(permission));
  // lo que descarga la propia app (la copia de seguridad) va directo a Descargas, sin ventana de «Guardar como»
  session.defaultSession.on('will-download', (_e, item) => {
    const dir = app.getPath('downloads');
    const name = path.basename(item.getFilename()).replace(/[<>:"/\\|?*]/g, '_') || 'topotv-descarga';
    const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
    let target = path.join(dir, name);
    for (let i = 2; fs.existsSync(target) && i < 100; i++) target = path.join(dir, `${stem} (${i})${ext}`);
    item.setSavePath(target);
  });
  app.on('web-contents-created', (_e, wc) => wc.on('will-attach-webview', e => e.preventDefault()));
  try {
    await startWeb();
    process.env.CIRIACO_PORT = '3004';
    const { start: startCiriaco, extractInBrowser, SOURCE: CIRIACO_SOURCE } = require(path.join(TOOLS, 'ciriaco-server.cjs'));
    startCiriaco({ scrape: electronScrape(extractInBrowser, CIRIACO_SOURCE), cacheFile: path.join(app.getPath('userData'), 'agenda-cache.json') });
    const vlc = require(path.join(TOOLS, 'vlc-helper.cjs'));
    vlc.start({ log });
    require(path.join(TOOLS, 'epg-server.cjs')).start({ log });   // guía de programación (puerto 3003)
    // Grabaciones programadas: evitan que Windows suspenda el equipo mientras se graba
    let sleepBlock = null;
    require(path.join(TOOLS, 'recorder.cjs')).start({
      log,
      file: path.join(app.getPath('userData'), 'grabaciones.json'),
      dir: path.join(app.getPath('videos'), 'TOPOTV'),
      ensureEngine: vlc.ensureEngine,
      onBusy: busy => {
        if (busy && sleepBlock === null) sleepBlock = powerSaveBlocker.start('prevent-app-suspension');
        else if (!busy && sleepBlock !== null) { powerSaveBlocker.stop(sleepBlock); sleepBlock = null; }
      },
      openFile: file => { const exe = vlc.findVlc(); if (exe) { const p = require('child_process').spawn(exe, [file], { cwd: path.dirname(exe), detached: true, stdio: 'ignore' }); p.on('error', () => shell.openPath(file)); p.unref(); } else shell.openPath(file); },
      openFolder: dir => shell.openPath(dir),
    });
    // Sistema: actualizaciones desde GitHub, registro y diagnóstico (puerto 3008)
    // Motor de torrents para los enlaces de los addons (peerflix, puerto 3009): descarga en la carpeta de datos y la borra al parar
    try { require(path.join(TOOLS, 'torrent-server.cjs')).start({ log, dir: path.join(app.getPath('userData'), 'torrents') }); } catch (e) { log('motor de torrents no disponible:', e.message); }
    // Pausar y rebobinar el canal que estás viendo (puerto 3010): guarda los trozos de vídeo en la carpeta de datos y los borra al cerrar
    try { require(path.join(TOOLS, 'timeshift-server.cjs')).start({ log, dir: path.join(app.getPath('userData'), 'timeshift') }); } catch (e) { log('rebobinado no disponible:', e.message); }
    require(path.join(TOOLS, 'system-server.cjs')).start({
      log, version: app.getVersion(), logFile: LOG(), handlers,
      openLog: () => shell.showItemInFolder(LOG()),
      // El instalador pide permisos de administrador: se abre con Start-Process (ShellExecute, que muestra el aviso
      // de Windows) y desde su carpeta temporal, no desde la de instalación (si no, esa carpeta queda en uso y el
      // instalador no puede quitar la versión anterior). La app se cierra para no bloquear sus archivos.
      runInstaller: file => {
        const dir = path.dirname(file);
        const ps = `Start-Process -FilePath '${file.replace(/'/g, "''")}' -WorkingDirectory '${dir.replace(/'/g, "''")}'`;
        let opened = false;
        try {
          const p = require('child_process').spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], { cwd: dir, detached: true, stdio: 'ignore', windowsHide: true });
          p.on('error', e => { log('no se pudo abrir el instalador con PowerShell:', e.message); shell.openPath(file).catch(() => {}); });
          p.unref();
          opened = true;
        } catch (e) { log('no se pudo abrir el instalador:', e.message); }
        if (!opened) shell.openPath(file).then(err => { if (err) log('no se pudo abrir el instalador:', err); }).catch(() => {});
        setTimeout(() => app.quit(), 2500);
      },
      listsDir: path.join(app.getPath('documents'), 'TOPOTV', 'Listas'),
      openFolder: dir => { try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ya existe */ } shell.openPath(dir).catch(() => {}); },
    });
    require(path.join(TOOLS, 'share-server.cjs')).start({ log, binDir: path.join(app.getPath('userData'), 'bin') });
    createWindow();
    // Motor AceStream: lo arranca si está instalado y parado
    vlc.ensureEngine(log).then(r => {
      log('motor AceStream:', r);
      if (r === 'missing') dialog.showMessageBox(mainWin, { type: 'info', title: 'TOPOTV', message: 'No se encontró el motor AceStream.', detail: 'Instala AceStream Media (acestream.org) o arranca tu motor en Docker (puerto 6878). Sin él no se pueden reproducir los canales.', buttons: ['Entendido'] }).catch(() => {});
    });
  } catch (e) {
    log('ERROR de arranque', e && e.stack || e);
    dialog.showErrorBox('TOPOTV no pudo arrancar', String(e && e.message || e) + `\n\nRegistro: ${LOG()}`);
    app.quit();
  }
});

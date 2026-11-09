// Copia la web compilada (../dist) y los servidores (../tools) dentro de desktop/ para empaquetarlos.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const out = path.join(__dirname, '..');
const rm = p => fs.rmSync(p, { recursive: true, force: true });
const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('Falta ../dist. Ejecuta "npm run build" en la carpeta del proyecto.'); process.exit(1); }
rm(path.join(out, 'app')); fs.cpSync(dist, path.join(out, 'app'), { recursive: true });
rm(path.join(out, 'tools')); fs.mkdirSync(path.join(out, 'tools'));
for (const f of ['ciriaco-server.cjs', 'channel-logos.cjs', 'channel-logos.json', 'vlc-helper.cjs', 'share-server.cjs', 'recorder.cjs', 'hls.min.js']) fs.copyFileSync(path.join(root, 'tools', f), path.join(out, 'tools', f));
console.log('app/ y tools/ preparados');

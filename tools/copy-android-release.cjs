const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const debug = process.argv.includes('--debug');
const version = process.env.ANDROID_VERSION_NAME || (debug ? 'debug' : require('../desktop/package.json').version);
if (!/^[\w.-]+$/.test(version)) throw new Error('ANDROID_VERSION_NAME contiene caracteres no válidos.');

const variant = debug ? 'debug' : 'release';
const source = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', variant, `app-${variant}.apk`);
const destinationDir = path.join(root, 'artifacts', 'android');
const destination = path.join(destinationDir, `TOPOTV-${version}.apk`);

if (!fs.existsSync(source)) throw new Error(`No se encontró la APK compilada: ${source}`);
fs.mkdirSync(destinationDir, { recursive: true });
fs.copyFileSync(source, destination);
console.log(`APK ${variant} copiada a ${path.relative(root, destination)}`);
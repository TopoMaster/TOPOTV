const fs = require('node:fs');
const path = require('node:path');

/**
 * Copia las dos ediciones de la APK a artifacts/android con su nombre de descarga:
 *   movil → TOPOTV-<versión>.apk      (teléfonos y tabletas)
 *   tv    → TOPOTV-TV-<versión>.apk   (Android TV / Google TV)
 */
const root = path.join(__dirname, '..');
const debug = process.argv.includes('--debug');
const version = process.env.ANDROID_VERSION_NAME || (debug ? 'debug' : require('../desktop/package.json').version);
if (!/^[\w.-]+$/.test(version)) throw new Error('ANDROID_VERSION_NAME contiene caracteres no válidos.');

const variant = debug ? 'debug' : 'release';
const destinationDir = path.join(root, 'artifacts', 'android');
fs.mkdirSync(destinationDir, { recursive: true });

for (const [flavor, prefix] of [['movil', 'TOPOTV-'], ['tv', 'TOPOTV-TV-']]) {
  const source = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', flavor, variant, `app-${flavor}-${variant}.apk`);
  if (!fs.existsSync(source)) throw new Error(`No se encontró la APK compilada: ${source}`);
  const destination = path.join(destinationDir, `${prefix}${version}.apk`);
  fs.copyFileSync(source, destination);
  console.log(`APK ${flavor} ${variant} copiada a ${path.relative(root, destination)}`);
}

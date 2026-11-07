const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'dist');
const destination = path.join(root, 'artifacts', 'web');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  throw new Error('No se encontró dist/index.html. Ejecuta "npm run build" primero.');
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(source, destination, { recursive: true });
console.log('Build web copiado a artifacts/web');
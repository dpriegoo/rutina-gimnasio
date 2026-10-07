// Sella los archivos con su versión para esquivar la caché del navegador.
//   node tools/stamp.js
// - Añade ?v=<hash> a cada js/*.js y styles.css referenciados en index.html (el hash cambia solo si cambia el archivo).
// - Escribe version.json y el número de versión dentro de index.html.
// Es idempotente: se puede ejecutar cuantas veces quieras.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const hash = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const hashes = [];
html = html.replace(/(src|href)="((?:js\/[\w.-]+\.js|styles\.css))(?:\?v=[\w]+)?"/g, (m, attr, file) => {
  const h = hash(fs.readFileSync(path.join(root, file)));
  hashes.push(file + h);
  return `${attr}="${file}?v=${h}"`;
});
const build = hash(hashes.sort().join('|'));
html = html.replace(/window\.IRONLOG_BUILD = '[^']*'/, `window.IRONLOG_BUILD = '${build}'`);
fs.writeFileSync(path.join(root, 'index.html'), html);
fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ version: build }) + '\n');
console.log('versión', build, '-', hashes.length, 'archivos sellados');

// Genera supabase/coach-single-file.ts: la función "coach" en UN solo archivo, para pegarla en el editor de Supabase
// (Edge Functions > Deploy a new function > Via Editor) sin necesitar la CLI.
//   node tools/bundle-coach.js        (o npm run bundle:coach)
// Une handler.ts (la lógica) e index.ts (el arranque). tests/coach-edge.test.js comprueba que este archivo está al día
// con los dos y que, ejecutado, la función responde: si cambias handler.ts o index.ts, vuelve a ejecutarlo.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'supabase', 'functions', 'coach');

function bundle() {
  const handler = fs.readFileSync(path.join(dir, 'handler.ts'), 'utf8').replace(/^export /gm, '');
  const index = fs.readFileSync(path.join(dir, 'index.ts'), 'utf8');
  const imports = index.split('\n').filter(l => /^import .* from 'https:\/\//.test(l));
  const body = index.split('\n').filter(l => !/^import /.test(l)).join('\n').trim();
  return '// ARCHIVO GENERADO por tools/bundle-coach.js: no lo edites aquí. Pega TODO este contenido en el editor de Supabase.\n' +
    '// Función "coach" (handler.ts + index.ts en un solo archivo). Instrucciones: supabase/README.md\n' +
    imports.join('\n') + '\n\n' + handler.trim() + '\n\n' + body + '\n';
}

module.exports = { bundle };
if (require.main === module) {
  const out = path.join(__dirname, '..', 'supabase', 'coach-single-file.ts');
  fs.writeFileSync(out, bundle());
  console.log('generado', path.relative(process.cwd(), out));
}

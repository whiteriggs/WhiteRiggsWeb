const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const leer = archivo => fs.readFileSync(path.join(raiz, archivo), 'utf8');

// Decision del 2026-10-18: la coreografia se muestra siempre, aunque el sistema pida reducir
// movimiento (en Windows, "Efectos de animacion" desactivado dejaba la portada como lista estatica).
test('la portada no depende de prefers-reduced-motion', () => {
  for (const archivo of ['index.html', 'home.css', 'home.js']) {
    assert.ok(!leer(archivo).includes('prefers-reduced-motion'), `${archivo} consulta prefers-reduced-motion`);
  }
});

test('el script del <head> activa la coreografia sin condiciones', () => {
  const head = leer('index.html').split('</head>')[0];
  assert.match(head, /<script>\s*document\.documentElement\.classList\.add\('js-motion'\);?\s*<\/script>/);
});

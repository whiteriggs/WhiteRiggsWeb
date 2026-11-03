const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { downloadLabel } = require('../home.js');

const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');

for (const periodo of [undefined, 'total']) {
  test(`el contador visible y animado coinciden al cambiar idioma (${periodo || 'anual'})`, async () => {
    const element = {
      hidden: true,
      textContent: '',
      getAttribute: () => 'WhiteRiggs.Curiosity'
    };
    const context = vm.createContext({
      document: {
        documentElement: { lang: 'es' },
        querySelectorAll: () => [element],
        addEventListener() {}
      },
      fetch: async () => ({
        ok: true,
        json: async () => ({ periodo, apps: { 'WhiteRiggs.Curiosity': 631 } })
      })
    });
    vm.runInContext(source, context);
    const pintar = context.initDescargas();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(element.hidden, false);
    assert.equal(element.textContent, periodo === 'total'
      ? '631 descargas totales'
      : '631 descargas en el último año');
    for (const lang of ['es', 'en', 'fr']) {
      pintar(lang);
      assert.equal(element.textContent, downloadLabel(lang, 631, periodo));
    }
  });
}

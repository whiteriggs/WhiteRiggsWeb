const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../home.js');

const close = (a, b, eps = 0.5) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('sectionProgress se limita a [0,1]', () => {
  assert.equal(h.sectionProgress(-50, 0, 100), 0);
  assert.equal(h.sectionProgress(50, 0, 100), 0.5);
  assert.equal(h.sectionProgress(500, 0, 100), 1);
  assert.equal(h.sectionProgress(10, 0, 0), 0);
});

test('showcaseState fuera de la zona de volteo muestra el capítulo sin girar', () => {
  assert.deepEqual(h.showcaseState(0.5, 5), { shown: 0, angle: 0, from: 0, to: 0, mix: 0 });
  assert.deepEqual(h.showcaseState(2.5, 5), { shown: 2, angle: 0, from: 2, to: 2, mix: 0 });
});

test('justo antes de la frontera el icono saliente está casi de canto', () => {
  const s = h.showcaseState(0.999, 5);
  assert.equal(s.shown, 0);
  close(s.angle, 90, 1);
  assert.equal(s.from, 0);
  assert.equal(s.to, 1);
});

test('justo después de la frontera entra el siguiente desde -90°', () => {
  const s = h.showcaseState(1.001, 5);
  assert.equal(s.shown, 1);
  close(s.angle, -90, 1);
});

test('la mezcla de color es continua y vale 0,5 en la frontera', () => {
  close(h.showcaseState(1, 5).mix, 0.5, 1e-9);
  close(h.showcaseState(0.76, 5).mix, 0, 0.01);
  close(h.showcaseState(1.24, 5).mix, 1, 0.01);
});

test('al salir de la zona el giro vuelve a 0', () => {
  assert.equal(h.showcaseState(1.25, 5).angle, 0);
  assert.equal(h.showcaseState(1.25, 5).shown, 1);
  assert.equal(h.showcaseState(0.75, 5).angle, 0);
});

test('el último capítulo y los extremos no voltean', () => {
  assert.deepEqual(h.showcaseState(4.9, 5), { shown: 4, angle: 0, from: 4, to: 4, mix: 0 });
  assert.equal(h.showcaseState(5, 5).shown, 4);
  assert.equal(h.showcaseState(0, 5).shown, 0);
  assert.equal(h.showcaseState(0, 5).angle, 0);
});

test('activeChapter solo activa cerca del centro del capítulo', () => {
  assert.equal(h.activeChapter(0.5, 5), 0);
  assert.equal(h.activeChapter(2.6, 5), 2);
  assert.equal(h.activeChapter(0.05, 5), -1);
  assert.equal(h.activeChapter(-0.2, 5), -1);
  assert.equal(h.activeChapter(5.2, 5), -1);
  assert.equal(h.activeChapter(0.2, 5, 0.25), -1);
});

test('downloadLabel usa el mismo texto que script.js', () => {
  assert.equal(h.downloadLabel('es', 607), '607 descargas en el último año');
  assert.equal(h.downloadLabel('en', 1234), '1,234 downloads in the last year');
  assert.equal(h.downloadLabel('fr', 5), '5 downloads in the last year');
});

test('easeOutExpo y easeInOut van de 0 a 1', () => {
  assert.equal(h.easeOutExpo(0), 0);
  assert.equal(h.easeOutExpo(1), 1);
  assert.equal(h.easeInOut(0), 0);
  assert.equal(h.easeInOut(1), 1);
  close(h.easeInOut(0.5), 0.5, 1e-9);
});

test('activeHalf: en móvil el capítulo activo cubre todo el capítulo', () => {
  assert.equal(h.activeHalf(true), 0.5);
  assert.equal(h.activeHalf(false), 0.42);
});

test('con el umbral de móvil no hay huecos sin capítulo activo dentro del escaparate', () => {
  const half = h.activeHalf(true);
  for (let i = 1; i < 500; i++) {
    const pos = i / 100;
    if (Number.isInteger(pos)) continue;
    assert.notEqual(h.activeChapter(pos, 5, half), -1, `pos ${pos}`);
  }
});

test('textState: el texto está pleno en el centro de su capítulo', () => {
  const s = h.textState(0.5, 0);
  assert.equal(s.opacity, 1);
  assert.equal(s.d, 0);
  assert.equal(h.textState(2.55, 2).opacity, 1);
});

test('textState: en la frontera entre apps ambos textos están a 0', () => {
  assert.equal(h.textState(1, 0).opacity, 0);
  assert.equal(h.textState(1, 1).opacity, 0);
  assert.equal(h.textState(3, 0).opacity, 0);
});

test('textState: se desvanece de forma continua al alejarse del centro', () => {
  const a = h.textState(0.7, 0).opacity;
  const b = h.textState(0.8, 0).opacity;
  const c = h.textState(0.9, 0).opacity;
  assert.ok(a > b && b > c && c > 0, `${a} > ${b} > ${c} > 0`);
  close(h.textState(0.3, 0).opacity, a, 1e-9);
});

test('textState: d crece con el scroll (el texto sube) y cambia de signo en el centro', () => {
  assert.ok(h.textState(0.3, 0).d < 0);
  assert.ok(h.textState(0.7, 0).d > 0);
  close(h.textState(0.7, 0).d, 0.2, 1e-9);
});

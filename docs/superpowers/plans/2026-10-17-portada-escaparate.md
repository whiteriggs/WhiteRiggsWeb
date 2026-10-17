# Portada escaparate: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer `index.html` de WhiteRiggsWeb como un escaparate al hacer scroll: hero con constelación de iconos, despegue, cinco capítulos con volteo 3D y halo de color, dock final y Riggs.

**Architecture:** HTML estático con los datos de cada app en atributos. `home.js` mide el layout una vez y, en cada frame de scroll, calcula progresos que escribe como variables CSS. `home.css` convierte esas variables en `transform` y `opacity`. Las funciones de cálculo son puras y se prueban con `node --test`.

**Tech Stack:** HTML, CSS y JS sin dependencias; Pillow para generar los WebP; `node:test` (Node 24) para los tests.

**Spec:** `docs/superpowers/specs/2026-10-17-portada-escaparate-design.md`

## Global Constraints

- No se modifican `styles.css`, `script.js`, `support/*` ni `privacy/*`.
- Sin build, sin frameworks y sin dependencias de terceros en el navegador.
- Solo se animan `transform` y `opacity`. El cambio de color del halo se hace fundiendo capas por opacidad, lo que equivale a interpolar en RGB.
- Orden de las apps: Curiosity, FutLine, GetMeOut! Escape, Escalofrío, Wyrms.
- Titular: «La simplicidad es la máxima sofisticación.» / "Simplicity is the ultimate sophistication."
- Colores (`--c1` / `--c2`, en tripletes RGB):

  | App | `--c1` | `--c2` |
  |---|---|---|
  | Curiosity | 196 83 47 | 42 15 8 |
  | FutLine | 34 168 102 | 6 48 26 |
  | GetMeOut | 251 165 0 | 58 38 0 |
  | Escalofrío | 93 113 144 | 20 26 36 |
  | Wyrms | 239 118 13 | 58 24 4 |

- Con `prefers-reduced-motion: reduce` o sin JS, la página es una lista estática legible.
- Textos ES/EN con `data-es`/`data-en`; `initLangSwitcher` e `initDescargas` salen de `script.js`.

Convención de este plan: cada bloque precedido por `<!-- archivo: ruta -->` es el contenido completo de ese archivo.

---

### Task 1: Iconos WebP

**Files:**
- Create: `scripts/home_icons.py`
- Create: `assets/home/{curiosity,futline,getmeout,escalofrio,wyrms}-{1024,512,256}.webp`
- Create: `assets/home/riggs-256.webp`

**Interfaces:**
- Produces: las rutas `assets/home/<app>-<lado>.webp` que usan `index.html` y `sw.js`.

Nota respecto a la spec: el icono del escenario mide hasta 420 px CSS, que en pantallas retina son 840 px reales. Por eso, además de las versiones de 512 y 256 px, se genera una de 1024 px solo para el escenario (con `srcset`).

- [ ] **Step 1: Escribir el script**

<!-- archivo: scripts/home_icons.py -->
```python
"""Genera los iconos WebP de la portada a partir de los PNG de 1024 px.

Uso: python3 scripts/home_icons.py
"""
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / 'assets'
DESTINO = ORIGEN / 'home'

APPS = ['curiosity', 'futline', 'getmeout', 'escalofrio', 'wyrms']
TAMANOS_APP = (1024, 512, 256)


def exportar(origen, nombre, lados):
    imagen = Image.open(origen).convert('RGBA')
    for lado in lados:
        salida = DESTINO / f'{nombre}-{lado}.webp'
        copia = imagen if imagen.width == lado else imagen.resize((lado, lado), Image.LANCZOS)
        copia.save(salida, 'WEBP', quality=82, method=6)
        print(f'{salida.relative_to(RAIZ)}  {salida.stat().st_size // 1024} KB')


def main():
    DESTINO.mkdir(exist_ok=True)
    for app in APPS:
        exportar(ORIGEN / f'{app}-icon.png', app, TAMANOS_APP)
    exportar(ORIGEN / 'riggs-logo.png', 'riggs', (256,))


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Ejecutarlo**

Run: `python3 scripts/home_icons.py`
Expected: 16 líneas, con cada `-512.webp` por debajo de 80 KB.

- [ ] **Step 3: Commit**

```bash
git add scripts/home_icons.py assets/home
git commit -m "Iconos WebP para la nueva portada"
```

---

### Task 2: `home.js`, el motor del escaparate, con tests

**Files:**
- Create: `tests/home-core.test.js`
- Create: `home.js`

**Interfaces:**
- Produces, en Node (`module.exports`) y en `window.HomeCore`:
  - `clamp(v, min = 0, max = 1)`
  - `lerp(a, b, t)`
  - `smooth(t)`
  - `easeOutExpo(t)`
  - `easeInOut(t)`
  - `sectionProgress(scroll, start, length) → number en [0,1]`
  - `showcaseState(pos, n) → { shown, angle, from, to, mix }`
  - `activeChapter(pos, n, half = 0.42) → índice o -1`
  - `downloadLabel(lang, n) → string`
- Produces, en el navegador: `window.initHome() → { onLang(lang) }`.
- Consumes, del DOM de la Task 3:
  - del hero: `.hero`, `.hero-title`, `.constellation`, `.c-icon` (con `[data-lead]` en el principal) y `.c-move`;
  - del escaparate: `.showcase`, `.chapter` (cada uno con `[data-descargas]` dentro);
  - del escenario: `.stage-slot`, `.stage-icon`, `.stage-flip`, `.stage-face` y `.halo`;
  - del raíl: `.rail button`;
  - del dock: `.dock-section`, `.dock-slot` y `.dock-move`;
  - la clase `js-motion` en `<html>`, que pone el script en línea del `<head>`.

- [ ] **Step 1: Escribir los tests**

<!-- archivo: tests/home-core.test.js -->
```js
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
```

- [ ] **Step 2: Ver que fallan**

Run: `node --test tests/home-core.test.js`
Expected: FAIL con `Cannot find module '../home.js'`.

- [ ] **Step 3: Implementar `home.js`**

<!-- archivo: home.js -->
```js
/**
 * Portada de The White Riggs: escaparate al hacer scroll.
 * El calculo vive en funciones puras (probadas con node --test); initHome solo
 * mide el layout, escribe variables CSS y alterna clases. Toda la geometria visual esta en home.css.
 */
(function (root) {
  'use strict';

  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function sectionProgress(scroll, start, length) {
    return length > 0 ? clamp((scroll - start) / length) : 0;
  }

  // pos recorre 0..n: la parte entera es el capitulo y la decimal, el avance dentro de el.
  // Alrededor de cada frontera entera hay una zona de volteo: el icono saliente gira de 0 a 90
  // grados y el entrante de -90 a 0, mientras los colores se funden.
  const FLIP_ZONE = 0.25;

  function showcaseState(pos, n) {
    const k = Math.round(pos);
    const d = pos - k;
    if (k >= 1 && k <= n - 1 && Math.abs(d) < FLIP_ZONE) {
      const t = (d + FLIP_ZONE) / (2 * FLIP_ZONE);
      return {
        shown: d < 0 ? k - 1 : k,
        angle: d < 0 ? t * 2 * 90 : -(1 - t) * 2 * 90,
        from: k - 1,
        to: k,
        mix: smooth(t)
      };
    }
    const i = clamp(Math.floor(pos), 0, n - 1);
    return { shown: i, angle: 0, from: i, to: i, mix: 0 };
  }

  function activeChapter(pos, n, half = 0.42) {
    const i = Math.floor(pos);
    if (i < 0 || i >= n) return -1;
    return Math.abs(pos - (i + 0.5)) < half ? i : -1;
  }

  const DOWNLOAD_LABEL = {
    es: n => n.toLocaleString('es-ES') + ' descargas en el último año',
    en: n => n.toLocaleString('en-US') + ' downloads in the last year'
  };

  function downloadLabel(lang, n) {
    return (DOWNLOAD_LABEL[lang] || DOWNLOAD_LABEL.en)(n);
  }

  function splitWords(el) {
    const text = el.textContent.trim();
    const words = text.split(/\s+/);
    el.setAttribute('aria-label', text);
    el.textContent = '';
    words.forEach((word, i) => {
      const span = document.createElement('span');
      span.className = 'word';
      span.setAttribute('aria-hidden', 'true');
      span.style.setProperty('--i', i);
      span.textContent = word;
      el.appendChild(span);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.classList.remove('is-revealing');
    void el.offsetWidth;
    el.classList.add('is-revealing');
  }

  function initHome() {
    const doc = document.documentElement;
    const api = { onLang() {} };
    if (!doc.classList.contains('js-motion')) return api;

    try {
      return createShowcase(doc);
    } catch (error) {
      // Si algo falla, mejor la lista estatica que una pagina en blanco.
      doc.classList.remove('js-motion');
      console.error(error);
      return api;
    }
  }

  function createShowcase(doc) {
    const $ = s => document.querySelector(s);
    const $$ = s => Array.from(document.querySelectorAll(s));

    const hero = $('.hero');
    const headline = $('.hero-title');
    const constellation = $('.constellation');
    const constIcons = $$('.constellation .c-icon');
    const leadIcon = $('.constellation .c-icon[data-lead]');
    const showcase = $('.showcase');
    const chapters = $$('.chapter');
    const icon = $('.stage-icon');
    const flipEl = $('.stage-flip');
    const slot = $('.stage-slot');
    const faces = $$('.stage-face');
    const halos = $$('.halo');
    const railBtns = $$('.rail button');
    const dockSection = $('.dock-section');
    const dockSlots = $$('.dock-slot');
    const dockMoves = $$('.dock-move');
    const n = chapters.length;

    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const narrow = window.matchMedia('(max-width: 760px)');

    let L = null;
    let lastY = -1;
    let started = false;
    let shownIdx = -1;
    let activeIdx = -2;
    let velocity = 0;
    let totals = null;
    const counted = new Set();
    const pointer = { x: 0, y: 0 };
    const tilt = { x: 0, y: 0 };
    const parallax = { x: 0, y: 0 };

    // Centro y ancho en coordenadas de documento.
    function docRect(el) {
      const r = el.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 + window.scrollY, w: r.width };
    }

    function docTop(el) {
      return el.getBoundingClientRect().top + window.scrollY;
    }

    function measure() {
      const vh = window.innerHeight;
      const s = slot.getBoundingClientRect();
      const c = docRect(constellation);
      const reach = Math.max(window.innerWidth, vh) * 0.7;
      constIcons.forEach(el => {
        if (el === leadIcon) return;
        const r = docRect(el);
        const dx = r.cx - c.cx;
        const dy = r.cy - c.cy;
        const len = Math.hypot(dx, dy) || 1;
        const move = el.querySelector('.c-move');
        move.style.setProperty('--vx', (dx / len * reach).toFixed(1) + 'px');
        move.style.setProperty('--vy', (dy / len * reach).toFixed(1) + 'px');
      });
      L = {
        vh,
        heroLen: hero.offsetHeight * 0.85,
        showTop: docTop(showcase),
        chapH: chapters[0].offsetHeight,
        dockTop: docTop(dockSection),
        slot: { cx: s.left + s.width / 2, cy: s.top + s.height / 2, w: s.width },
        lead: docRect(leadIcon),
        dock: dockSlots.map(docRect),
        half: narrow.matches ? 0.34 : 0.42
      };
      lastY = -1;
    }

    function setVar(el, name, value) {
      el.style.setProperty(name, value);
    }

    function render(y) {
      const vh = L.vh;
      const pHero = sectionProgress(y, 0, L.heroLen);
      const pos = clamp((y + vh / 2 - L.showTop) / L.chapH, -1, n);
      const pDock = sectionProgress(y + vh, L.dockTop, vh * 0.85);
      const st = showcaseState(clamp(pos, 0, n), n);

      // 1-2. Hero y despegue: el icono del escenario sale exactamente de donde esta el de la constelacion.
      setVar(hero, '--p', pHero.toFixed(4));
      const e = easeInOut(pHero);
      setVar(icon, '--tx', ((L.lead.cx - L.slot.cx) * (1 - e)).toFixed(2) + 'px');
      setVar(icon, '--ty', ((L.lead.cy - y - L.slot.cy) * (1 - e)).toFixed(2) + 'px');
      setVar(icon, '--s', lerp(L.lead.w / L.slot.w, 1, e).toFixed(4));

      // 3. Escaparate: volteo, reflejo y fundido de halos.
      setVar(flipEl, '--flip', st.angle.toFixed(2) + 'deg');
      setVar(icon, '--shine', (pos - Math.floor(pos)).toFixed(4));
      if (st.shown !== shownIdx) {
        shownIdx = st.shown;
        faces.forEach((f, i) => f.classList.toggle('is-shown', i === shownIdx));
        railBtns.forEach((b, i) => {
          b.classList.toggle('is-active', i === shownIdx);
          if (i === shownIdx) b.setAttribute('aria-current', 'true');
          else b.removeAttribute('aria-current');
        });
      }
      const haloAlpha = clamp(pHero * 1.2) * (1 - pDock);
      halos.forEach((h, i) => {
        let a = 0;
        if (i === st.from) a += 1 - st.mix;
        if (i === st.to) a += st.mix;
        h.style.opacity = (Math.min(a, 1) * haloAlpha).toFixed(3);
      });

      const act = activeChapter(pos, n, L.half);
      if (act !== activeIdx) {
        activeIdx = act;
        chapters.forEach((c, i) => c.classList.toggle('is-active', i === act));
        if (act >= 0) countUp(chapters[act]);
      }
      doc.classList.toggle('rail-on', pos > 0.15 && pos < n - 0.1 && pDock === 0);

      // 4. Dock: los cinco iconos salen del escenario y se posan en su sitio.
      doc.classList.toggle('dock-on', pDock > 0);
      setVar(dockSection, '--p', pDock.toFixed(4));
      const ed = easeInOut(pDock);
      dockMoves.forEach((move, i) => {
        const d = L.dock[i];
        setVar(move, '--dx', ((L.slot.cx - d.cx) * (1 - ed)).toFixed(2) + 'px');
        setVar(move, '--dy', ((L.slot.cy - (d.cy - y)) * (1 - ed)).toFixed(2) + 'px');
        setVar(move, '--ds', lerp(L.slot.w / d.w, 1, ed).toFixed(4));
        const visible = pDock === 0 ? 0 : (i === n - 1 ? 1 : clamp(pDock * 2.5));
        setVar(move, '--do', visible.toFixed(3));
      });
    }

    function countUp(chapter) {
      if (counted.has(chapter) || !totals) return;
      const el = chapter.querySelector('[data-descargas]');
      const total = el ? totals[el.getAttribute('data-descargas')] : 0;
      if (!total) return;
      counted.add(chapter);
      const t0 = performance.now();
      (function step(now) {
        const t = clamp((now - t0) / 1200);
        el.textContent = downloadLabel(doc.lang, Math.round(total * easeOutExpo(t)));
        if (t < 1) requestAnimationFrame(step);
      })(t0);
    }

    function updateTilt() {
      const max = canHover ? 10 : 4;
      const targetX = canHover ? -pointer.y * max : clamp(velocity * 0.12, -max, max);
      const targetY = canHover ? pointer.x * max : 0;
      velocity *= 0.85;
      const nx = lerp(tilt.x, targetX, 0.12);
      const ny = lerp(tilt.y, targetY, 0.12);
      if (Math.abs(nx - tilt.x) > 0.005 || Math.abs(ny - tilt.y) > 0.005) {
        tilt.x = nx;
        tilt.y = ny;
        setVar(icon, '--rx', nx.toFixed(3) + 'deg');
        setVar(icon, '--ry', ny.toFixed(3) + 'deg');
      }
      if (canHover) {
        const px = lerp(parallax.x, pointer.x * 14, 0.08);
        const py = lerp(parallax.y, pointer.y * 10, 0.08);
        if (Math.abs(px - parallax.x) > 0.01 || Math.abs(py - parallax.y) > 0.01) {
          parallax.x = px;
          parallax.y = py;
          setVar(hero, '--mx', px.toFixed(2) + 'px');
          setVar(hero, '--my', py.toFixed(2) + 'px');
        }
      }
    }

    function frame() {
      const y = window.scrollY;
      if (y !== lastY) {
        if (lastY >= 0) velocity = y - lastY;
        lastY = y;
        render(y);
      }
      updateTilt();
      requestAnimationFrame(frame);
    }

    function start() {
      measure();
      render(window.scrollY);
      requestAnimationFrame(frame);

      let timer = 0;
      window.addEventListener('resize', () => {
        clearTimeout(timer);
        timer = setTimeout(measure, 150);
      });
      window.addEventListener('load', measure);
      if (canHover) {
        window.addEventListener('pointermove', e => {
          pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
          pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
        }, { passive: true });
      }
      railBtns.forEach((btn, i) => btn.addEventListener('click', () => {
        window.scrollTo({ top: L.showTop + (i + 0.5) * L.chapH - L.vh / 2, behavior: 'smooth' });
      }));

      fetch('data/descargas.json')
        .then(r => (r.ok ? r.json() : null))
        .then(json => {
          totals = json && json.apps;
          if (activeIdx >= 0) countUp(chapters[activeIdx]);
        })
        .catch(() => {});
    }

    return {
      onLang() {
        if (headline) splitWords(headline);
        if (!started) {
          started = true;
          start();
        } else {
          measure();
        }
      }
    };
  }

  const core = { clamp, lerp, smooth, easeOutExpo, easeInOut, sectionProgress, showcaseState, activeChapter, downloadLabel };
  root.HomeCore = core;
  root.initHome = initHome;
  if (typeof module === 'object' && module.exports) module.exports = core;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Ver que pasan**

Run: `node --test tests/home-core.test.js`
Expected: 10 tests, todos en PASS.

- [ ] **Step 5: Commit**

```bash
git add home.js tests/home-core.test.js
git commit -m "Motor del escaparate de la portada, con tests"
```

---

### Task 3: Portada (`index.html` + `home.css`)

**Files:**
- Modify (reescritura completa): `index.html`
- Create: `home.css`

**Interfaces:**
- Consumes: `initHome()` de la Task 2; `initLangSwitcher` e `initDescargas` de `script.js`; los WebP de la Task 1.
- Produces: el DOM y las clases que lista la Task 2.

- [ ] **Step 1: Reescribir `index.html`**

<!-- archivo: index.html -->
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>The White Riggs — Crafting Software with Intention</title>
  <meta name="description" content="The White Riggs is an independent iOS software studio creating elegant, minimal, and purposeful mobile experiences.">

  <meta property="og:title" content="The White Riggs">
  <meta property="og:description" content="Independent iOS studio crafting purposeful software.">
  <meta property="og:type" content="website">

  <link rel="icon" type="image/png" href="assets/riggs-icon-192.png?v=1">
  <link rel="manifest" href="manifest.webmanifest?v=1">
  <link rel="apple-touch-icon" href="assets/riggs-icon-180.png?v=1">
  <meta name="theme-color" content="#000000">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="White Riggs">

  <!-- Antes del primer pintado: decide si hay coreografia o lista estatica. -->
  <script>if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('js-motion');</script>
  <link rel="preload" as="image" href="assets/home/curiosity-512.webp">
  <link rel="stylesheet" href="home.css?v=1">
</head>
<body>

  <header class="site-header">
    <div class="nav">
      <a href="#top" class="brand">
        <img src="assets/home/riggs-256.webp" alt="" width="30" height="30">
        <span>The White Riggs</span>
      </a>
      <nav class="nav-links" aria-label="Secciones">
        <a href="#apps" data-es="Apps" data-en="Apps">Apps</a>
        <a href="#riggs" data-es="Riggs" data-en="Riggs">Riggs</a>
      </nav>
      <div class="lang-toggle" role="group" aria-label="Idioma / Language">
        <button type="button" class="lang-btn" data-lang-btn="es" aria-pressed="false">ES</button>
        <button type="button" class="lang-btn active" data-lang-btn="en" aria-pressed="true">EN</button>
      </div>
    </div>
  </header>

  <!-- Escenario fijo: halo de color e icono heroe. Solo existe con .js-motion. -->
  <div class="stage" aria-hidden="true">
    <div class="halo" style="--c1:196 83 47;--c2:42 15 8"></div>
    <div class="halo" style="--c1:34 168 102;--c2:6 48 26"></div>
    <div class="halo" style="--c1:251 165 0;--c2:58 38 0"></div>
    <div class="halo" style="--c1:93 113 144;--c2:20 26 36"></div>
    <div class="halo" style="--c1:239 118 13;--c2:58 24 4"></div>
    <div class="stage-slot">
      <div class="stage-icon">
        <div class="stage-flip">
          <img class="stage-face is-shown" style="--c1:196 83 47" src="assets/home/curiosity-512.webp" srcset="assets/home/curiosity-512.webp 512w, assets/home/curiosity-1024.webp 1024w" sizes="420px" alt="" width="512" height="512">
          <img class="stage-face" style="--c1:34 168 102" src="assets/home/futline-512.webp" srcset="assets/home/futline-512.webp 512w, assets/home/futline-1024.webp 1024w" sizes="420px" alt="" width="512" height="512" decoding="async">
          <img class="stage-face" style="--c1:251 165 0" src="assets/home/getmeout-512.webp" srcset="assets/home/getmeout-512.webp 512w, assets/home/getmeout-1024.webp 1024w" sizes="420px" alt="" width="512" height="512" decoding="async">
          <img class="stage-face" style="--c1:93 113 144" src="assets/home/escalofrio-512.webp" srcset="assets/home/escalofrio-512.webp 512w, assets/home/escalofrio-1024.webp 1024w" sizes="420px" alt="" width="512" height="512" decoding="async">
          <img class="stage-face" style="--c1:239 118 13" src="assets/home/wyrms-512.webp" srcset="assets/home/wyrms-512.webp 512w, assets/home/wyrms-1024.webp 1024w" sizes="420px" alt="" width="512" height="512" decoding="async">
          <span class="shine"></span>
        </div>
      </div>
    </div>
  </div>

  <nav class="rail" aria-label="Apps">
    <button type="button" aria-label="Curiosity"><img src="assets/home/curiosity-256.webp" alt="" width="32" height="32"></button>
    <button type="button" aria-label="FutLine"><img src="assets/home/futline-256.webp" alt="" width="32" height="32"></button>
    <button type="button" aria-label="GetMeOut! Escape"><img src="assets/home/getmeout-256.webp" alt="" width="32" height="32"></button>
    <button type="button" aria-label="Escalofrío"><img src="assets/home/escalofrio-256.webp" alt="" width="32" height="32"></button>
    <button type="button" aria-label="Wyrms"><img src="assets/home/wyrms-256.webp" alt="" width="32" height="32"></button>
  </nav>

  <main id="top">

    <section class="hero">
      <div class="hero-copy">
        <p class="hero-badge" data-es="Estudio iOS independiente" data-en="Independent iOS Studio">Independent iOS Studio</p>
        <h1 class="hero-title" data-es="La simplicidad es la máxima sofisticación." data-en="Simplicity is the ultimate sophistication.">Simplicity is the ultimate sophistication.</h1>
        <p class="hero-subtitle" data-es="Aplicaciones móviles elegantes y sin distracciones, diseñadas para inspirar y emocionar." data-en="Creating elegant, highly focused mobile applications designed to inspire and delight.">Creating elegant, highly focused mobile applications designed to inspire and delight.</p>
      </div>
      <div class="constellation" aria-hidden="true">
        <div class="c-icon" style="--x:21%;--y:36%;--size:84px;--depth:1.4;--phase:-1.2s"><div class="c-move"><img src="assets/home/futline-256.webp" alt="" width="84" height="84"></div></div>
        <div class="c-icon" style="--x:79%;--y:30%;--size:76px;--depth:1.1;--phase:-3.4s"><div class="c-move"><img src="assets/home/getmeout-256.webp" alt="" width="76" height="76"></div></div>
        <div class="c-icon" style="--x:33%;--y:84%;--size:62px;--depth:0.7;--phase:-5.1s"><div class="c-move"><img src="assets/home/escalofrio-256.webp" alt="" width="62" height="62"></div></div>
        <div class="c-icon" style="--x:67%;--y:82%;--size:70px;--depth:0.9;--phase:-2.3s"><div class="c-move"><img src="assets/home/wyrms-256.webp" alt="" width="70" height="70"></div></div>
        <div class="c-icon" data-lead style="--x:50%;--y:48%;--size:var(--lead-size);--depth:0"><div class="c-move"><img src="assets/home/curiosity-256.webp" srcset="assets/home/curiosity-256.webp 1x, assets/home/curiosity-512.webp 2x" alt="" width="132" height="132"></div></div>
      </div>
      <p class="scroll-hint" data-es="Desliza" data-en="Scroll">Scroll</p>
    </section>

    <section class="showcase" id="apps" aria-label="Apps">

      <article class="chapter" data-app="curiosity">
        <div class="chapter-inner">
          <img class="chapter-icon" src="assets/home/curiosity-256.webp" srcset="assets/home/curiosity-256.webp 1x, assets/home/curiosity-512.webp 2x" alt="" width="112" height="112" loading="lazy">
          <p class="chapter-cat" data-es="Educación y ciencia" data-en="Education &amp; Science">Education &amp; Science</p>
          <h2 class="chapter-name"><span>Curiosity</span></h2>
          <p class="chapter-desc" data-es="Tu dosis diaria de asombro galáctico. Descubre datos curiosos de ciencia, historia y naturaleza en una interfaz inmersiva inspirada en los planetas." data-en="Your daily dose of galactic wonder. Explore curious facts about science, history, and nature with an immersive interface inspired by the planets.">Your daily dose of galactic wonder. Explore curious facts about science, history, and nature with an immersive interface inspired by the planets.</p>
          <p class="chapter-downloads" data-descargas="WhiteRiggs.Curiosity" hidden></p>
          <div class="chapter-actions">
            <a class="btn btn-primary" href="https://apps.apple.com/es/app/curiosity/id6756880503" target="_blank" rel="noopener noreferrer"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg><span>App Store</span></a>
            <a class="btn btn-glass" href="support/curiosity.html"><span data-es="Detalles" data-en="Details">Details</span></a>
          </div>
        </div>
      </article>

      <article class="chapter" data-app="futline">
        <div class="chapter-inner">
          <img class="chapter-icon" src="assets/home/futline-256.webp" srcset="assets/home/futline-256.webp 1x, assets/home/futline-512.webp 2x" alt="" width="112" height="112" loading="lazy">
          <p class="chapter-cat" data-es="Trivial y deportes" data-en="Trivia &amp; Sports">Trivia &amp; Sports</p>
          <h2 class="chapter-name"><span>FutLine</span></h2>
          <p class="chapter-desc" data-es="Coloca cada jugador en su sitio de la historia. Ordena por temporada de debut, goles o partidos en 573 barajas: tu equipo, las grandes competiciones y la historia del fútbol. Tres fallos y te expulsan." data-en="Put every player where they belong in history. Order them by debut season, goals or appearances across 573 decks: your club, the big competitions and the story of football. Three mistakes and you are sent off.">Put every player where they belong in history. Order them by debut season, goals or appearances across 573 decks: your club, the big competitions and the story of football. Three mistakes and you are sent off.</p>
          <p class="chapter-downloads" data-descargas="WhiteRiggs.FutLine" hidden></p>
          <div class="chapter-actions">
            <a class="btn btn-primary" href="https://apps.apple.com/es/app/futline/id6799069857" target="_blank" rel="noopener noreferrer"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg><span>App Store</span></a>
            <a class="btn btn-glass" href="support/futline.html"><span data-es="Detalles" data-en="Details">Details</span></a>
          </div>
        </div>
      </article>

      <article class="chapter" data-app="getmeout">
        <div class="chapter-inner">
          <img class="chapter-icon" src="assets/home/getmeout-256.webp" srcset="assets/home/getmeout-256.webp 1x, assets/home/getmeout-512.webp 2x" alt="" width="112" height="112" loading="lazy">
          <p class="chapter-cat" data-es="Utilidades y productividad" data-en="Utilities &amp; Productivity">Utilities &amp; Productivity</p>
          <h2 class="chapter-name"><span>GetMeOut! Escape</span></h2>
          <p class="chapter-desc" data-es="Tu escape profesional de bolsillo. Genera una excusa creíble con un toque, programa una llamada falsa realista y sal de cualquier momento incómodo con estilo." data-en="Your professional pocket escape. Generate a believable excuse in one tap, schedule a realistic fake call, and walk away from any awkward moment with style.">Your professional pocket escape. Generate a believable excuse in one tap, schedule a realistic fake call, and walk away from any awkward moment with style.</p>
          <p class="chapter-downloads" data-descargas="com.whiteriggs.GetMeOut" hidden></p>
          <div class="chapter-actions">
            <a class="btn btn-primary" href="https://apps.apple.com/es/app/getmeout-escape/id6761269060" target="_blank" rel="noopener noreferrer"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg><span>App Store</span></a>
            <a class="btn btn-glass" href="support/getmeout.html"><span data-es="Detalles" data-en="Details">Details</span></a>
          </div>
        </div>
      </article>

      <article class="chapter" data-app="escalofrio">
        <div class="chapter-inner">
          <img class="chapter-icon" src="assets/home/escalofrio-256.webp" srcset="assets/home/escalofrio-256.webp 1x, assets/home/escalofrio-512.webp 2x" alt="" width="112" height="112" loading="lazy">
          <p class="chapter-cat" data-es="Juegos de mesa" data-en="Board Games">Board Games</p>
          <h2 class="chapter-name"><span>Escalofrío</span></h2>
          <p class="chapter-desc" data-es="Sube al castillo sin perderte de vista. De dos a cuatro jugadores alrededor de un solo iPhone o iPad: en cuanto te echan la sábana por encima, tu peón deja de ser tuyo a la vista de todos y solo tu memoria sabe cuál sigue siendo." data-en="Climb the castle without losing sight of yourself. Two to four players around a single iPhone or iPad: the moment they throw the sheet over your pawn, nobody can tell which one is yours — only your memory knows.">Climb the castle without losing sight of yourself. Two to four players around a single iPhone or iPad: the moment they throw the sheet over your pawn, nobody can tell which one is yours — only your memory knows.</p>
          <p class="chapter-downloads" data-descargas="com.whiteriggs.escalofrio" hidden></p>
          <div class="chapter-actions">
            <a class="btn btn-primary" href="https://apps.apple.com/es/app/escalofrio/id6805952829" target="_blank" rel="noopener noreferrer"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg><span>App Store</span></a>
            <a class="btn btn-glass" href="support/escalofrio.html"><span data-es="Detalles" data-en="Details">Details</span></a>
          </div>
        </div>
      </article>

      <article class="chapter" data-app="wyrms">
        <div class="chapter-inner">
          <img class="chapter-icon" src="assets/home/wyrms-256.webp" srcset="assets/home/wyrms-256.webp 1x, assets/home/wyrms-512.webp 2x" alt="" width="112" height="112" loading="lazy">
          <p class="chapter-cat" data-es="Juegos de mesa" data-en="Board Games">Board Games</p>
          <h2 class="chapter-name"><span>Wyrms</span></h2>
          <p class="chapter-desc" data-es="Carrera de dragones y juego de memoria. Una aventura por turnos para 2 a 4 jugadores, contra amigos o contra la máquina. Lleva a tus dragones alrededor del volcán hasta la victoria." data-en="Dragon Race &amp; Memory Board Game. A turn-based memory adventure for 2 to 4 players, against friends or the CPU. Race your dragons around the volcano to claim victory.">Dragon Race &amp; Memory Board Game. A turn-based memory adventure for 2 to 4 players, against friends or the CPU. Race your dragons around the volcano to claim victory.</p>
          <p class="chapter-downloads" data-descargas="WhiteRiggs.CarreraDeDragones" hidden></p>
          <div class="chapter-actions">
            <a class="btn btn-primary" href="https://apps.apple.com/es/app/wyrms/id6759536991" target="_blank" rel="noopener noreferrer"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg><span>App Store</span></a>
            <a class="btn btn-glass" href="support/wyrms.html"><span data-es="Detalles" data-en="Details">Details</span></a>
          </div>
        </div>
      </article>

    </section>

    <section class="dock-section">
      <h2 class="dock-title" data-es="Cinco apps. Un mismo cuidado." data-en="Five apps. One standard of care.">Five apps. One standard of care.</h2>
      <nav class="dock" aria-label="Apps">
        <a class="dock-item" href="support/curiosity.html"><span class="dock-slot"><span class="dock-move"><img src="assets/home/curiosity-512.webp" alt="" width="72" height="72" loading="lazy"></span></span><span class="dock-label">Curiosity</span></a>
        <a class="dock-item" href="support/futline.html"><span class="dock-slot"><span class="dock-move"><img src="assets/home/futline-512.webp" alt="" width="72" height="72" loading="lazy"></span></span><span class="dock-label">FutLine</span></a>
        <a class="dock-item" href="support/getmeout.html"><span class="dock-slot"><span class="dock-move"><img src="assets/home/getmeout-512.webp" alt="" width="72" height="72" loading="lazy"></span></span><span class="dock-label">GetMeOut!</span></a>
        <a class="dock-item" href="support/escalofrio.html"><span class="dock-slot"><span class="dock-move"><img src="assets/home/escalofrio-512.webp" alt="" width="72" height="72" loading="lazy"></span></span><span class="dock-label">Escalofrío</span></a>
        <a class="dock-item" href="support/wyrms.html"><span class="dock-slot"><span class="dock-move"><img src="assets/home/wyrms-512.webp" alt="" width="72" height="72" loading="lazy"></span></span><span class="dock-label">Wyrms</span></a>
      </nav>
    </section>

    <section class="riggs" id="riggs">
      <img src="assets/home/riggs-256.webp" alt="Riggs" width="96" height="96" loading="lazy">
      <blockquote data-es="«En honor a Riggs, un Golden Retriever blanco cuya lealtad, ternura y alegría inspiran todo lo que se construye bajo esta marca.»" data-en="&quot;Named in honor of Riggs, a white Golden Retriever whose loyalty, warmth, and joyful spirit inspire everything built under this brand.&quot;">"Named in honor of Riggs, a white Golden Retriever whose loyalty, warmth, and joyful spirit inspire everything built under this brand."</blockquote>
      <p class="riggs-sign" data-es="Estudio The White Riggs" data-en="The White Riggs Studio">The White Riggs Studio</p>
    </section>

  </main>

  <footer class="site-footer">
    <div class="footer-inner">
      <p data-es="© 2026 The White Riggs. Todos los derechos reservados." data-en="© 2026 The White Riggs. All rights reserved.">&copy; 2026 The White Riggs. All rights reserved.</p>
      <ul class="footer-links">
        <li><a href="support/curiosity.html" data-es="Soporte de Curiosity" data-en="Curiosity Support">Curiosity Support</a></li>
        <li><a href="support/futline.html" data-es="Soporte de FutLine" data-en="FutLine Support">FutLine Support</a></li>
        <li><a href="support/getmeout.html" data-es="Soporte de GetMeOut" data-en="GetMeOut Support">GetMeOut Support</a></li>
        <li><a href="support/escalofrio.html" data-es="Soporte de Escalofrío" data-en="Escalofrío Support">Escalofrío Support</a></li>
        <li><a href="support/wyrms.html" data-es="Soporte de Wyrms" data-en="Wyrms Support">Wyrms Support</a></li>
      </ul>
    </div>
  </footer>

  <script src="script.js?v=8"></script>
  <script src="home.js?v=1"></script>
  <script>
    const pintarDescargas = initDescargas();
    const home = initHome();
    initLangSwitcher({
      langs: ['es', 'en'],
      probe: 'en',
      fallback: 'en',
      storageKey: 'whiteriggs-lang',
      titles: {
        es: 'The White Riggs — Software hecho con intención',
        en: 'The White Riggs — Crafting Software with Intention'
      },
      onChange: lang => { pintarDescargas(lang); home.onLang(lang); }
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Crear `home.css`**

<!-- archivo: home.css -->
```css
/* Portada de The White Riggs. Las subpaginas siguen con styles.css.
   Sin .js-motion (sin JS o con movimiento reducido) todo es una lista estatica. */

:root {
  --bg: #000;
  --text: #f5f5f7;
  --text-2: #a1a1a6;
  --text-3: #6e6e73;
  --line: rgba(255, 255, 255, 0.12);
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --max: 1200px;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --icon-radius: 22.37%;
  --header-h: 64px;
  --stage-size: min(36vw, 420px);
  --lead-size: 132px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
}

body { line-height: 1.47; letter-spacing: -0.015em; overflow-x: clip; }
img { display: block; max-width: 100%; }
a { color: inherit; }
:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; border-radius: 8px; }

/* ---------- Cabecera ---------- */

.site-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 20;
  height: var(--header-h);
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.nav {
  max-width: var(--max);
  height: 100%;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  gap: 28px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: auto;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-decoration: none;
  white-space: nowrap;
}

.brand img { width: 30px; height: 30px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.2); }

.nav-links { display: flex; gap: 24px; }
.nav-links a { color: var(--text-2); font-size: 14px; text-decoration: none; transition: color 0.3s; }
.nav-links a:hover { color: var(--text); }

.lang-toggle { display: flex; padding: 3px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); }

.lang-btn {
  border: 0;
  background: transparent;
  color: var(--text-2);
  font: 600 12px/1 var(--font);
  letter-spacing: 0.04em;
  padding: 7px 11px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.3s, color 0.3s;
}

.lang-btn.active { background: var(--text); color: #000; }

/* ---------- Escenario fijo ---------- */

.stage { display: none; }

.js-motion .stage {
  display: block;
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

/* Velo que protege el contraste de la columna de texto. */
.js-motion .stage::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.35) 45%, transparent 70%);
}

.halo {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(55% 60% at 72% 50%, rgb(var(--c1) / 0.5), rgb(var(--c2) / 0.85) 45%, #000 82%);
}

.stage-slot {
  position: absolute;
  top: 50%;
  left: calc(50% + min(24vw, 300px));
  width: var(--stage-size);
  aspect-ratio: 1;
  translate: -50% -50%;
  perspective: 1200px;
  z-index: 1;
}

.dock-on .stage-slot { visibility: hidden; }

.stage-icon {
  width: 100%;
  height: 100%;
  transform: translate3d(var(--tx, 0px), var(--ty, 0px), 0) scale(var(--s, 1)) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
  transform-style: preserve-3d;
  will-change: transform;
}

.stage-flip {
  position: relative;
  width: 100%;
  height: 100%;
  transform: rotateY(var(--flip, 0deg));
  transform-style: preserve-3d;
}

.stage-face {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: var(--icon-radius);
  opacity: 0;
  box-shadow: 0 30px 90px -10px rgb(var(--c1) / 0.55), 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.stage-face.is-shown { opacity: 1; }

.shine {
  position: absolute;
  inset: 0;
  border-radius: var(--icon-radius);
  overflow: hidden;
}

.shine::before {
  content: "";
  position: absolute;
  inset: -20% -60%;
  background: linear-gradient(115deg, transparent 42%, rgba(255, 255, 255, 0.18) 50%, transparent 58%);
  transform: translateX(calc((var(--shine, 0) * 2 - 1) * 45%));
}

/* ---------- Capas de contenido ---------- */

main, .site-footer { position: relative; z-index: 1; }

/* ---------- Hero ---------- */

.hero {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 40px;
  padding: calc(var(--header-h) + 40px) 24px 64px;
  text-align: center;
  position: relative;
}

.hero-copy { max-width: 1000px; }

.js-motion .hero-copy {
  transform: translate3d(0, calc(var(--p, 0) * -80px), 0);
  opacity: calc(1 - var(--p, 0) * 2);
}

.hero-badge {
  display: inline-block;
  margin-bottom: 28px;
  padding: 8px 16px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.hero-title {
  font-size: clamp(44px, 8.4vw, 112px);
  font-weight: 800;
  line-height: 0.98;
  letter-spacing: -0.045em;
  text-wrap: balance;
}

.hero-subtitle {
  max-width: 620px;
  margin: 24px auto 0;
  color: var(--text-2);
  font-size: clamp(17px, 2vw, 21px);
  text-wrap: pretty;
}

.word { display: inline-block; }

.js-motion .hero-title.is-revealing .word {
  animation: word-in 1.1s var(--ease) both;
  animation-delay: calc(var(--i) * 70ms + 100ms);
}

.js-motion .hero-badge,
.js-motion .hero-subtitle {
  animation: fade-up 1.1s var(--ease) both;
  animation-delay: 0.75s;
}

@keyframes word-in {
  from { opacity: 0; filter: blur(12px); transform: translateY(0.18em); }
  to { opacity: 1; filter: blur(0); transform: none; }
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: none; }
}

.constellation { position: relative; width: min(760px, 100%); height: 240px; }

.c-icon {
  position: absolute;
  left: var(--x);
  top: var(--y);
  width: var(--size);
  aspect-ratio: 1;
  translate: -50% -50%;
}

.c-move { width: 100%; height: 100%; }

.js-motion .c-move {
  transform: translate3d(
    calc(var(--vx, 0px) * var(--p, 0) + var(--mx, 0px) * var(--depth, 1)),
    calc(var(--vy, 0px) * var(--p, 0) + var(--my, 0px) * var(--depth, 1)),
    0);
  opacity: calc(1 - var(--p, 0) * 1.6);
}

.c-icon img {
  width: 100%;
  height: 100%;
  border-radius: var(--icon-radius);
  box-shadow: 0 18px 40px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.js-motion .c-icon:not([data-lead]) img {
  animation: float 7s ease-in-out infinite;
  animation-delay: var(--phase, 0s);
}

/* El icono principal lo sustituye el del escenario, que sale exactamente de aqui. */
.js-motion .c-icon[data-lead] { visibility: hidden; }

@keyframes float {
  50% { transform: translateY(-8px); }
}

.scroll-hint {
  position: absolute;
  bottom: 28px;
  left: 50%;
  translate: -50% 0;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.scroll-hint::after {
  content: "";
  display: block;
  width: 1px;
  height: 28px;
  margin: 10px auto 0;
  background: linear-gradient(var(--text-3), transparent);
}

.js-motion .scroll-hint { opacity: calc(1 - var(--p, 0) * 8); }

/* ---------- Capitulos ---------- */

.chapter { padding: 72px 24px; }
.chapter-inner { max-width: var(--max); margin: 0 auto; }

.chapter-icon {
  width: 112px;
  height: 112px;
  margin-bottom: 24px;
  border-radius: var(--icon-radius);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1);
}

.chapter-cat {
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.chapter-name {
  margin: 10px 0 18px;
  padding-bottom: 0.08em;
  overflow: hidden;
  font-size: clamp(44px, 6.4vw, 96px);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.045em;
}

.chapter-name span { display: block; }

.chapter-desc {
  max-width: 520px;
  color: var(--text-2);
  font-size: clamp(17px, 1.6vw, 21px);
  text-wrap: pretty;
}

.chapter-downloads {
  margin-top: 18px;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.chapter-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }

.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 22px;
  border-radius: 999px;
  font: 600 15px/1 var(--font);
  text-decoration: none;
  transition: transform 0.3s var(--ease), background 0.3s;
}

.btn:hover { transform: translateY(-2px); }
.btn-primary { background: var(--text); color: #000; }

.btn-glass {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.btn-glass:hover { background: rgba(255, 255, 255, 0.16); }

.js-motion .chapter {
  min-height: 120vh;
  display: flex;
  align-items: center;
  padding: 0 24px;
}

.js-motion .chapter-inner { width: 100%; }
.js-motion .chapter-inner > * { max-width: min(46vw, 540px); }
.js-motion .chapter-icon { display: none; }

.js-motion .chapter-name span {
  transform: translateY(105%);
  transition: transform 1s var(--ease);
}

.js-motion :is(.chapter-cat, .chapter-desc, .chapter-downloads, .chapter-actions) {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.7s var(--ease), transform 0.7s var(--ease);
}

.js-motion :is(.chapter.is-active, .chapter:focus-within) .chapter-name span { transform: none; }

.js-motion :is(.chapter.is-active, .chapter:focus-within) :is(.chapter-cat, .chapter-desc, .chapter-downloads, .chapter-actions) {
  opacity: 1;
  transform: none;
}

.js-motion .chapter.is-active .chapter-desc { transition-delay: 0.15s; }
.js-motion .chapter.is-active .chapter-downloads { transition-delay: 0.25s; }
.js-motion .chapter.is-active .chapter-actions { transition-delay: 0.35s; }

/* ---------- Rail ---------- */

.rail { display: none; }

@media (min-width: 1024px) {
  .js-motion .rail {
    position: fixed;
    top: 50%;
    right: 24px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 10px;
    translate: 0 -50%;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.5s;
  }

  .js-motion.rail-on .rail { opacity: 1; pointer-events: auto; }
}

.rail button {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: none;
  cursor: pointer;
  opacity: 0.35;
  transform: scale(0.82);
  transition: opacity 0.4s, transform 0.4s var(--ease);
}

.rail button img { width: 100%; height: 100%; border-radius: var(--icon-radius); }
.rail button.is-active, .rail button:hover, .rail button:focus-visible { opacity: 1; transform: none; }

/* ---------- Dock ---------- */

.dock-section {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 48px;
  padding: 96px 24px;
  text-align: center;
}

.dock-title {
  font-size: clamp(36px, 5.6vw, 72px);
  font-weight: 800;
  line-height: 1.02;
  letter-spacing: -0.04em;
  text-wrap: balance;
}

.js-motion .dock-title {
  opacity: calc((var(--p, 0) - 0.55) * 2.4);
  transform: translateY(calc((1 - var(--p, 0)) * 30px));
}

.dock {
  position: relative;
  display: flex;
  gap: 18px;
  padding: 16px 20px;
}

/* El cristal va en un pseudo: si la opacidad estuviera en .dock, apagaria tambien los iconos en vuelo. */
.dock::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
}

.js-motion .dock::before { opacity: calc((var(--p, 0) - 0.6) * 2.5); }

.dock-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-decoration: none;
}

.dock-slot { display: block; width: 72px; height: 72px; }
.dock-move { display: block; width: 100%; height: 100%; }

.js-motion .dock-move {
  transform: translate3d(var(--dx, 0px), var(--dy, 0px), 0) scale(var(--ds, 1));
  opacity: var(--do, 1);
}

.dock-move img {
  width: 100%;
  height: 100%;
  border-radius: var(--icon-radius);
  transform-origin: 50% 100%;
  transition: scale 0.35s var(--ease);
}

/* Magnificacion del dock de macOS: el icono crece y los vecinos lo acompañan. */
.dock-item:hover .dock-move img,
.dock-item:focus-visible .dock-move img { scale: 1.18; }
.dock-item:hover + .dock-item .dock-move img,
.dock-item:has(+ .dock-item:hover) .dock-move img { scale: 1.07; }

.dock-label { color: var(--text-2); font-size: 12px; }
.js-motion .dock-label { opacity: calc((var(--p, 0) - 0.7) * 3.3); }

/* ---------- Riggs y pie ---------- */

.riggs { max-width: 860px; margin: 0 auto; padding: 120px 24px 140px; text-align: center; }

.riggs img {
  width: 96px;
  height: 96px;
  margin: 0 auto 32px;
  border-radius: 50%;
  border: 1px solid var(--line);
}

.riggs blockquote {
  color: var(--text-2);
  font-size: clamp(22px, 3vw, 34px);
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.riggs-sign { margin-top: 24px; color: var(--text-3); font-size: 14px; }

.site-footer {
  padding: 32px 24px 48px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-3);
  font-size: 12px;
}

.footer-inner {
  max-width: var(--max);
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 16px 32px;
}

.footer-links { display: flex; flex-wrap: wrap; gap: 8px 20px; list-style: none; }
.footer-links a { color: var(--text-2); text-decoration: none; }
.footer-links a:hover { color: var(--text); }

/* ---------- Movil ---------- */

@media (max-width: 760px) {
  :root {
    --stage-size: min(52vw, 230px);
    --lead-size: 104px;
    --stage-top: calc(var(--header-h) + 3vh);
  }

  .nav { gap: 16px; padding: 0 16px; }
  .nav-links { display: none; }
  .brand { font-size: 16px; }

  .constellation { height: 200px; }

  .stage-slot { top: calc(var(--stage-top) + var(--stage-size) / 2); left: 50%; }

  .halo { background: radial-gradient(85% 45% at 50% 24%, rgb(var(--c1) / 0.5), rgb(var(--c2) / 0.85) 50%, #000 88%); }

  .js-motion .stage::after { background: linear-gradient(180deg, transparent 35%, rgba(0, 0, 0, 0.55) 60%); }

  .js-motion .chapter { align-items: flex-start; padding: 0 20px; }

  .js-motion .chapter-inner {
    position: sticky;
    top: calc(var(--stage-top) + var(--stage-size) + 28px);
  }

  .js-motion .chapter-inner > * { max-width: none; }

  .chapter-name { font-size: clamp(40px, 12vw, 60px); }

  .dock { gap: 10px; padding: 12px 14px; }
  .dock::before { border-radius: 26px; }
  .dock-slot { width: 52px; height: 52px; }
  .dock-label { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 3: Verificar en el navegador**

Run: `python3 -m http.server 8811 --bind 127.0.0.1` y abrir `http://127.0.0.1:8811/`.
Expected:
- A 1440 px: el titular aparece palabra a palabra y se ve la constelación. Al bajar, Curiosity vuela a la derecha y el halo se tiñe de óxido. En las fronteras entre apps el icono voltea y el color se funde. El dock reúne los cinco iconos y después llegan Riggs y el pie.
- A 390 px: el icono queda arriba, el texto pegado debajo, y no hay solapes.
- La consola no muestra errores.

- [ ] **Step 4: Commit**

```bash
git add index.html home.css
git commit -m "Nueva portada: escaparate al hacer scroll"
```

---

### Task 4: Service worker y verificación final

**Files:**
- Modify: `sw.js:3-11`

- [ ] **Step 1: Actualizar el precache**

Sustituir las líneas 3–11 de `sw.js` por:

```js
const CACHE = 'riggs-v2';
const PRECACHE = [
  './',
  './index.html',
  './home.css',
  './home.js',
  './script.js',
  './styles.css',
  './assets/riggs-icon-192.png',
  './assets/riggs-icon-512.png',
  './assets/home/riggs-256.webp',
  './assets/home/curiosity-512.webp',
  './assets/home/futline-512.webp',
  './assets/home/getmeout-512.webp',
  './assets/home/escalofrio-512.webp',
  './assets/home/wyrms-512.webp'
];
```

- [ ] **Step 2: Verificación completa** (la lista de la spec)

1. Capturas a 1440, 820 y 390 px: hero, despegue, cada capítulo, un volteo a medias, el dock y el pie.
2. Reduced motion emulado y JS desactivado: lista estática legible.
3. ES ↔ EN: textos, titular animado de nuevo y cifras en el formato de cada idioma.
4. Enlaces: App Store (5), Detalles (5), dock (5) y pie (5).
5. `git diff --stat HEAD~4 -- styles.css script.js support privacy` no muestra cambios.
6. `node --test tests/home-core.test.js` en verde.

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "Service worker: precache de la nueva portada"
```

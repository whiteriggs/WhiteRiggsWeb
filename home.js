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

  // En movil el texto vive fijo bajo el icono: siempre tiene que haber una app activa.
  function activeHalf(narrow) {
    return narrow ? 0.5 : 0.42;
  }

  // Texto de movil guiado por el scroll. d es la distancia al centro del capitulo (en capitulos):
  // pleno mientras |d| < TEXT_HOLD y se apaga hasta 0 en la frontera (|d| = 0,5), justo cuando el
  // icono esta de canto. El CSS usa d para desplazar cada capa a su propia velocidad.
  const TEXT_HOLD = 0.12;

  function textState(pos, i) {
    const d = pos - (i + 0.5);
    return { opacity: clamp(1 - (Math.abs(d) - TEXT_HOLD) / (0.5 - TEXT_HOLD)), d };
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
    const chapterInners = $$('.chapter-inner');
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
        half: activeHalf(narrow.matches),
        narrow: narrow.matches
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
      if (L.narrow) {
        chapterInners.forEach((el, i) => {
          const t = textState(pos, i);
          setVar(el, '--o', t.opacity.toFixed(3));
          setVar(el, '--d', t.d.toFixed(4));
        });
      }

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

  const core = { clamp, lerp, smooth, easeOutExpo, easeInOut, sectionProgress, showcaseState, activeChapter, activeHalf, textState, downloadLabel };
  root.HomeCore = core;
  root.initHome = initHome;
  if (typeof module === 'object' && module.exports) module.exports = core;
})(typeof window !== 'undefined' ? window : globalThis);

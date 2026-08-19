/**
 * Conmutador de idioma reutilizable.
 * Traduce todo elemento con data-<lang>, y ademas href y alt via data-href-<lang> / data-alt-<lang>.
 * El idioma se resuelve por ?lang=, localStorage, idioma del navegador y, por ultimo, fallback.
 */
function initLangSwitcher(options) {
  const langs = options.langs;
  const fallback = options.fallback || langs[0];
  const titles = options.titles || {};
  const storageKey = options.storageKey;
  const probe = options.probe || langs[0];

  function apply(lang) {
    if (langs.indexOf(lang) === -1) lang = fallback;
    document.documentElement.lang = lang;
    try { localStorage.setItem(storageKey, lang); } catch (e) {}
    if (titles[lang]) document.title = titles[lang];

    document.querySelectorAll('[data-' + probe + ']').forEach(el => {
      const value = el.getAttribute('data-' + lang);
      if (value !== null) el.textContent = value;
    });
    document.querySelectorAll('[data-href-' + probe + ']').forEach(el => {
      const value = el.getAttribute('data-href-' + lang);
      if (value !== null) el.setAttribute('href', value);
    });
    document.querySelectorAll('[data-alt-' + probe + ']').forEach(el => {
      const value = el.getAttribute('data-alt-' + lang);
      if (value !== null) el.setAttribute('alt', value);
    });
    document.querySelectorAll('[data-lang-btn]').forEach(btn => {
      const isActive = btn.getAttribute('data-lang-btn') === lang;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    if (options.onChange) options.onChange(lang);
  }

  function resolveInitial() {
    let requested = null;
    try { requested = new URLSearchParams(window.location.search).get('lang'); } catch (e) {}
    if (requested && langs.indexOf(requested) !== -1) return requested;
    let saved = null;
    try { saved = localStorage.getItem(storageKey); } catch (e) {}
    if (saved && langs.indexOf(saved) !== -1) return saved;
    const browser = (navigator.language || fallback).slice(0, 2).toLowerCase();
    return langs.indexOf(browser) !== -1 ? browser : fallback;
  }

  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-lang-btn]');
    if (!btn) return;
    event.preventDefault();
    apply(btn.getAttribute('data-lang-btn'));
  });

  apply(resolveInitial());
  return apply;
}

/**
 * Rellena los contadores de descargas con data/descargas.json.
 * Devuelve la funcion de repintado para engancharla al cambio de idioma.
 * Una app sin dato o con cero se queda oculta: mejor nada que un cero.
 */
function initDescargas() {
  const marcas = document.querySelectorAll('[data-descargas]');
  if (!marcas.length) return () => {};

  let datos = null;
  const rotulo = {
    es: n => n.toLocaleString('es-ES') + ' descargas en el último año',
    en: n => n.toLocaleString('en-US') + ' downloads in the last year'
  };

  function pintar(lang) {
    if (!datos) return;
    const texto = rotulo[lang] || rotulo.en;
    marcas.forEach(el => {
      const total = datos.apps[el.getAttribute('data-descargas')];
      if (!total) return;
      el.textContent = texto(total);
      el.hidden = false;
    });
  }

  fetch('data/descargas.json')
    .then(respuesta => respuesta.ok ? respuesta.json() : Promise.reject())
    .then(json => { datos = json; pintar(document.documentElement.lang); })
    .catch(() => {});

  return pintar;
}

document.addEventListener('DOMContentLoaded', () => {
  // Scroll animation observer
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.fade-in').forEach(el => {
    observer.observe(el);
  });

  // Dynamic header blur effect on scroll
  const header = document.querySelector('header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.style.borderBottomColor = 'rgba(255, 255, 255, 0.12)';
    } else {
      header.style.borderBottomColor = 'rgba(255, 255, 255, 0.08)';
    }
  });

  // PWA: solo en la home, que es donde vive el manifest.
  if ('serviceWorker' in navigator && document.querySelector('link[rel="manifest"]')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});

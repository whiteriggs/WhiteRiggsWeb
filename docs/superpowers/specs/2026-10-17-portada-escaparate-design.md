# Portada de The White Riggs: escaparate al hacer scroll

Fecha: 2026-10-17
Estado: pendiente de revisión

## Objetivo

Rehacer la portada (`index.html`) para que sea profesional y sofisticada, y sorprenda. Las cinco apps
del estudio se presentan como capítulos de una historia que avanza con el scroll, al estilo de
apple.com: el icono de la app se queda fijo y la animación sigue el desplazamiento fotograma a
fotograma.

## Alcance

- Dentro: solo la portada. Archivos nuevos `home.css`, `home.js` e iconos WebP en `assets/home/`.
  Se reescribe `index.html` y se retocan `sw.js` y `.gitignore`.
- Fuera: las 11 páginas de `support/` y `privacy/`, `styles.css` y `script.js`. Ninguno se modifica,
  y las subpáginas deben verse exactamente igual que antes.
- Apps en portada (por descargas del último año): Curiosity, FutLine, GetMeOut! Escape,
  Escalofrío y Wyrms. LYVARA y el resto no aparecen.
- Sin capturas de pantalla: cada app se representa solo con su icono.
- Titular: se mantiene «La simplicidad es la máxima sofisticación.» /
  "Simplicity is the ultimate sophistication."

## Restricciones técnicas

- Sitio estático en GitHub Pages: sin build, sin frameworks, sin dependencias de terceros.
- Solo se animan `transform`, `opacity` y variables CSS que alimentan esas dos propiedades. El
  objetivo son 60 fps en un iPhone de gama media.
- Navegadores objetivo: Safari iOS/macOS 17 o superior, Chrome y Firefox actuales. Nada depende de
  `animation-timeline`.

## Coreografía

Paleta base: negro `#000`, texto `#f5f5f7`, secundario `#a1a1a6`. Tipografía del sistema
(SF Pro en Apple), con títulos en extrabold (800) y tracking negativo.

Color de acento de cada app, extraído de su icono:

| App | `--c1` (halo vivo) | `--c2` (fondo profundo) |
|---|---|---|
| Curiosity | `#c4532f` | `#2a0f08` |
| FutLine | `#22a866` | `#06301a` |
| GetMeOut! Escape | `#fba500` | `#3a2600` |
| Escalofrío | `#5d7190` | `#141a24` |
| Wyrms | `#ef760d` | `#3a1804` |

### 1. Entrada (hero, 100vh)

- El titular aparece palabra a palabra: cada palabra pasa de `blur(12px)` y `opacity 0` a nítida,
  escalonadas cada 70 ms. Es una animación de carga, no de scroll.
- Subtítulo y etiqueta «Estudio iOS independiente» entran después con un fundido.
- Debajo, los 5 iconos forman una constelación suelta a tres profundidades (tres escalas). Flotan
  despacio (desplazamiento senoidal de ±6 px con distinta fase para cada uno) y, en escritorio,
  responden al cursor con un parallax proporcional a su profundidad.
- Abajo del todo, una pista «Desliza» / "Scroll" que se desvanece en cuanto hay scroll.

### 2. Despegue (transición hero → escaparate, ~100vh de scroll)

Guiado por el progreso `p` de 0 a 1:

- El titular sube 80 px y se desvanece entre `p` = 0 y 0,5.
- Los iconos de FutLine, GetMeOut, Escalofrío y Wyrms se alejan hacia fuera del encuadre, cada uno
  según su vector de posición, con fundido.
- El icono de Curiosity se interpola desde su posición en la constelación hasta la posición fija del
  escaparate, creciendo hasta el tamaño héroe.
- El halo de fondo pasa de negro al `--c1` de Curiosity.

### 3. Escaparate (5 capítulos de ~120vh cada uno)

Hay un escenario `position: sticky` con el icono héroe y el halo. Los textos de cada capítulo pasan
por debajo con el scroll normal.

- **Icono héroe.** Mide `min(42vw, 440px)` en escritorio y `min(56vw, 260px)` en móvil, con
  `border-radius` del 22,37 % (la forma de icono de iOS). Lleva una sombra difusa en el `--c1` de la
  app y un borde de 1 px blanco al 12 %.
- **Inclinación 3D.** En escritorio sigue al cursor (máximo ±10°, suavizado con lerp de 0,12). En
  móvil hay una inclinación leve ligada a la velocidad de scroll (máximo ±4°).
- **Reflejo.** Un brillo diagonal (`linear-gradient` a 115°, blanco al 0–18 %) recorre el icono
  según el progreso del capítulo.
- **Cambio de app** (el último 25 % de un capítulo y el primer 25 % del siguiente):
  - Volteo tipo moneda: el icono saliente gira `rotateY` de 0° a 90° y el entrante de -90° a 0°,
    con `perspective: 1200px`.
  - Los colores del halo `--c1`/`--c2` se interpolan en RGB de forma continua entre las dos apps.
  - Todo es reversible: al subir, el volteo se reproduce al revés.
- **Texto del capítulo** (columna izquierda en escritorio, bajo el icono en móvil):
  - Categoría en mayúsculas pequeñas.
  - Nombre de la app en extrabold gigante (`clamp(48px, 8vw, 112px)`), que sube desde detrás de una
    máscara (`translateY(100%)` → 0, con `overflow: hidden` en el contenedor).
  - Descripción con fundido y 20 px de subida.
  - Descargas: «607 descargas en el último año». El número cuenta de 0 al total en 1,2 s con
    `easeOutExpo` la primera vez que el capítulo llega al centro. Si la app no tiene dato, la línea
    sigue oculta.
  - Botones «App Store» (primario, blanco) y «Detalles» (secundario, cristal).
- **Raíl lateral** (solo en escritorio, a la derecha): 5 mini iconos con un indicador de progreso.
  Al pulsar uno, la página se desplaza suavemente al inicio de ese capítulo. Tiene `aria-label` con
  el nombre de la app.

### 4. Final: el dock (~100vh)

- Los 5 iconos convergen desde la posición del icono héroe hasta una fila sobre una franja de
  cristal (`backdrop-filter: blur(30px) saturate(180%)`, fondo blanco al 8 %, radio de 32 px), al
  estilo del dock del iPhone.
- El halo se apaga hacia negro.
- Cada icono del dock enlaza a la ficha de la app (`support/<app>.html`). Al pasar el cursor se
  amplía (escala 1,15) y empuja ligeramente a los vecinos, como la magnificación del dock de macOS.
- Encima, el texto «Cinco apps. Un mismo cuidado.» / "Five apps. One standard of care."

### 5. Riggs y pie

- Sección de Riggs: avatar y la cita actual, con un estilo nuevo (texto grande en blanco
  secundario, sin tarjeta).
- Pie: copyright y los enlaces de soporte actuales.

## Arquitectura

### `index.html`

- Estructura semántica: `header`, `main` > `section.hero`, `section.showcase` (con
  `div.stage[sticky]` y cinco `article.chapter`), `section.dock`, `section.riggs`, y `footer`.
- Cada capítulo lleva sus datos en atributos y variables:
  `<article class="chapter" data-app="curiosity" style="--c1:#c4532f;--c2:#2a0f08">`.
  El icono, el nombre, la descripción y la línea `<p data-descargas="WhiteRiggs.Curiosity" hidden>`
  están en el propio HTML. Para añadir una app basta con copiar un bloque, sin tocar JS.
- Los textos traducibles usan `data-es`/`data-en`, como hoy.
- En `<head>` carga `home.css` y ya no carga `styles.css`.
- Al final de `<body>`, en este orden y sin `defer`:
  1. `script.js` (intacto);
  2. `home.js`, que expone `initHome()`;
  3. un script en línea que hace:

     ```js
     const pintar = initDescargas();
     const home = initHome();
     initLangSwitcher({ ..., onChange: lang => { pintar(lang); home.onLang(lang); } });
     ```

  `initHome()` devuelve un objeto con `onLang` y no arranca animaciones de entrada hasta la primera
  llamada a `onLang`, para no animar el titular dos veces.

### `home.js`

Módulos pequeños, cada uno una función con una sola responsabilidad:

- **`createScrollEngine()`.** Mide `offsetTop`/`offsetHeight` de las secciones al iniciar y en cada
  `resize` (con debounce de 150 ms). En el bucle de `requestAnimationFrame`, solo cuando cambia
  `scrollY`, calcula para cada sección `p ∈ [0,1]` y avisa a los suscriptores. No lee el layout
  dentro del bucle.
- **`revealHeadline(el)`.** Parte el titular en palabras (`span`) y lanza la entrada escalonada. Se
  vuelve a ejecutar en el `onChange` del idioma.
- **`constellation()`.** Flotación y parallax de cursor del hero.
- **`liftoff(p)`.** La transición del hero al escaparate.
- **`showcase(p)`.** Calcula el capítulo activo y el progreso local, el volteo, la mezcla de colores y
  el reflejo, y escribe variables CSS en `.stage`.
- **`tilt()`.** Inclinación 3D con lerp, desactivada en dispositivos sin `hover`.
- **`countUp(el)`.** Lee el total de `data/descargas.json`, que es el mismo dato que pinta
  `initDescargas`, y anima el número formateado con `toLocaleString` según el idioma actual.
- **`rail()`** y **`dock(p)`.**

Contrato con el CSS: JS escribe solo variables CSS (`--p`, `--flip`, `--c1`, `--c2`, `--tx`, `--ty`,
`--shine`…) y clases de estado (`is-active`, `is-revealed`). Toda la geometría visual vive en
`home.css`.

### `home.css`

Tokens en `:root`, una sección por escena y una capa final con `@media (max-width: 760px)` para
móvil y `@media (prefers-reduced-motion: reduce)`.

### Iconos

`scripts/home_icons.py` (Pillow) genera `assets/home/<app>-512.webp` y `<app>-256.webp`
(calidad 82). El HTML los usa con `srcset`. Se espera menos de 80 KB por icono a 512 px.

### `sw.js`

`CACHE = 'riggs-v2'`. Se añaden al precache `home.css`, `home.js` y los cinco
`assets/home/*-512.webp`.

## Accesibilidad y degradación

- **`prefers-reduced-motion: reduce`.** Sin volteo, sin scrubbing, sin parallax, sin flotación y sin
  conteo: las cifras de descargas se muestran directamente con su valor final. Los capítulos se
  muestran como bloques estáticos (icono y texto) y el escenario fijo desaparece.
- **Sin JS.** El HTML base es una lista legible de capítulos, cada uno con su icono, texto y botones.
  El escenario fijo se activa solo cuando `home.js` añade `html.js-motion`.
- **Teclado.** Todos los enlaces y botones son alcanzables y tienen `:focus-visible` visible. El
  volteo no debe ocultar el foco.
- **Lectores de pantalla.** Los iconos decorativos del escenario y de la constelación llevan `alt=""`
  y `aria-hidden`. Los capítulos tienen `h2` con el nombre de la app.
- **Contraste.** El texto principal sobre los halos debe mantener un contraste mínimo de 4,5:1. Una
  capa negra al 55 % detrás de la columna de texto lo garantiza.

## Verificación

El repositorio no tiene tests; la verificación es manual y con capturas.

1. Servidor local y navegador integrado, a 1440, 820 y 390 px de ancho. Capturas del hero, del
   despegue, de cada capítulo, de una transición a mitad del volteo, del dock y del pie.
2. Reduced motion emulado: bloques estáticos legibles.
3. JS desactivado: lista legible con enlaces operativos.
4. ES ↔ EN: textos, titular animado y cifras de descargas en el formato de cada idioma.
5. Enlaces: App Store (5), Detalles (5), dock (5) y pie (5).
6. Las subpáginas (`support/*.html` y `privacy/*.html`) siguen idénticas: capturas antes y después
   de `support/curiosity.html` y `support/wyrms.html`.
7. Rendimiento: scroll completo sin saltos de layout (CLS = 0) y pesos de iconos dentro del objetivo.

// ─── Kit · viewer v1 ── the same in every recipe · postext.dev/cookbook ───────
/** Shows the pages as facing spreads on a dark desk: the first page is a
 *  recto on its own, then verso | recto pairs, as in a bound book. Pages
 *  are painted when they scroll near the screen. */
function showPages(docs, { title, width = 460 } = {}) {
  const root = viewer(title);
  const pages = [docs].flat().flatMap((doc) =>
    doc.pages.map((page) => ({ doc, page, n: (doc.pageIndexOffset ?? 0) + page.index })));
  const spreads = [];
  let verso = null;
  for (const p of pages) {
    if (p.n % 2 === 1) { if (verso) spreads.push([verso, null]); verso = p; }
    else { spreads.push([verso, p]); verso = null; }
  }
  if (verso) spreads.push([verso, null]);
  const density = Math.min(window.devicePixelRatio || 1, 2);
  showPages.painter?.disconnect();
  const painter = new IntersectionObserver((entries) => {
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting) continue;
      painter.unobserve(target);
      const { doc, page } = target.postext;
      renderPageToCanvas(page, doc, target, { scale: (width * density) / page.width });
    }
  }, { rootMargin: '800px' });
  showPages.painter = painter;
  root.replaceChildren(...spreads.map((pair) => {
    const spread = document.createElement('div');
    spread.className = 'pt-spread';
    for (const p of pair) {
      const figure = document.createElement('figure');
      if (p) {
        const label = p.page.pageLabel || String(p.n + 1);
        const canvas = document.createElement('canvas');
        canvas.postext = p;
        canvas.style.aspectRatio = `${p.page.width} / ${p.page.height}`;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Page ${label}`);
        const folio = document.createElement('figcaption');
        folio.textContent = label;
        figure.append(canvas, folio);
        painter.observe(canvas);
      } else figure.className = 'pt-blank';
      spread.append(figure);
    }
    return spread;
  }));
  kitStatus(`${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`);
  document.documentElement.dataset.postext = 'ready';
  return pages.length;
}

/** The desk, the bar and the error reporting, created once. */
function viewer(title) {
  if (!document.getElementById('pt-kit')) {
    document.head.insertAdjacentHTML('beforeend', `<style id="pt-kit">
      :root { color-scheme: dark; }
      body { margin: 0; background: #0e1014; color: #b9bcc4; font: 13px/1.45 system-ui, sans-serif; }
      #pt-bar { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; align-items: center;
        gap: 6px 16px; padding: 10px 16px; background: rgb(14 16 20 / .92); backdrop-filter: blur(6px);
        border-bottom: 1px solid #23262d; }
      #pt-bar strong { color: #f4f1ea; font-weight: 600; }
      #pt-actions { display: flex; gap: 12px; margin-left: auto; }
      #pt-actions a, #pt-actions button { color: #d8a21a; font: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
      #pages { display: grid; justify-items: center; gap: 48px; padding: 32px 16px 72px; }
      .pt-spread { display: flex; }
      .pt-spread figure { margin: 0; width: min(460px, 44vw); }
      .pt-spread canvas { display: block; width: 100%; background: #fff;
        box-shadow: 0 1px 2px rgb(0 0 0 / .5), 0 22px 44px -16px rgb(0 0 0 / .8); }
      .pt-spread figure:first-child canvas { box-shadow: inset -14px 0 14px -14px rgb(0 0 0 / .18), 0 1px 2px rgb(0 0 0 / .5), 0 22px 44px -16px rgb(0 0 0 / .8); }
      .pt-spread figcaption { margin-top: 10px; text-align: center; font: 600 10px/1 system-ui, sans-serif;
        letter-spacing: .18em; text-transform: uppercase; color: #6c7079; }
      .pt-blank { visibility: hidden; }
      @media (max-width: 760px) {
        .pt-spread { flex-direction: column; gap: 32px; }
        .pt-spread figure { width: min(460px, 92vw); }
        .pt-blank { display: none; }
      }
    </style>`);
    document.body.insertAdjacentHTML('afterbegin',
      '<header id="pt-bar"><strong id="pt-title"></strong><span id="pt-status" role="status"></span><span id="pt-actions"></span></header>');
    document.getElementById('pt-title').textContent = document.title || 'Postext';
    addEventListener('error', (event) => kitFail(event.error ?? event.message));
    addEventListener('unhandledrejection', (event) => kitFail(event.reason));
  }
  if (title) document.getElementById('pt-title').textContent = title;
  return document.getElementById('pages')
    ?? document.body.appendChild(Object.assign(document.createElement('main'), { id: 'pages' }));
}

function kitStatus(text) {
  viewer();
  document.getElementById('pt-status').textContent = text;
}

function kitFail(error) {
  document.documentElement.dataset.postext = 'error';
  kitStatus(`Error: ${error?.message ?? error}`);
}

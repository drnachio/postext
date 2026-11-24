/**
 * Captures the Sandbox screenshots of the composed-page guides (#1068):
 * Composed-page books §8–11, Moving a book to composed pages (grids and
 * modules) and Sandbox: composed pages (connectors, leaders, grids,
 * modules, overlaps, glyph tabs), one set per interface language, into
 * public/docs-shots/<locale>/. It also takes the Design-mode picture of the
 * Sandbox page (`sandbox-modes`) and the template picture of Composed-page
 * books §2 (`template`): with them, one run retakes every picture that shows
 * the Design panel (#1699).
 *
 *   node scripts/docs/capture-composed-shots.mjs --base http://localhost:3112 [--locales en,es] [--shots tree,grid]
 *
 * It needs a running `next dev` of this app, a current Chrome (the one the
 * Cookbook capture picks: COOKBOOK_CHROME, else the installed one) and
 * `magick` and `cwebp` on the path. Each language runs in its own origin
 * (`<locale>-d4.localhost`), so no draft of a reader's browser is touched.
 * The book is the Cookbook's children's textbook (recipe 156) in English, or
 * in Spanish and Catalan for those pages, as the guides' links open it; the
 * state each step of the guide leaves is written through the Sandbox's page
 * tools (window.postextWebMcp) and the panels are opened by their labels in
 * that language (messages/<locale>.json).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const BASE = new URL(args.base ?? 'http://localhost:3112');
const LOCALES = (args.locales ?? 'en,es,ca,fr,de,it,pt,zh,ja,ar').split(',');
const SHOTS = new Set((args.shots ?? 'sandbox-modes,template,tree,modules,map-notes,leader,grid,overlap,glyph-tab,reshape').split(','));
const CHROME = process.env.COOKBOOK_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WEB = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(WEB, 'public/docs-shots');
const WORK = join(tmpdir(), 'postext-docs-shots');
mkdirSync(WORK, { recursive: true });

const W = 1100, H = 707;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── The book's words, per edition ───────────────────────────────────────────
const TEXT = {
  en: {
    review: `::::page{template="review"}
# Check what you have learned

A river changes as it runs from the mountains to the sea. Read the boxes, then answer them in your own words.

:::frame{slot="remember" label="Remember"}
A spring gives a trickle, streams join into a river, and the river widens as it nears the sea.
:::

:::frame{slot="try" label="Try it"}
Draw a river from its spring to the sea. Write the names of the three courses on your drawing.
:::
::::`,
    tree: ['**A river** gives us', 'Water to drink and to water the fields', 'Power to turn a mill', 'A place to play and to paddle'],
    mapTitle: 'Along the river',
    mapText: 'The map shows the valley of the Aldara. Each note tells you about one place on it: follow its line to find the place.',
    spring: 'Spring', key: ['Town', 'River', 'Path'],
    notes: [['The dam', 'The dam holds the water back in a lake. In dry months it lets some out, so the river never runs empty.'],
      ['Molinar', 'Molinar grew round its bridge and its mill. The mill wheel turned with the water of the river.'],
      ['Aldamar', 'At Aldamar the river meets the sea. Fishing boats leave the harbour every morning.']],
    photosTitle: 'People and the river',
    photosText: 'People use the river in many ways. Look at the photos and say what each person is doing.',
    captions: ['Watering the fields', 'Grinding wheat', 'Paddling a canoe', 'Cleaning the banks'],
  },
  es: {
    review: `::::page{template="review"}
# Repasa lo aprendido

Un río cambia mientras baja de las montañas al mar. Lee los recuadros y respóndelos con tus propias palabras.

:::frame{slot="remember" label="Recuerda"}
Un manantial da un hilo de agua, los arroyos se unen en un río y el río se ensancha al acercarse al mar.
:::

:::frame{slot="try" label="Inténtalo"}
Dibuja un río desde su manantial hasta el mar. Escribe en tu dibujo el nombre de los tres cursos.
:::
::::`,
    tree: ['**Un río** nos da', 'Agua para beber y para regar los campos', 'Fuerza para mover un molino', 'Un sitio para jugar y remar'],
    mapTitle: 'A lo largo del río',
    mapText: 'El mapa muestra el valle del Aldara. Cada nota habla de un lugar del mapa: sigue su línea para encontrarlo.',
    spring: 'Nacimiento', key: ['Pueblo', 'Río', 'Camino'],
    notes: [['La presa', 'La presa retiene el agua en un lago. En los meses secos suelta un poco, y así el río nunca se queda vacío.'],
      ['Molinar', 'Molinar creció alrededor de su puente y de su molino. La rueda del molino giraba con el agua del río.'],
      ['Aldamar', 'En Aldamar el río llega al mar. Las barcas de pesca salen del puerto cada mañana.']],
    photosTitle: 'La gente y el río',
    photosText: 'La gente usa el río de muchas maneras. Mira las fotos y di qué hace cada persona.',
    captions: ['Regar los campos', 'Moler el trigo', 'Remar en piragua', 'Limpiar las orillas'],
  },
  ca: {
    review: `::::page{template="review"}
# Repassa el que has après

Un riu canvia mentre baixa de les muntanyes al mar. Llegeix els requadres i respon-los amb les teves paraules.

:::frame{slot="remember" label="Recorda"}
Una font dona un fil d'aigua, els rierols s'ajunten en un riu i el riu s'eixampla quan s'acosta al mar.
:::

:::frame{slot="try" label="Prova-ho"}
Dibuixa un riu des de la font fins al mar. Escriu al dibuix els noms dels tres cursos.
:::
::::`,
    tree: ['**Un riu** ens dona', 'Aigua per beure i per regar els camps', 'Força per moure un molí', 'Un lloc per jugar i remar'],
    mapTitle: 'Al llarg del riu',
    mapText: "El mapa mostra la vall de l'Aldara. Cada nota parla d'un lloc del mapa: segueix-ne la línia per trobar-lo.",
    spring: 'Font', key: ['Poble', 'Riu', 'Camí'],
    notes: [['La presa', "La presa reté l'aigua en un llac. Els mesos secs en deixa anar una mica, i així el riu no es queda mai buit."],
      ['Molinar', "Molinar va créixer al voltant del pont i del molí. La roda del molí girava amb l'aigua del riu."],
      ['Aldamar', 'A Aldamar el riu arriba al mar. Les barques de pesca surten del port cada matí.']],
    photosTitle: 'La gent i el riu',
    photosText: 'La gent fa servir el riu de moltes maneres. Mira les fotos i digues què fa cada persona.',
    captions: ['Regar els camps', 'Moldre el blat', 'Remar amb piragua', 'Netejar les ribes'],
  },
};
/** The name the guide of each language gives the tree module. */
const TREE_NAME = { es: 'Árbol de ideas', ca: "Arbre d'idees", pt: 'Árvore de ideias' };
const editionOf = (locale) => (locale === 'es' || locale === 'ca' ? locale : 'en');

const treeBlock = (t) => `:::module{template="tree"}
:::frame{slot="root"}
${t.tree[0]}
:::
${t.tree.slice(1).map((w) => `:::frame{slot="branch"}\n${w}\n:::`).join('\n')}
:::`;
const mapPage = (t) => `::::page{template="map-notes"}
# ${t.mapTitle}

${t.mapText}

:::figure{resource="rio" slot="map"}
::label[${t.spring}]{at="spring" style="agua"}
:::label{at="key" style="key"}
:icon[]{glyph="●" color="ink"} ${t.key[0]}
:icon[]{line="solid" color="agua"} ${t.key[1]}
:icon[]{line="dashed" color="ink"} ${t.key[2]}
:::
:::

${t.notes.map(([label, words], i) => `:::frame{slot="note-${i + 1}" label="${label}"}\n${words}\n:::`).join('\n\n')}
::::`;
const photosPage = (t) => `::::page{template="photos"}
# ${t.photosTitle}

${t.photosText}

${['riego', 'molino', 'piraguas', 'limpieza'].map((id, i) => `:::frame{slot="photo"}\n::resource{id="${id}"}\n\n:::frame{slot="caption"}\n${t.captions[i]}\n:::\n:::`).join('\n\n')}
::::`;

// ─── The design each step of the guide leaves ────────────────────────────────
const mm = (value) => ({ value, unit: 'mm' });
const pt = (value) => ({ value, unit: 'pt' });
const REVIEW = { id: 'review', name: 'Review page',
  frames: [
    { name: 'title', style: 'portada', takes: 'h1' },
    { name: 'text', flow: true, width: 'fill', height: 'auto' },
    { name: 'remember', style: 'dato', width: 'fill', height: 'auto', minHeight: mm(30) },
    { name: 'try', style: 'actividad', width: 'fill', height: 'auto', minHeight: mm(30) },
  ],
  groups: [{ name: 'column', kind: 'stack', gap: mm(6), frames: ['title', 'text', 'remember', 'try'] }] };
const TREE = { id: 'tree', name: 'Tree of ideas', role: 'module',
  frames: [
    { name: 'root', style: 'dato', width: 'fill', height: 'auto', flow: false },
    { name: 'branch', style: 'dato', minHeight: mm(20) },
  ],
  groups: [{ name: 'branches', kind: 'grid', columns: 3, columnGap: mm(6), rowGap: mm(6), repeat: { frames: ['branch'] },
    placement: { anchor: { to: '#root', edge: 'below' }, offset: { x: mm(0), y: mm(12) } } }],
  decoration: { elements: [{ kind: 'connector', id: 'connector-1', routing: 'tree', radius: mm(2), width: pt(1.5),
    from: { to: '#root' }, to: [{ to: '#branch[*]' }], endCap: 'arrow' }] } };
const note = (n) => ({ name: `note-${n}`, style: 'dato', width: mm(56), minHeight: mm(26),
  ...(n === 1 ? { placement: { anchor: { to: '#map', edge: 'below' }, offset: { x: mm(0), y: mm(14) } } } : {}) });
const MAP_NOTES = { id: 'map-notes', name: 'Map with notes',
  frames: [{ name: 'title', style: 'portada', takes: 'h1' }, { name: 'text', flow: true }, { name: 'map', width: 'fill' }, note(1), note(2), note(3)],
  groups: [{ name: 'column', kind: 'stack', gap: mm(6), frames: ['title', 'text', 'map'] },
    { name: 'notes', kind: 'row', gap: mm(8), frames: ['note-1', 'note-2', 'note-3'] }] };
const PHOTOS = { id: 'photos', name: 'Photo cards',
  frames: [{ name: 'title', style: 'portada', takes: 'h1' }, { name: 'text', flow: true },
    { name: 'photo', style: 'foto', placement: { anchor: { to: '#text', edge: 'below' }, offset: { x: mm(0), y: mm(6) } } },
    { name: 'caption', style: 'dato', width: 'auto', placement: { anchor: { to: '#photo', edge: 'below' }, offset: { x: mm(0), y: mm(2) } } }],
  groups: [{ name: 'column', kind: 'stack', gap: mm(6), frames: ['title', 'text'] },
    { name: 'cards', kind: 'grid', columns: 3, columnGap: mm(6), rowGap: mm(12), repeat: { frames: ['photo', 'caption'] } }] };
const KEY_STYLE = { id: 'key', name: 'key', kind: 'legend', fontFamily: 'Fredoka', fontSize: pt(10.5), fontWeight: 500,
  color: { hex: '#1d2f3f', model: 'hex', paletteId: 'ink' }, background: { hex: '#ffffff', model: 'hex', paletteId: 'paper' },
  padding: mm(2.5), border: { color: { hex: '#1d2f3f', model: 'hex', paletteId: 'ink' }, width: pt(0.75) }, radius: mm(1.5) };
const RIO_ANCHORS = [
  { id: 'spring', x: 0.047, y: 0.1, labelAt: { x: 0.2, y: 0.06 }, leader: true },
  { id: 'dam', x: 0.31, y: 0.27 }, { id: 'mill', x: 0.52, y: 0.64 }, { id: 'harbour', x: 0.895, y: 0.645 },
  { id: 'key', x: 0.012, y: 0.965, align: 'start', verticalAlign: 'bottom' },
];

// ─── In the page ──────────────────────────────────────────────────────────────
/** Helpers defined in the Sandbox page: its tools and a finder by label. */
function pageHelpers() {
  const T = (name, a = {}) => window.postextWebMcp.executeTool(name, a);
  const raw = async () => (await T('sandbox_read_text', {})).text.split('\n').map((l) => l.replace(/^\s*\d+\t/, '')).join('\n');
  const visible = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  /** The element whose aria-label, or own text, is `text`; `within` limits the search. */
  const find = (text, { within = document, tags = '*', last = false, panel = false } = {}) => {
    const all = [...within.querySelectorAll(tags)].filter((e) => visible(e) && (!panel || !e.closest('main')) && (e.getAttribute('aria-label') === text
      || (e.childElementCount === 0 && e.textContent.trim() === text)
      || (e.tagName === 'LABEL' && e.textContent.trim().startsWith(text) && e.textContent.trim().length < text.length + 16)
      || ([...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim() === text))
      || (e.tagName === 'BUTTON' && e.textContent.trim() === text)));
    return last ? all[all.length - 1] : all[0];
  };
  const scrollTop = (el, pad = 8) => {
    let p = el.parentElement;
    while (p && !(p.scrollHeight > p.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
    if (!p) { el.scrollIntoView({ block: 'start' }); return; }
    p.scrollTop += el.getBoundingClientRect().top - p.getBoundingClientRect().top - pad;
    p.dispatchEvent(new Event('scroll'));
  };
  window.__d4 = { T, raw, find, scrollTop };
}

async function tool(page, name, a) {
  const r = await page.evaluate((n, x) => window.__d4.T(n, x), name, a);
  if (r && r.ok === false) throw new Error(`${name}: ${r.error}`);
  return r;
}
async function putTemplates(page, list) {
  const cur = (await tool(page, 'sandbox_get_config', { path: 'pageTemplates' })).set ?? [];
  const ids = new Set(list.map((t) => t.id));
  return tool(page, 'sandbox_set_config', { changes: [{ path: 'pageTemplates', value: [...cur.filter((t) => !ids.has(t.id)), ...list] }] });
}
async function append(page, md) {
  const text = (await page.evaluate(() => window.__d4.raw())).replace(/\s+$/, '');
  return tool(page, 'sandbox_write_text', { markdown: `${text}\n\n${md.trim()}\n` });
}
/** Clicks the element labelled `text`; scrolls it to the top of its panel first when `top`. */
async function click(page, text, opts = {}) {
  const ok = await page.evaluate((t, o) => {
    const el = window.__d4.find(t, o);
    if (!el) return false;
    if (o.top) window.__d4.scrollTop(el); else el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, text, opts);
  if (!ok) throw new Error(`nothing labelled “${text}”`);
  await sleep(opts.wait ?? 700);
}
async function scrollTo(page, text, opts = {}) {
  const ok = await page.evaluate((t, o) => {
    const el = window.__d4.find(t, o);
    if (!el) return false;
    window.__d4.scrollTop(el, o.pad ?? 8);
    return true;
  }, text, opts);
  if (!ok) throw new Error(`nothing labelled “${text}” to scroll to`);
  await page.mouse.move(200, 400);
  await page.mouse.wheel({ deltaY: 1 });
  await sleep(1200);
}
/** Clicks the middle of a frame on the canvas, found by its name in the Design marks. */
async function pickFrame(page, name) {
  const box = await page.evaluate((n) => {
    const t = [...document.querySelectorAll('main text')].find((e) => e.textContent.trim() === n);
    if (!t) return null;
    const b = t.parentElement.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 + 6 };
  }, name);
  if (!box) throw new Error(`no frame ${name} on the page`);
  await page.mouse.click(box.x, box.y);
  await sleep(900);
}
async function ready(page) {
  for (let i = 0; i < 120; i++) {
    const s = await page.evaluate(() => window.postextWebMcp && window.__d4 ? window.__d4.T('sandbox_get_state', {}) : null).catch(() => null);
    if (s?.ready) return s;
    await sleep(500);
  }
  throw new Error('the Sandbox did not get ready');
}
async function shoot(page, locale, name) {
  await page.mouse.move(W - 4, H - 4);
  await sleep(500);
  const png = join(WORK, `${locale}-${name}.png`);
  await page.screenshot({ path: png });
  const dir = join(OUT, locale);
  mkdirSync(dir, { recursive: true });
  const small = join(WORK, `${locale}-${name}-1x.png`);
  execFileSync('magick', [png, '-resize', `${W}x`, '-strip', small]);
  execFileSync('cwebp', ['-quiet', '-q', '82', small, '-o', join(dir, `${name}.webp`)]);
  console.log(`  ${locale}/${name}.webp`);
}

// ─── One language ─────────────────────────────────────────────────────────────
function labelsOf(locale) {
  const m = JSON.parse(readFileSync(join(WEB, 'messages', `${locale}.json`), 'utf8'));
  return { ...m.Sandbox, rejectAll: m.CookieBanner?.rejectAll };
}

async function openPage(browser, locale, hash) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
  const origin = `${BASE.protocol}//${locale}-d4.localhost:${BASE.port}`;
  await page.goto(`${origin}/${locale}/sandbox${hash}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  for (let i = 0; i < 240 && !(await page.evaluate(() => !!window.postextWebMcp)); i++) await sleep(500);
  // The dev server's own badge ("Compiling…") is no part of the Sandbox.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await page.evaluate(pageHelpers);
  return { context, page };
}

async function rejectCookies(page, L) {
  if (!L.rejectAll) return;
  await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t)?.click(), L.rejectAll);
  await sleep(300);
}

async function river(browser, locale) {
  const L = labelsOf(locale);
  const ed = editionOf(locale);
  const t = TEXT[ed];
  const { context, page } = await openPage(browser, locale, `#recipe=children-textbook-pages&lang=${ed}`);
  await ready(page);
  await rejectCookies(page, L);
  await tool(page, 'sandbox_set_view', { panel: 'none', viewer: 'canvas', fit: 'height' });

  // §2–3: the review page; §8: the tree, inserted as the Modules section does.
  const tree = { ...TREE, name: TREE_NAME[locale] ?? TREE.name };
  await putTemplates(page, [REVIEW, tree]);
  const r1 = await append(page, t.review);
  const reviewPage = r1.book.pages;
  if (SHOTS.has('template')) await templateShot(page, locale, L, reviewPage);
  const fences = ((await page.evaluate(() => window.__d4.raw())).match(/^::::page\{/gm) ?? []).length;
  await tool(page, 'sandbox_insert_module', { module: 'tree', page: fences });
  let text = await page.evaluate(() => window.__d4.raw());
  const at = text.lastIndexOf(':::module{template="tree"}');
  const end = text.indexOf('\n::::', at);
  text = text.slice(0, at) + treeBlock(t) + text.slice(end);
  await tool(page, 'sandbox_write_text', { markdown: text });

  // §9: the map with notes, its key, the anchors of rio and three pointers.
  const styles = (await tool(page, 'sandbox_get_config', { path: 'labelStyles' })).set;
  await tool(page, 'sandbox_set_config', { changes: [{ path: 'labelStyles', value: [...styles.filter((s) => s.id !== 'key'), KEY_STYLE] }] });
  await tool(page, 'sandbox_save_resource', { id: 'rio', marks: { anchors: RIO_ANCHORS } });
  await putTemplates(page, [MAP_NOTES]);
  const r2 = await append(page, mapPage(t));
  const mapPageNo = r2.book.pages;
  for (const [n, a] of [[1, 'dam'], [2, 'mill'], [3, 'harbour']]) {
    await tool(page, 'sandbox_edit_labels', { action: 'pointer', template: 'map-notes', from: `note-${n}`, toFrame: 'map', anchor: a });
  }

  // §10: the photo cards.
  await putTemplates(page, [PHOTOS]);
  const r3 = await append(page, photosPage(t));
  const photosPageNo = r3.book.pages;
  await sleep(1500);

  // The Design panel shows one section of a group at a time: each picture
  // opens the tab of the section it is about.
  const design = async (pageNo, settingsSection = 'pageTemplates') => {
    await tool(page, 'sandbox_set_view', { mode: 'design', panel: 'config', settingsSection, fit: 'height', sidebarWidth: 36 });
    await tool(page, 'sandbox_go_to_page', { page: pageNo });
    await sleep(1200);
  };

  if (SHOTS.has('tree')) {
    await design(reviewPage, 'modules');
    await click(page, L.modulesEditLabel.replace('__name__', tree.name), { wait: 1200 });
    await click(page, `${L.headerFooterElementConnector} #1`, { top: true, wait: 1000 });
    await scrollTo(page, `${L.headerFooterElementConnector} #1`, { pad: 4 });
    await shoot(page, locale, 'tree');
  }
  if (SHOTS.has('modules')) {
    await tool(page, 'sandbox_set_view', { mode: 'content', panel: 'markdown' });
    await tool(page, 'sandbox_select_text', { text: t.tree[1] });
    await design(reviewPage, 'modules');
    await page.evaluate((t) => window.__d4.find(t)?.click(), L.modulesClose);
    await sleep(600);
    await shoot(page, locale, 'modules');
  }
  if (SHOTS.has('map-notes')) {
    await design(mapPageNo);
    await pickFrame(page, 'note-2');
    await scrollTo(page, L.pointersGroup, { pad: 30 });
    await shoot(page, locale, 'map-notes');
  }
  if (SHOTS.has('grid')) {
    await design(photosPageNo);
    await pickFrame(page, 'photo[2]');
    await click(page, 'cards', { panel: true, top: true, wait: 900 });
    await scrollTo(page, L.pageTemplatesGroupRepeat, { pad: 230 });
    await shoot(page, locale, 'grid');
  }
  if (SHOTS.has('leader')) {
    await tool(page, 'sandbox_set_view', { mode: 'content', panel: 'resources', resource: 'rio', sidebarWidth: 30 });
    await sleep(1000);
    await click(page, L.resourceLabelAnchorsEdit, { tags: 'button', wait: 1500 });
    await page.evaluate(() => {
      const dlg = document.querySelector('[role=dialog]') ?? document;
      const el = [...dlg.querySelectorAll('*')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'spring');
      el?.click();
    });
    await sleep(900);
    await scrollTo(page, L.leaderSectionTitle, { pad: 60 });
    await shoot(page, locale, 'leader');
    await page.keyboard.press('Escape');
    await sleep(600);
  }
  if (SHOTS.has('overlap')) {
    const over = { ...MAP_NOTES, frames: MAP_NOTES.frames.map((f) => (f.name === 'note-3'
      ? { ...f, placement: { anchor: { to: '#map', edge: 'top-right' }, offset: { x: mm(-4), y: mm(4) } } } : f)),
    groups: MAP_NOTES.groups.map((g) => (g.name === 'notes' ? { ...g, frames: ['note-1', 'note-2'] } : g)) };
    const keep = (await tool(page, 'sandbox_get_config', { path: 'pageTemplates' })).set.find((x) => x.id === 'map-notes');
    await putTemplates(page, [{ ...over, decoration: keep.decoration }]);
    await tool(page, 'sandbox_set_view', { mode: 'design', panel: 'warnings', fit: 'height', sidebarWidth: 36 });
    await tool(page, 'sandbox_go_to_page', { page: mapPageNo });
    await sleep(2500);
    const at2 = await page.evaluate((t) => { const b = window.__d4.find(t).getBoundingClientRect(); return { x: b.x + 20, y: b.y + b.height / 2 }; }, L.warningsFrameCoveredTitle);
    await page.mouse.click(at2.x, at2.y);
    await sleep(1800);
    await tool(page, 'sandbox_set_view', { panel: 'warnings' });
    await sleep(1200);
    await shoot(page, locale, 'overlap');
    await putTemplates(page, [keep]);
  }
  if (SHOTS.has('glyph-tab')) {
    await tool(page, 'sandbox_set_config', { changes: [{ path: 'calloutStyles[id=actividad].label.icon', value: { kind: 'glyph', glyph: '✎', placement: 'inside' } }] });
    await design(reviewPage, 'calloutStyles');
    await click(page, 'actividad', { top: true, wait: 900 });
    await click(page, L.calloutStyleLabelGroup, { top: true, wait: 900 }).catch(() => {});
    await scrollTo(page, L.calloutStyleLabelIconKind, { pad: 160 });
    await shoot(page, locale, 'glyph-tab');
  }
  await context.close();
}

/** Composed-page books §2: the Review template open in the Design panel, its
 *  frames outlined on the page. Taken before the tree goes onto that page. */
async function templateShot(page, locale, L, reviewPage) {
  await tool(page, 'sandbox_set_view', { mode: 'design', panel: 'config', settingsSection: 'pageTemplates', fit: 'height', sidebarWidth: 36 });
  await tool(page, 'sandbox_go_to_page', { page: reviewPage });
  await sleep(1200);
  await click(page, REVIEW.id, { panel: true, top: true, wait: 900 });
  await scrollTo(page, L.pageTemplatesGroupFramesDescription, { pad: 30 });
  await shoot(page, locale, 'template');
  await tool(page, 'sandbox_set_view', { mode: 'content', panel: 'none' });
}

/** Sandbox §Content and Design: the Design panel's overview beside the map
 *  spread in Design mode, in a book nothing was done to. */
async function modes(browser, locale) {
  if (!SHOTS.has('sandbox-modes')) return;
  const L = labelsOf(locale);
  const { context, page } = await openPage(browser, locale, `#recipe=children-textbook-pages&lang=${editionOf(locale)}`);
  await ready(page);
  await rejectCookies(page, L);
  await tool(page, 'sandbox_set_view', { mode: 'design', panel: 'config', viewer: 'canvas', pages: 'spread', fit: 'width', sidebarWidth: 36 });
  // The pages are fitted again once the sidebar has its width.
  await sleep(1500);
  await tool(page, 'sandbox_go_to_page', { page: 6 });
  await sleep(2500);
  await shoot(page, locale, 'sandbox-modes');
  await context.close();
}

async function places(browser, locale) {
  if (!SHOTS.has('reshape')) return;
  const L = labelsOf(locale);
  const { context, page } = await openPage(browser, locale, '');
  await ready(page);
  await rejectCookies(page, L);
  const origin = new URL(page.url()).origin;
  await tool(page, 'sandbox_import_book', { file: { url: `${origin}/docs-examples/river-places-before.postext` } });
  await ready(page);
  await tool(page, 'sandbox_set_view', { mode: 'design', panel: 'config', settingsSection: 'pageTemplates', viewer: 'canvas', fit: 'height', sidebarWidth: 36 });
  await sleep(1500);
  await scrollTo(page, L.pageTemplatesReshape, { pad: 6 });
  const names = [1, 2, 3, 4, 5, 6].flatMap((n) => [`photo${n}`, `caption${n}`]);
  await page.evaluate((title, list) => {
    const h = window.__d4.find(title);
    let box = h;
    for (let i = 0; i < 4 && box && box.querySelectorAll('input[type=checkbox]').length < 10; i++) box = box.parentElement;
    for (const label of box.querySelectorAll('label')) {
      if (list.includes(label.textContent.trim())) label.click();
    }
  }, L.pageTemplatesReshape, names);
  await sleep(800);
  await scrollTo(page, L.pageTemplatesReshape, { pad: 6 });
  await shoot(page, locale, 'reshape');
  await context.close();
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run', '--hide-scrollbars'] });
try {
  for (const locale of LOCALES) {
    console.log(locale);
    await modes(browser, locale);
    await river(browser, locale);
    await places(browser, locale);
  }
} finally {
  await browser.close();
  if (!args.keep) rmSync(WORK, { recursive: true, force: true });
}

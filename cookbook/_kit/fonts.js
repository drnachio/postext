// ─── Kit · fonts v1 ── the same in every recipe · postext.dev/cookbook ────────
// Postext measures text with the faces the browser has loaded, and caches the
// widths, so every face must be ready before the first build. Faces come from
// Fontsource: the same static files the PDF embeds, so screen and PDF agree.

/** faces = { 'Family Name': ['400', '400i', '700'] }. `text` is the sample:
 *  letters beyond Latin-1 (č, ł, ő…) also load the latin-ext files. With
 *  `optional`, a face Fontsource does not ship is skipped instead of failing.
 *  Resolves to the number of faces added. */
async function loadFonts(faces, text = '', { optional = false } = {}) {
  kitStatus('Loading fonts…');
  const ranges = {
    latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,'
      + 'U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,'
      + 'U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  };
  const subsets = /[Ā-˿Ḁ-ỿ]/.test(text) ? ['latin', 'latin-ext'] : ['latin'];
  const jobs = [];
  let added = 0;
  for (const [family, specs] of Object.entries(faces)) {
    const id = fontsourceId(family);
    const meta = optional ? await fontsourceMeta(family) : null;
    for (const spec of new Set(specs)) {
      const weight = parseInt(spec, 10);
      const style = spec.endsWith('i') ? 'italic' : 'normal';
      if (hasFace(family, weight, style)) continue;
      if (optional && !(meta?.weights.includes(weight) && meta.styles.includes(style))) continue;
      for (const subset of subsets) {
        const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-${subset}-${weight}-${style}.woff2`;
        const face = new FontFace(family, `url(${url}) format('woff2')`,
          { weight: String(weight), style, unicodeRange: ranges[subset] });
        jobs.push(face.load().then((ready) => { document.fonts.add(ready); added++; }, () => {
          if (subset === 'latin' && !optional) throw new Error(`Fontsource has no ${family} ${weight} ${style}`);
        }));
      }
    }
  }
  await Promise.all(jobs).catch((error) => { kitFail(error); throw error; });
  return added;
}

/** Runs `build` (a buildDocument or buildBundle call) and checks the faces
 *  the pages use. A regular face missing from FONTS is loaded with a warning;
 *  bold and italic variants are loaded when the family ships them. Then the
 *  measurement caches are cleared and the build runs again. */
async function buildWithFonts(build, text = '') {
  const tried = new Set();
  for (let round = 0; round < 3; round++) {
    kitStatus('Laying out…');
    await new Promise(requestAnimationFrame);          // let the status paint first
    const result = await Promise.resolve().then(build).catch((error) => { kitFail(error); throw error; });
    const wanted = { base: {}, variants: {} };
    for (const { font, base } of [result].flat().flatMap(fontStringsOf)) {
      const { family, weight, style } = parseFont(font);
      const key = `${family}|${weight}|${style}`;
      if (tried.has(key) || hasFace(family, weight, style)) continue;
      tried.add(key);
      (wanted[base ? 'base' : 'variants'][family] ??= []).push(`${weight}${style === 'italic' ? 'i' : ''}`);
    }
    if (Object.keys(wanted.base).length) {
      console.warn(`[cookbook] FONTS does not list ${JSON.stringify(wanted.base)}: loading them.`);
    }
    const added = await loadFonts(wanted.base, text) + await loadFonts(wanted.variants, text, { optional: true });
    if (added === 0) return result;
    clearMeasurementCache();
  }
  throw new Error('The fonts did not settle after three builds.');
}

/** Every font string of the layout. `base` marks a block's own face; its
 *  bold, italic and bold-italic variants are listed whether or not used. */
function fontStringsOf(doc) {
  const found = new Map();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string' && /fontString$/i.test(key)) {
        found.set(value, found.get(value) || key === 'fontString');
      } else if (value && typeof value === 'object') walk(value);
    }
  };
  walk(doc.pages);
  walk(doc.blocks);
  return [...found].map(([font, base]) => ({ font, base }));
}

/** '700 37.5px Open Sans' / 'italic 400 13px "Source Serif 4"' → { family, weight, style }.
 *  A string with no weight ('95.8px Young Serif', from a design text) is 400. */
function parseFont(font) {
  const m = /^(?:(italic|oblique)\s+)?(?:small-caps\s+)?(?:(\d+|bold|normal)\s+)?[\d.]+px\s+(.+)$/.exec(font.trim());
  if (!m) throw new Error(`Unexpected font string: ${font}`);
  const weight = m[2] === 'bold' ? 700 : !m[2] || m[2] === 'normal' ? 400 : Number(m[2]);
  return { family: m[3].replace(/^["']|["']$/g, ''), weight, style: m[1] ? 'italic' : 'normal' };
}

/** True when a loaded FontFace covers exactly this family, weight and style
 *  (document.fonts.check() is also true for families nobody declared). */
function hasFace(family, weight, style) {
  for (const face of document.fonts) {
    if (face.status !== 'loaded' || face.style !== style) continue;
    if (face.family.replace(/^["']|["']$/g, '') !== family) continue;
    const [low, high = low] = face.weight.split(' ').map(Number);
    if (weight >= low && weight <= high) return true;
  }
  return false;
}

/** Fontsource's id for a family: 'Source Serif 4' → 'source-serif-4'. */
function fontsourceId(family) { return family.toLowerCase().replace(/\s+/g, '-'); }

/** The weights and styles a family ships ({ weights: [400, 700], styles: ['normal', 'italic'] }), or null. */
function fontsourceMeta(family) {
  fontsourceMeta.cache ??= new Map();
  const id = fontsourceId(family);
  if (!fontsourceMeta.cache.has(id)) {
    fontsourceMeta.cache.set(id, fetch(`https://api.fontsource.org/v1/fonts/${id}`)
      .then((res) => (res.ok ? res.json() : null), () => null));
  }
  return fontsourceMeta.cache.get(id);
}

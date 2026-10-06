// ─── Kit · cjk v1 ── Chinese, Japanese and Korean books · postext.dev/cookbook
// Fontsource ships a CJK family as about a hundred files per weight, each
// declared in its stylesheet with the unicode-range it covers. The screen
// loads the files the sample touches; the PDF gets the same files for the
// characters its pages set in each face, and embeds each as a subset.
// A book bound on the right (vertical text) is shown with its spreads
// mirrored: page 1 alone on the left of the spine, then [3 | 2].

/** The files of a Fontsource face, read from its stylesheet: { url, range,
 *  ranges }, the last declared first (the order the browser tries them in). */
function cjkSlices(family, weight, style) {
  cjkSlices.cache ??= new Map();
  const id = fontsourceId(family);
  const css = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/${weight}${style === 'italic' ? '-italic' : ''}.css`;
  if (!cjkSlices.cache.has(css)) {
    cjkSlices.cache.set(css, fetch(css)
      .then((res) => {
        if (!res.ok) throw new Error(`Fontsource has no ${family} ${weight} ${style} (${res.status})`);
        return res.text();
      })
      .then((text) => [...text.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, rule]) => {
        const range = /unicode-range:\s*([^;]+);/.exec(rule)?.[1].trim() ?? 'U+0-10FFFF';
        const ranges = range.split(',').map((part) => {
          const [lo, hi = lo] = part.trim().slice(2).split('-');
          return [parseInt(lo, 16), parseInt(hi, 16)];
        });
        return { url: new URL(/url\(([^)]+?\.woff2)\)/.exec(rule)[1], css).href, range, ranges };
      }).reverse()));
  }
  return cjkSlices.cache.get(css);
}

/** The file of `slices` that holds code point `cp`, if any. */
function cjkSliceFor(slices, cp) {
  return slices.find((slice) => slice.ranges.some(([lo, hi]) => cp >= lo && cp <= hi));
}

/** Whether Fontsource serves `family` as a Chinese, Japanese or Korean
 *  family (its subsets name the script). Fails when the API does not
 *  answer: a CJK face taken for a Latin one would paint in a system face. */
async function isCjkFamily(family) {
  const meta = await fontsourceMeta(family);
  if (!meta) throw new Error(`api.fontsource.org did not describe ${family}: reload to try again`);
  return !!meta.subsets?.some((subset) => /^(chinese|japanese|korean)/.test(subset));
}

/** faces = { 'Noto Serif TC': ['400', '700'] }, as for loadFonts: the
 *  whole FONTS object may be passed, its other families are left to
 *  loadFonts. Adds one FontFace per file of each CJK face with its
 *  unicodeRange, then loads the files `text` touches. `text` is what the
 *  faces set: the sample for the text face; a book in several voices calls
 *  it once per voice (loadCjkFonts({ 'LXGW WenKai TC': ['400'] }, quotes)),
 *  so the heading and quotation faces fetch and check only their own
 *  characters. Fails when a character of `text` is in no file of a face.
 *  List every weight the pages use: a weight left to buildWithFonts gets
 *  the latin file only. With { vertical: true } it also loads each
 *  family's vertical forms (brackets, quotes, pause marks) for the canvas,
 *  which needs loadVerticalAlternates imported from postext. Resolves to
 *  the number of files loaded. */
async function loadCjkFonts(faces, text, { vertical = false } = {}) {
  kitStatus('Loading fonts…');
  let loaded = 0;
  try {
    if (vertical && typeof loadVerticalAlternates !== 'function') {
      throw new Error('loadCjkFonts(…, { vertical: true }) needs loadVerticalAlternates imported from postext');
    }
    for (const [family, specs] of Object.entries(faces)) {
      if (!(await isCjkFamily(family))) continue;
      const twin = [];
      for (const spec of new Set(specs)) {
        const weight = parseInt(spec, 10);
        const style = spec.endsWith('i') ? 'italic' : 'normal';
        const slices = await cjkSlices(family, weight, style);
        const missing = [...new Set(text)].filter((ch) => /\S/.test(ch) && !cjkSliceFor(slices, ch.codePointAt(0)));
        if (missing.length) {
          throw new Error(`${family} ${spec} has no file for ${missing.slice(0, 12).join(' ')}: `
            + `give each face the text it sets (loadCjkFonts({ '${family}': ['${spec}'] }, text))`);
        }
        for (const slice of slices) {
          document.fonts.add(new FontFace(family, `url(${slice.url}) format('woff2')`,
            { weight: String(weight), style, unicodeRange: slice.range }));
          twin.push({ source: slice.url, weight: String(weight), style, unicodeRange: slice.range });
        }
        const font = `${style === 'italic' ? 'italic ' : ''}${weight} 16px "${family}"`;
        loaded += (await document.fonts.load(font, text)).length;
        if (!document.fonts.check(font, text)) throw new Error(`${family} ${spec} did not load for the sample`);
      }
      // The same files under a twin name with the `vert` feature on: the
      // canvas paints the punctuation of vertical lines with it.
      if (vertical && twin.length) await loadVerticalAlternates(family, twin);
    }
  } catch (error) {
    kitFail(error);
    throw error;
  }
  return loaded;
}

/** The PDF font provider for recipes with CJK faces: a family whose
 *  Fontsource subsets are Chinese, Japanese or Korean gets the files that
 *  hold the characters its pages set (`request.codePoints`); any other
 *  family gets the latin file fontsourceProvider fetches (the "pdf" block)
 *  and, when the face sets letters only latin-ext has, that file too. */
async function cjkPdfProvider(family, weight, style, request) {
  if (!(await isCjkFamily(family))) return cjkLatinPdfFiles(family, weight, style, request);
  const meta = await fontsourceMeta(family);
  const weights = meta.weights?.length ? meta.weights : [400, 700];
  const w = weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  const s = style === 'italic' && !meta.styles.includes('italic') ? 'normal' : style;
  const slices = await cjkSlices(family, w, s);
  const picked = new Set();
  for (const cp of request?.codePoints ?? []) {
    const slice = cjkSliceFor(slices, cp);
    if (slice) picked.add(slice);
  }
  if (!picked.size) picked.add(slices[0]);
  return Promise.all(slices.filter((slice) => picked.has(slice)).map(async (slice) => {
    const res = await fetch(slice.url);
    if (!res.ok) throw new Error(`Fontsource file ${slice.url} (${res.status})`);
    return decompressWoff2(new Uint8Array(await res.arrayBuffer()));
  }));
}

/** A Latin family set next to the CJK faces: its latin file, then its
 *  latin-ext file when the face sets letters only latin-ext has (ō ū in
 *  Hepburn rōmaji, ǎ in pinyin), the file loadFonts adds on screen for
 *  them. Latin comes first: postext-pdf draws a character from the first
 *  file that has it, as the browser takes a character both files hold from
 *  latin. A face Fontsource ships without latin-ext, or whose file does
 *  not come, gets latin alone, and the PDF names the letters it lacks. */
async function cjkLatinPdfFiles(family, weight, style, request) {
  const meta = await fontsourceMeta(family);
  const beyond = [...(request?.codePoints ?? [])].some(cjkLatinExtOnly);
  if (!beyond || !meta?.subsets?.includes('latin-ext')) return fontsourceProvider(family, weight, style);
  const weights = meta.weights?.length ? meta.weights : [400, 700];
  const w = weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  const s = style === 'italic' && !meta.styles.includes('italic') ? 'normal' : style;
  const id = fontsourceId(family);
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-ext-${w}-${s}.woff2`;
  const [latin, ext] = await Promise.all([fontsourceProvider(family, weight, style), fetch(url)
    .then(async (res) => (res.ok ? decompressWoff2(new Uint8Array(await res.arrayBuffer())) : null), () => null)]);
  return ext ? [latin, ext] : latin;
}

/** Whether code point `cp` is in Fontsource's latin-ext file and not in
 *  its latin file: Latin Extended-A and -B, IPA, the spacing modifiers and
 *  Latin Extended Additional (loadFonts's test for latin-ext), less the
 *  few latin holds too (ı Œ œ ʻ ʼ ˆ ˚ ˜). */
function cjkLatinExtOnly(cp) {
  if (!((cp >= 0x100 && cp <= 0x2ff) || (cp >= 0x1e00 && cp <= 0x1eff))) return false;
  return ![0x131, 0x152, 0x153, 0x2bb, 0x2bc, 0x2c6, 0x2da, 0x2dc].includes(cp);
}

/** showPages for a book bound on either edge. A right-bound book (the
 *  document says so: doc.binding is 'right' for page.binding 'right' and
 *  for vertical text) lies on the desk as it opens: page 1 alone on the
 *  left of the spine, then [3 | 2], the spine shade on each page's inner
 *  edge. `binding` ('left' | 'right') overrides the document's. */
function showBook(docs, { binding, ...options } = {}) {
  const count = showPages(docs, options);
  const right = (binding ?? [docs].flat()[0]?.binding) === 'right';
  if (!document.getElementById('pt-kit-cjk')) {
    // The pages keep direction ltr: a canvas draws text in the direction its
    // element inherits, and under rtl each run would end where the engine
    // starts it, its brackets mirrored.
    document.head.insertAdjacentHTML('beforeend', `<style id="pt-kit-cjk">
      .pt-spread[dir="rtl"] canvas { direction: ltr; }
      .pt-spread[dir="rtl"] figure:first-child canvas { box-shadow: inset 14px 0 14px -14px rgb(0 0 0 / .18),
        0 1px 2px rgb(0 0 0 / .5), 0 22px 44px -16px rgb(0 0 0 / .8); }
    </style>`);
  }
  // Each pair stays [verso, recto] in the page; right to left, the verso
  // sits on the right. Phones stack the pages in reading order either way.
  for (const spread of document.querySelectorAll('#pages > .pt-spread')) spread.dir = right ? 'rtl' : 'ltr';
  document.getElementById('pages').dataset.binding = right ? 'right' : 'left';
  return count;
}

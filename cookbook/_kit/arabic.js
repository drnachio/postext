// ─── Kit · arabic v1 ── Arabic-script faces · postext.dev/cookbook
// Fontsource ships an Arabic family as one file per subset and weight: the
// `arabic` file holds the letters, the harakat, the Arabic-Indic digits, the
// Arabic punctuation and the presentation forms; `latin` and `latin-ext`
// hold the rest. loadFonts loads the latin files; this block adds the arabic
// file of every Arabic family, for the canvas and for the PDF, which shapes
// the letters with HarfBuzz from the same bytes.

/** The code points of Fontsource's `arabic` subset, as its stylesheets
 *  declare them (the same unicode-range the browser picks the file by). A
 *  function, not a const: the kit is inlined after the recipe's top-level
 *  awaits, and a const read before its line throws, where a function
 *  declaration is hoisted. */
function arabicRange() {
  return 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,'
    + 'U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC,U+102E0-102FB,'
    + 'U+10E60-10E7E,U+10EC2-10EC4,U+10EFC-10EFF,U+1EE00-1EEFF';
}

/** Whether code point `cp` is in the arabic file. */
function inArabicRange(cp) {
  inArabicRange.ranges ??= arabicRange().split(',').map((part) => {
    const [lo, hi = lo] = part.slice(2).split('-');
    return [parseInt(lo, 16), parseInt(hi, 16)];
  });
  return inArabicRange.ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/** Whether Fontsource serves `family` with an `arabic` subset. Fails when
 *  the API does not answer: an Arabic face taken for a Latin one would set
 *  its letters in a system face. */
async function isArabicFamily(family) {
  const meta = await fontsourceMeta(family);
  if (!meta) throw new Error(`api.fontsource.org did not describe ${family}: reload to try again`);
  return !!meta.subsets?.includes('arabic');
}

/** The arabic file of a face. */
function arabicFileUrl(family, weight, style) {
  const id = fontsourceId(family);
  return `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-arabic-${weight}-${style}.woff2`;
}

/** faces = { Amiri: ['400', '700'] }, as for loadFonts, after it: the whole
 *  FONTS object may be passed, its families without an arabic subset are
 *  left alone. Adds the arabic file of every listed weight of each Arabic
 *  family (the latin files come from loadFonts) and loads it. `text` is
 *  the sample: fails when it holds an Arabic-script character the arabic
 *  file does not cover. List every weight the pages set in Arabic: a weight
 *  left to buildWithFonts gets the latin file only, and its Arabic letters
 *  fall back to a system face. Resolves to the number of files loaded. */
async function loadArabicFonts(faces, text = '') {
  kitStatus('Loading fonts…');
  let loaded = 0;
  try {
    const outside = [...new Set(text)].filter((ch) => /\p{Script=Arabic}/u.test(ch) && !inArabicRange(ch.codePointAt(0)));
    if (outside.length) throw new Error(`Fontsource's arabic files have no ${outside.slice(0, 12).join(' ')}`);
    for (const [family, specs] of Object.entries(faces)) {
      if (!(await isArabicFamily(family))) continue;
      for (const spec of new Set(specs)) {
        const weight = parseInt(spec, 10);
        const style = spec.endsWith('i') ? 'italic' : 'normal';
        const face = new FontFace(family, `url(${arabicFileUrl(family, weight, style)}) format('woff2')`,
          { weight: String(weight), style, unicodeRange: arabicRange() });
        document.fonts.add(await face.load().catch(() => {
          throw new Error(`Fontsource has no arabic file for ${family} ${weight} ${style}`);
        }));
        loaded++;
      }
    }
  } catch (error) {
    kitFail(error);
    throw error;
  }
  return loaded;
}

/** The PDF font provider for recipes with Arabic faces: a family with an
 *  arabic subset gets its arabic file when its pages set Arabic letters
 *  (`request.codePoints`), then its latin file, and its latin-ext file for
 *  the letters beyond latin (transliteration: ā ḥ ʿ). The arabic file comes
 *  first: it also holds the space and the brackets, so a line of Arabic is
 *  shaped as one run and not cut at every space. Any other family goes to
 *  fontsourceProvider (the "pdf" block). */
async function arabicPdfProvider(family, weight, style, request) {
  if (!(await isArabicFamily(family))) return fontsourceProvider(family, weight, style, request);
  const meta = await fontsourceMeta(family);
  const weights = meta.weights?.length ? meta.weights : [400, 700];
  const w = weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  const s = style === 'italic' && !meta.styles.includes('italic') ? 'normal' : style;
  const wanted = [...(request?.codePoints ?? [])];
  const id = fontsourceId(family);
  const urls = [];
  if (!wanted.length || wanted.some(inArabicRange)) urls.push(arabicFileUrl(family, w, s));
  urls.push(`https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-${w}-${s}.woff2`);
  if (meta.subsets.includes('latin-ext') && wanted.some((cp) => /[Ā-˿Ḁ-ỿ]/u.test(String.fromCodePoint(cp)))) {
    urls.push(`https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-latin-ext-${w}-${s}.woff2`);
  }
  return Promise.all(urls.map(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fontsource file ${url} (${res.status})`);
    return decompressWoff2(new Uint8Array(await res.arrayBuffer()));
  }));
}

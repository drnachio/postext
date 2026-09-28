// ─── Kit · cjk v1 ── Chinese, Japanese and Korean faces · postext.dev/cookbook ─
// Fontsource ships a CJK family as about a hundred files per weight, each
// declared in its stylesheet with the unicode-range it covers. The screen
// loads the files the sample touches; the PDF gets the same files for the
// characters its pages set in each face, and embeds each as a subset.

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

/** faces = { 'Noto Serif TC': ['400', '700'] }, as for loadFonts. Adds one
 *  FontFace per file of each face with its unicodeRange, then loads the
 *  files `text` (the sample) touches. Fails when a character of the
 *  sample is in no file. List every weight the pages use: a weight left
 *  to buildWithFonts gets the latin file only. Resolves to the number of
 *  files loaded. */
async function loadCjkFonts(faces, text) {
  kitStatus('Loading fonts…');
  let loaded = 0;
  try {
    for (const [family, specs] of Object.entries(faces)) {
      for (const spec of new Set(specs)) {
        const weight = parseInt(spec, 10);
        const style = spec.endsWith('i') ? 'italic' : 'normal';
        const slices = await cjkSlices(family, weight, style);
        const missing = [...new Set(text)].filter((ch) => /\S/.test(ch) && !cjkSliceFor(slices, ch.codePointAt(0)));
        if (missing.length) throw new Error(`${family} ${spec} has no file for ${missing.slice(0, 12).join(' ')}`);
        for (const slice of slices) {
          document.fonts.add(new FontFace(family, `url(${slice.url}) format('woff2')`,
            { weight: String(weight), style, unicodeRange: slice.range }));
        }
        const font = `${style === 'italic' ? 'italic ' : ''}${weight} 16px "${family}"`;
        loaded += (await document.fonts.load(font, text)).length;
        if (!document.fonts.check(font, text)) throw new Error(`${family} ${spec} did not load for the sample`);
      }
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
 *  family goes to fontsourceProvider (the "pdf" block). */
async function cjkPdfProvider(family, weight, style, request) {
  const meta = await fontsourceMeta(family);
  if (!meta?.subsets?.some((subset) => /^(chinese|japanese|korean)/.test(subset))) {
    return fontsourceProvider(family, weight, style);
  }
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

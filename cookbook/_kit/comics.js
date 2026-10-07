// ─── Kit · comics v1 ── comic pages · postext.dev/cookbook
// The engine letters a comic in a face per language (defaultComicFont:
// Comic Neue, Zen Antique for Japanese, Noto Sans SC, LXGW WenKai TC,
// Playpen Sans Arabic; defaultComicSfxFont: Bangers, Dela Gothic One,
// ZCOOL KuaiLe, Lalezar) and asks for the bold of a shout or a sound effect
// and the italic of an inner voice. Most of these faces ship one weight and
// no italic: this block declares the file Fontsource does ship for those
// variants, so the canvas measures and paints the letters the PDF embeds
// (the providers snap to the shipped file) and not a bold or a slant the
// browser makes up. It also turns the art manifest into panel resources.

/** faces = { 'Comic Neue': ['400', '700'], Bangers: ['400'] }, as for
 *  loadFonts, after it (and after loadCjkFonts or loadArabicFonts for the
 *  faces of those scripts); the whole FONTS object may be passed. List in
 *  FONTS only what Fontsource ships (Bangers: ['400']): loadFonts fails on
 *  the rest. For each family, the regular, bold, italic and bold italic it
 *  lacks are declared with its nearest file (the regular for the bold, the
 *  upright for the italic) and loaded for `text`. A CJK face needs the cjk
 *  block; an Arabic face setting Arabic, the arabic block. Resolves to the
 *  number of variants added. */
async function loadComicFonts(faces, text = '') {
  kitStatus('Loading fonts…');
  let added = 0;
  try {
    for (const family of Object.keys(faces)) {
      const meta = await fontsourceMeta(family);
      if (!meta) throw new Error(`api.fontsource.org did not describe ${family}: reload to try again`);
      const weights = meta.weights?.length ? meta.weights : [400, 700];
      const styles = meta.styles?.length ? meta.styles : ['normal'];
      for (const [weight, style] of [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']]) {
        if ((weights.includes(weight) && styles.includes(style)) || hasFace(family, weight, style)) continue;
        const w = weights.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
        const s = style === 'italic' && styles.includes('italic') ? 'italic' : 'normal';
        for (const { url, range } of await comicFaceFiles(family, w, s, meta, text)) {
          document.fonts.add(new FontFace(family, `url(${url}) format('woff2')`,
            { weight: String(weight), style, unicodeRange: range }));
        }
        await document.fonts.load(`${style === 'italic' ? 'italic ' : ''}${weight} 16px "${family}"`, text || 'A');
        added++;
      }
    }
  } catch (error) {
    kitFail(error);
    throw error;
  }
  return added;
}

/** The files of a shipped face ({ url, range }): a CJK face's slices (the
 *  cjk block reads them from its stylesheet), else latin, the latin-ext
 *  and greek files `text` needs, and the arabic file when `text` holds
 *  Arabic. */
async function comicFaceFiles(family, weight, style, meta, text) {
  if (meta.subsets?.some((subset) => /^(chinese|japanese|korean)/.test(subset))) {
    if (typeof cjkSlices !== 'function') throw new Error(`${family} is a CJK face: list the cjk kit block`);
    return (await cjkSlices(family, weight, style)).map(({ url, range }) => ({ url, range }));
  }
  const id = fontsourceId(family);
  const file = (subset) => `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-${subset}-${weight}-${style}.woff2`;
  const files = ['latin', ...kitSubsetsFor(text, meta)].map((subset) => ({ url: file(subset), range: comicRange(subset) }));
  if (meta.subsets?.includes('arabic') && /\p{Script=Arabic}/u.test(text)) {
    if (typeof arabicRange !== 'function') throw new Error(`${family} sets Arabic: list the arabic kit block`);
    files.unshift({ url: file('arabic'), range: arabicRange() });
  }
  return files;
}

/** The unicode-range loadFonts gives a Fontsource file. A function, not a
 *  const: the kit is inlined after the recipe's top-level awaits. */
function comicRange(subset) {
  return {
    latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,'
      + 'U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,'
      + 'U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    greek: 'U+0370-03FF',
  }[subset];
}

/** The PDF font provider of a comic in any script: a CJK face goes to
 *  cjkPdfProvider, an Arabic face to arabicPdfProvider, any other to
 *  fontsourceProvider (the "pdf" block). Each embeds the shipped weight
 *  and style nearest to the one asked for, the file loadComicFonts
 *  declared for the canvas. */
async function comicPdfProvider(family, weight, style, request) {
  const subsets = (await fontsourceMeta(family))?.subsets ?? [];
  if (subsets.some((subset) => /^(chinese|japanese|korean)/.test(subset))) {
    if (typeof cjkPdfProvider !== 'function') throw new Error(`${family} is a CJK face: list the cjk kit block`);
    return cjkPdfProvider(family, weight, style, request);
  }
  if (subsets.includes('arabic') && typeof arabicPdfProvider === 'function') {
    return arabicPdfProvider(family, weight, style, request);
  }
  return fontsourceProvider(family, weight, style, request);
}

/** A panel picture as a resource for art= (and pop=): loads `url`
 *  (write asset('lh-arrive.jpg') in the call, so the lint checks the file)
 *  and declares it with `meta`, its entry in the art manifest:
 *  { width, height, alt, safeArea, anchors, avoid }. The safe area is what
 *  every crop keeps, the anchors the speakers' mouths, heads and faces,
 *  the avoid zones what no balloon covers; all in fractions of the picture,
 *  the same in every language. Without width and height, the picture's own
 *  size. Needs the images block. Resolves to the resource. */
async function comicPanel(id, url, meta = {}) {
  const fileId = decodeURIComponent(url.split('/').pop());
  await loadImage(fileId, url);
  let { width, height } = meta;
  if (!width || !height) {
    const bitmap = await createImageBitmap(new Blob([imageBytes(fileId)]));
    ({ width, height } = bitmap);
    bitmap.close();
  }
  return {
    id, typeId: meta.typeId ?? 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId, format: /\.png$/i.test(fileId) ? 'png' : 'jpeg', width, height },
    ...(meta.alt && { altText: meta.alt }),
    ...(meta.safeArea && { safeArea: meta.safeArea }),
    ...(meta.anchors?.length && { anchors: meta.anchors }),
    ...(meta.avoid?.length && { avoid: meta.avoid }),
  };
}

// ─── Kit · fonts v3 ── the same in every recipe · postext.dev/cookbook
// Postext loads the faces a config asks for before layout (prepareFonts,
// buildDocumentWithFonts) and asks the kit for the files: Fontsource's, the
// files the PDF embeds too.

/** The options of buildDocumentWithFonts / prepareFonts / withLoadedFonts:
 *  the Fontsource resolver, and the faces of FONTS loaded with the ones the
 *  config names. FONTS = { 'Family Name': ['400', '400i', '700'] }. */
function kitFonts(FONTS = {}) {
  const faces = Object.entries(FONTS).flatMap(([family, specs]) => specs.map((spec) =>
    ({ family, weight: parseInt(spec, 10), style: spec.endsWith('i') ? 'italic' : 'normal' })));
  return { resolve: fontsourceResolver, faces };
}

/** A face's Fontsource files, in a fixed order: latin, then latin-ext and greek
 *  when `text` needs them and the family ships them (kitSubsetsFor), each with
 *  its unicode-range. Null for a weight or slant Fontsource does not ship. */
async function fontsourceResolver(family, weight, style, { text = '' } = {}) {
  const id = fontsourceId(family);
  const meta = await fontsourceMeta(family);
  if (meta && !(meta.weights.includes(weight) && meta.styles.includes(style))) return null;
  kitStatus('Loading fonts…');
  return ['latin', ...kitSubsetsFor(text, meta)].map((subset) => ({
    source: `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-${subset}-${weight}-${style}.woff2`,
    unicodeRange: kitRanges()[subset],
  }));
}

/** The unicode-range of each Fontsource file the kit loads (a function: the
 *  kit is inlined after the pen's code, which runs before a const would be set). */
function kitRanges() {
  return {
    latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,'
      + 'U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,'
      + 'U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    greek: 'U+0370-03FF',
  };
}

/** For the cjk, arabic and comics blocks, which add their own files: the
 *  faces of `faces` = { 'Family Name': ['400', '400i', '700'] }. `text` is the sample:
 *  č ł † α χ also load latin-ext and greek files (kitSubsetsFor). With
 *  `optional`, a face Fontsource does not ship is skipped instead of failing.
 *  The files are added once all have loaded, in the order asked (latin, then
 *  latin-ext, then greek), whatever order they arrive in: the last one added
 *  wins a character two files hold. Resolves to the number of faces added. */
async function loadFonts(faces, text = '', { optional = false } = {}) {
  kitStatus('Loading fonts…');
  const ranges = kitRanges();
  const jobs = [];
  for (const [family, specs] of Object.entries(faces)) {
    const id = fontsourceId(family);
    const todo = [...new Set(specs)].map((spec) => [parseInt(spec, 10), spec.endsWith('i') ? 'italic' : 'normal'])
      .filter(([weight, style]) => !hasFace(family, weight, style)); // before any await
    const meta = optional || /[^\0-ÿ]/u.test(text) ? await fontsourceMeta(family) : null;
    const subsets = ['latin', ...kitSubsetsFor(text, meta)];
    for (const [weight, style] of todo) {
      if (optional && !(meta?.weights.includes(weight) && meta.styles.includes(style))) continue;
      for (const subset of subsets) {
        const url = `https://cdn.jsdelivr.net/npm/@fontsource/${id}@5/files/${id}-${subset}-${weight}-${style}.woff2`;
        const face = new FontFace(family, `url(${url}) format('woff2')`,
          { weight: String(weight), style, unicodeRange: ranges[subset] });
        jobs.push(face.load().catch(() => {
          if (subset === 'latin' && !optional) throw new Error(`Fontsource has no ${family} ${weight} ${style}`);
        }));
      }
    }
  }
  const ready = await Promise.all(jobs).catch((error) => { kitFail(error); throw error; });
  return ready.filter((face) => face && document.fonts.add(face)).length;
}

/** A loaded FontFace covers this family, weight and style (fonts.check() would
 *  also say yes for families nobody declared). */
function hasFace(family, weight, style) {
  for (const face of document.fonts) {
    if (face.status !== 'loaded' || face.style !== style) continue;
    if (face.family.replace(/^["']|["']$/g, '') !== family) continue;
    const [low, high = low] = face.weight.split(' ').map(Number);
    if (weight >= low && weight <= high) return true;
  }
  return false;
}

/** The files beyond latin `text` needs that `meta`'s family ships. */
function kitSubsetsFor(text, meta) {
  return [[/[Ā-˿ᴀ-ᶿḀ-ỿ†ℓⱠ-Ɀ꜠-ꟿ]/u, 'latin-ext'], [/[Ͱ-Ͽ]/u, 'greek']]
    .filter(([re, x]) => re.test(text) && meta?.subsets?.includes(x)).map(([, x]) => x);
}

/** Fontsource's id for a family: 'Source Serif 4' → 'source-serif-4'. */
function fontsourceId(family) { return family.toLowerCase().replace(/\s+/g, '-'); }

/** The family's Fontsource metadata (weights, styles, subsets), or null. */
function fontsourceMeta(family) {
  fontsourceMeta.cache ??= new Map();
  const id = fontsourceId(family);
  if (!fontsourceMeta.cache.has(id)) {
    fontsourceMeta.cache.set(id, fetch(`https://api.fontsource.org/v1/fonts/${id}`)
      .then((res) => (res.ok ? res.json() : null), () => null));
  }
  return fontsourceMeta.cache.get(id);
}

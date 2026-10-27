// lintPen: the checks of one edition's pen, its imports, network use,
// kit calls, config and Markdown, and the engine pins and level-one breaks
// it tests (#1276: split out of lint.ts).
import { defineData } from '../compose.ts';
import { scanJs, lineLookup, parseImports, isEngineUrl, POSTEXT_URL, POSTEXT_BUNDLE_URL, POSTEXT_PDF_URL, POSTEXT_EPUB_URL, POSTEXT_EPUB_WORKER_URL, usedApis, configObjectRange, configKeys, CONFIG_KEYS, matchBracket, referencesIdentifier, malformedResourceEmbeds, markdownConstructs, configString, staticLevel } from '../detect.ts';
import { type KitBlock, KIT_ORDER, type ComposedPen, type RecipeMeta, type RecipeSources, type Locale } from '../types.ts';
import { unquotedFrontmatter, compareSemVer } from '../validate.ts';
import { textLength, CJK_CHARS_PER_WORD, JAPANESE_CHARS_PER_WORD, styleMessages } from '../style.ts';
import { type LintReport, LIMITS, ALLOWED_IMPORTS, KIT_IMPORTS, NAMESPACE_URL, isAllowedUrl, NETWORK_ALLOWLIST, KIT_CALLS, thousands, bytes } from './limits.ts';
import { nonLatin, isHistoricKana, mostlyArabic, isLatinExtOnly, isGreek, lintCjk, lintArabic, RTL_SCRIPTS, tagScript, COMICS_RTL_SCRIPTS } from './scripts.ts';

// ─── lintPen ────────────────────────────────────────────────────────────────

export interface LintPenOptions {
  /** Kit sources (cookbook/_kit/*.js): enables the kit-function checks. */
  kit?: Partial<Record<KitBlock, string>>;
  /** Whether a repo-relative path exists (for jsDelivr `gh/…` URLs outside this recipe). */
  repoFileExists?: (repoPath: string) => boolean;
}

/** The functions each kit block declares. */
function kitFunctions(kit: Partial<Record<KitBlock, string>>): Map<string, KitBlock[]> {
  const map = new Map<string, KitBlock[]>();
  for (const block of KIT_ORDER) {
    for (const m of (kit[block] ?? "").matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) {
      map.set(m[1], [...(map.get(m[1]) ?? []), block]);
    }
  }
  return map;
}

/** The static checks of one composed edition. `sources` are the raw files
 *  (content, assets); `meta` the recipe.json. */
export function lintPen(
  composed: ComposedPen,
  meta: RecipeMeta,
  sources: RecipeSources,
  { kit, repoFileExists }: LintPenOptions = {},
): LintReport {
  const fails: string[] = [];
  const warns: string[] = [];
  const { js, slug } = composed;
  const lines = js.split("\n");
  const scan = scanJs(js);
  const lineAt = lineLookup(js);

  // Lines that belong to the recipe itself, not to the content literals or the kit.
  const folded = new Set<number>();
  for (const [a, b] of composed.ranges.content) for (let n = a; n <= b; n++) folded.add(n);
  const kitRange = composed.ranges.kit;
  if (kitRange) for (let n = kitRange[0]; n <= kitRange[1]; n++) folded.add(n);
  const own = (text: string) =>
    text
      .split("\n")
      .map((line, i) => (folded.has(i + 1) ? "" : line))
      .join("\n");
  const ownCode = own(scan.code);
  const ownBare = own(scan.bare);
  const ownLiterals = scan.literals.filter((lit) => !folded.has(lineAt(lit.start)));
  const at = (offset: number) => `script.js line ${lineAt(offset)}`;

  // Banner (4 lines) and the numbered section banners.
  const number = String(meta.number).padStart(3, "0");
  const title = /^\/\/ ═+ Postext Cookbook · Nº (\d{3,}) · (.+?) ═*\s*$/.exec(lines[0] ?? "");
  if (!title) fails.push(`script.js line 1: the banner starts "// ═══ Postext Cookbook · Nº ${number} · <title> ═══"`);
  else if (title[1] !== number) fails.push(`script.js line 1: the banner says Nº ${title[1]}; recipe.json says ${number}`);
  const url = /^\/\/ https:\/\/postext\.dev\/(en|es|ca|zh|ja|ar|pt|fr|de|it)\/cookbook\/([a-z0-9-]+)\s*$/.exec(lines[1] ?? "");
  if (!url || url[2] !== slug) fails.push(`script.js line 2: the banner links https://postext.dev/en/cookbook/${slug}`);
  if (!/^\/\/ Code: MIT\b/.test(lines[2] ?? "")) fails.push(`script.js line 3: the banner credits "// Code: MIT · Text: … · Photo: …"`);
  const needs = /^\/\/ Fonts: .+ · Needs postext ≥ (\d+\.\d+\.\d+)\s*$/.exec(lines[3] ?? "");
  if (!needs) fails.push(`script.js line 4: the banner ends "// Fonts: … · Needs postext ≥ ${meta.engine?.postext}"`);
  else if (needs[1] !== meta.engine?.postext) {
    fails.push(`script.js line 4: the banner needs postext ≥ ${needs[1]}; recipe.json says ${meta.engine?.postext}`);
  }
  const sections: { n: number; title: string; line: number }[] = [];
  lines.forEach((line, i) => {
    if (folded.has(i + 1)) return;
    const m = /^\/\/ ─── (\d+) · (.+?) ─*\s*$/.exec(line);
    if (m) sections.push({ n: Number(m[1]), title: m[2], line: i + 1 });
  });
  const expected = [/^design/i, /^content/i, /^fonts/i, /^build/i];
  const numbering = sections.map((s) => s.n);
  if (numbering.some((n, i) => n !== i + 1) || sections.length < 4) {
    fails.push(`script.js: section banners must run "// ─── 1 · Design", "2 · Content", "3 · Fonts", "4 · Build & show" in order`);
  } else {
    expected.forEach((pattern, i) => {
      if (!pattern.test(sections[i].title)) {
        fails.push(`script.js line ${sections[i].line}: section ${i + 1} is "${["Design", "Content", "Fonts", "Build & show"][i]}"`);
      }
    });
  }

  // LANG and RECIPE, once each.
  const langMarkers = lines.filter((line) => /^\s*const LANG = '[a-z]{2}';\s*\/\/ @lang\b/.test(line)).length;
  if (langMarkers !== 1) fails.push(`script.js: exactly one \`const LANG = 'en'; // @lang\` line (found ${langMarkers})`);
  const recipes = [...ownCode.matchAll(/^const RECIPE = '([^']*)';/gm)];
  if (recipes.length !== 1) fails.push(`script.js: exactly one \`const RECIPE = '${slug}';\` line (found ${recipes.length})`);
  else if (recipes[0][1] !== slug) fails.push(`script.js: RECIPE is '${recipes[0][1]}' but the folder is ${slug}`);

  // Regions.
  const regions = composed.ranges.regions;
  const answer = regions.answer;
  if (!answer) fails.push(`script.js: needs exactly one \`// #region answer: <what it shows>\``);
  else {
    const length = answer.lines[1] - answer.lines[0] + 1;
    const [min, max] = LIMITS.answerLines;
    if (length < min || length > max) warns.push(`script.js: the answer region has ${length} lines (aim for ${min}–${max})`);
  }
  const others = Object.keys(regions).filter((id) => id !== "answer");
  if (others.length > LIMITS.otherRegions) {
    fails.push(`script.js: at most ${LIMITS.otherRegions} regions besides "answer" (has ${others.length})`);
  }
  for (const [id, region] of Object.entries(regions)) {
    if (!region.title) warns.push(`script.js: #region ${id} has no title ("// #region ${id}: <what it shows>")`);
  }

  // Imports.
  const imports = parseImports(js, scan);
  for (const imp of imports) {
    if (ALLOWED_IMPORTS.includes(imp.url)) continue;
    if (isEngineUrl(imp.url) && /@/.test(imp.url.replace("https://", ""))) {
      fails.push(`script.js line ${imp.line}: import from ${imp.url}: no version pins (pens follow the latest release; the capture pins it)`);
    } else {
      fails.push(`script.js line ${imp.line}: import from ${imp.url}: pens import only from ${ALLOWED_IMPORTS.join(", ")}`);
    }
  }
  const staticImports = imports.filter((imp) => !imp.dynamic);
  const postextImports = staticImports.filter((imp) => imp.url === POSTEXT_URL || imp.url === POSTEXT_BUNDLE_URL);
  if (postextImports.length !== 1) {
    fails.push(`script.js: exactly one import statement from ${POSTEXT_URL} (or ?bundle for math), found ${postextImports.length}`);
  }
  const math = Boolean(meta.engine?.math);
  const bundled = postextImports.some((imp) => imp.url === POSTEXT_BUNDLE_URL);
  // Since postext 1.5 MathJax ships inside the package and `initMathEngine`
  // fetches it from the plain import too (EF-15), so a maths recipe takes
  // either URL; `?bundle` stays for the recipes written with it (#641).
  if (!math && bundled) fails.push(`script.js: ${POSTEXT_BUNDLE_URL} is only for engine.math recipes`);
  const postextNames = new Set(postextImports.flatMap((imp) => imp.names));
  if (math && !/\bawait\s+initMathEngine\s*\(\s*\)/.test(ownBare)) {
    fails.push(`script.js: math recipes \`await initMathEngine()\` before the first build`);
  }
  const pdfImport = imports.find((imp) => imp.url === POSTEXT_PDF_URL);
  const pdfOutput = meta.outputs?.includes("pdf") ?? false;
  const pdfKit = meta.kit?.includes("pdf") ?? false;
  if (pdfOutput !== Boolean(pdfImport) || pdfOutput !== pdfKit) {
    fails.push(
      `script.js: a "pdf" output, an import from ${POSTEXT_PDF_URL} and the "pdf" kit block go together ` +
        `(output ${pdfOutput ? "yes" : "no"}, import ${pdfImport ? "yes" : "no"}, kit ${pdfKit ? "yes" : "no"})`,
    );
  }
  // An EPUB has no kit block: the pen writes the file and offers it itself.
  const epubImport = imports.some((imp) => imp.url === POSTEXT_EPUB_URL || imp.url === POSTEXT_EPUB_WORKER_URL);
  const epubOutput = meta.outputs?.includes("epub") ?? false;
  if (epubOutput !== epubImport) {
    fails.push(
      `script.js: an "epub" output and an import from ${POSTEXT_EPUB_URL} (or its /worker) go together ` +
        `(output ${epubOutput ? "yes" : "no"}, import ${epubImport ? "yes" : "no"})`,
    );
  }
  const pdfNames = new Set(imports.filter((imp) => imp.url === POSTEXT_PDF_URL).flatMap((imp) => imp.names));
  for (const block of meta.kit ?? []) {
    const need = KIT_IMPORTS[block];
    if (!need) continue;
    const names = need.module === "postext" ? postextNames : pdfNames;
    if (!names.has(need.name)) fails.push(`script.js: the "${block}" kit block needs \`${need.name}\` imported from ${need.module}`);
  }
  const used = new Set(usedApis(js, scan, imports));
  for (const imp of staticImports) {
    for (const name of imp.names) if (isEngineUrl(imp.url) && !used.has(name)) warns.push(`script.js: \`${name}\` is imported but never used`);
  }

  // Config.
  const range = configObjectRange(scan);
  const keys = configKeys(js, scan);
  if (!range) fails.push("script.js: declare the config as `const config = { … }` (or a factory, `const config = () => ({ … })`)");
  else {
    for (const key of keys) {
      if (!CONFIG_KEYS.includes(key)) fails.push(`${at(range[0])}: \`${key}\` is not a config key (typo? the engine ignores it)`);
    }
    const spread = /\.\.\./.test(scan.bare.slice(range[0], range[1]));
    const skin = meta.capture?.expect?.defaultSkin ?? [];
    const required = ["bodyText", "header", "footer", "colorPalette"];
    const advised = ["page", ...(skin.includes("headings") ? [] : ["headings"])];
    for (const key of required) {
      if (keys.includes(key)) continue;
      (spread ? warns : fails).push(`script.js: the config must set \`${key}\` (never the default skin)`);
    }
    for (const key of advised) if (!keys.includes(key)) warns.push(`script.js: the config should set \`${key}\` (never the default skin)`);
  }
  // Two traps of postext 1.4, fixed in 1.5 (pitfalls headings-drop-h1-break
  // and numbering-vocabularies): only a recipe pinned below the fix still
  // has to route around them. From 1.5 a partial `headings` object merges
  // onto each level's defaults, so a pen states `breakBefore` only to change
  // it, and a list numbers with 'decimal' as with 'arabic'.
  const before15 = pinnedBefore(meta, "1.5.0");
  if (before15 && keys.includes("headings") && !hasLevelOneBreak(scan, (offset) => folded.has(lineAt(offset)))) {
    fails.push(
      "script.js: up to postext 1.4 any `headings` object drops the default H1 page break; restate it: " +
        "`levels: [{ level: 1, breakBefore: { … } }]`, or pin postext ≥ 1.5.0, which keeps it (gotcha headings-drop-h1-break)",
    );
  }

  // Engine traps.
  for (const m of ownCode.matchAll(/\bfontFamily\s*:\s*(['"`])([^'"`\n]*)\1/g)) {
    if (m[2].includes(",")) {
      fails.push(`${at(m.index ?? 0)}: fontFamily names one family, not a stack ("${m[2]}"): the engine sets the first name and ignores the rest`);
    }
  }
  if (before15) {
    for (const m of ownCode.matchAll(/\bnumberFormat\s*:\s*['"`]decimal['"`]/g)) {
      fails.push(`${at(m.index ?? 0)}: up to postext 1.4 ordered lists use numberFormat: 'arabic' ('decimal' prints "undefined"); pin postext ≥ 1.5.0 to write 'decimal'`);
    }
  }
  for (const m of ownBare.matchAll(/\bbitmap\s*:\s*\{/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    // ownBare, not scan.bare: blanking the content and kit lines shifts every offset after them.
    const body = ownBare.slice(open, matchBracket(ownBare, open) + 1);
    if (!/\bwidth\s*:/.test(body) || !/\bheight\s*:/.test(body)) {
      fails.push(`${at(open)}: bitmaps declare width and height at print size`);
    }
  }
  const clock: [RegExp, string][] = [
    [/\bMath\s*\.\s*random\s*\(/g, "Math.random() (use a seeded Mulberry32)"],
    [/\bDate\s*\.\s*now\s*\(/g, "Date.now()"],
    [/\bnew\s+Date\s*\(\s*\)/g, "new Date()"],
    [/\bcrypto\s*\.\s*(getRandomValues|randomUUID)\s*\(/g, "crypto randomness"],
  ];
  for (const [pattern, what] of clock) {
    for (const m of ownBare.matchAll(pattern)) fails.push(`${at(m.index ?? 0)}: no ${what}: captures must be deterministic`);
  }
  for (const lit of ownLiterals) {
    if (/<marker\b|<filter\b|<mask\b|\sfilter=|\smask=/.test(lit.text)) {
      fails.push(`${at(lit.start)}: SVG without <marker>, filters or masks (they fall back to raster)`);
    }
  }

  // Network.
  const urls: { url: string; where: string; dynamic: boolean }[] = [];
  for (const lit of scan.literals) {
    const line = lineAt(lit.start);
    if (lit.kind === "regex" || composed.ranges.content.some(([a, b]) => line >= a && line <= b)) continue;
    for (const m of lit.text.matchAll(/https?:\/\/[^\s'"`<>()\\]+/g)) {
      const found = m[0];
      const cut = found.indexOf("\u0000");
      urls.push({ url: cut === -1 ? found : found.slice(0, cut), where: at(lit.start), dynamic: cut !== -1 });
    }
  }
  const markup = [
    ...[...sources.html.matchAll(/\b(?:src|href)\s*=\s*["'](https?:[^"']+)["']/g)].map((m) => ({ url: m[1], where: "index.html" })),
    ...[...sources.css.matchAll(/url\(\s*["']?(https?:[^"')]+)["']?\s*\)|@import\s+["'](https?:[^"']+)["']/g)].map((m) => ({
      url: m[1] ?? m[2],
      where: "style.css",
    })),
    ...[...(sources.pen.stylesheets ?? []), ...(sources.pen.scripts ?? [])].map((u) => ({ url: u, where: "pen.json" })),
  ];
  for (const { url: u, where } of markup) urls.push({ url: u, where, dynamic: false });
  for (const { url: u, where, dynamic } of urls) {
    if (NAMESPACE_URL.test(u)) continue;
    if (dynamic && !/^https:\/\/[^/]+\//.test(u)) {
      fails.push(`${where}: the host of ${u}… is computed; fetch from a fixed allowed host`);
      continue;
    }
    if (!isAllowedUrl(dynamic ? u + "x" : u)) {
      fails.push(`${where}: ${u}${dynamic ? "…" : ""} is not on the network allowlist (${NETWORK_ALLOWLIST.map((r) => r.host + (r.path ?? "")).join(", ")})`);
      continue;
    }
    const gh = /^https:\/\/cdn\.jsdelivr\.net\/gh\/drnachio\/postext@([^/]+)\/(.+)$/.exec(u);
    if (gh && !dynamic) {
      const repoPath = decodeURIComponent(gh[2]);
      const local = new RegExp(`^cookbook/${slug}/(assets/.+)$`).exec(repoPath);
      if (local ? !sources.assets.includes(local[1]) : repoFileExists && !repoFileExists(repoPath)) {
        fails.push(`${where}: ${repoPath} does not exist in the repo`);
      }
    }
  }
  for (const m of ownCode.matchAll(/\basset\(\s*(['"`])([^'"`\n]+)\1\s*\)/g)) {
    if (!sources.assets.includes(`assets/${m[2]}`)) fails.push(`${at(m.index ?? 0)}: asset('${m[2]}'): no assets/${m[2]} in the recipe folder`);
  }

  // Kit functions the recipe calls.
  const defined = kit ? kitFunctions(kit) : null;
  if (defined) {
    const usedBlocks = new Set<KitBlock>(["core", "fonts", "viewer"]);
    // A function two blocks declare (showBook: cjk and book) is satisfied
    // by either; the message names the last, the one for new recipes.
    for (const [name, blocks] of defined) {
      if (!referencesIdentifier(ownBare, name)) continue;
      const listed = blocks.filter((block) => meta.kit?.includes(block));
      for (const block of listed) usedBlocks.add(block);
      if (!listed.length) {
        fails.push(`script.js: calls ${name}() from the "${blocks[blocks.length - 1]}" kit block, which recipe.json "kit" does not list`);
      }
    }
    for (const [name, needs] of Object.entries(KIT_CALLS)) {
      if (!referencesIdentifier(ownBare, name)) continue;
      for (const block of needs) {
        usedBlocks.add(block);
        if (!meta.kit?.includes(block)) fails.push(`script.js: ${name}() needs the "${block}" kit block, which recipe.json "kit" does not list`);
      }
    }
    for (const block of meta.kit ?? []) {
      if (!usedBlocks.has(block)) warns.push(`recipe.json: the "${block}" kit block is inlined but never called`);
    }
  }
  if (meta.downloads?.pdf && !/\bofferPdf\s*\(/.test(ownBare)) {
    fails.push("script.js: downloads.pdf needs offerPdf(…) (the capture clicks its button)");
  }
  if (!/^const FONTS = \{/m.test(ownCode)) fails.push("script.js: declare every face in `const FONTS = { Family: ['400', '400i'] }`");
  // The faces reach the engine from the kit (`kitFonts(FONTS)`, or `loadFonts`
  // under the cjk, arabic and comics blocks) or from a bundle's own files
  // (`loadBundleFonts(bundle)`, the bundle API).
  else if (!/\b(?:loadFonts|kitFonts)\s*\(\s*FONTS\b|\bloadBundleFonts\s*\(/.test(ownBare)) {
    warns.push("script.js: load the faces before the build: `buildDocumentWithFonts(content, config, kitFonts(FONTS))`, or `loadBundleFonts(bundle)` for a bundle's own files");
  }

  // Content files.
  const cjkKit = meta.kit?.includes("cjk") ?? false;
  const arabicKit = meta.kit?.includes("arabic") ?? false;
  let cjkText = false;
  let japaneseText = false;
  let arabicText = false;
  let arabicBook = false;
  // The files this edition sets, whose script decides its fonts and locale:
  // its own language's, else the first sample language's for a slot it
  // lacks. Every file still gets the length, syntax and voice checks.
  const slotOf = (key: string) => key.split(".").slice(0, -1).join(".");
  const inEdition = (key: string): boolean => {
    const lang = key.split(".").pop();
    if (lang === composed.variant) return true;
    const slot = slotOf(key);
    return lang === meta.sample.locales[0] && sources.content[slot ? `${slot}.${composed.variant}` : composed.variant] === undefined;
  };
  for (const [key, text] of Object.entries(sources.content)) {
    const file = `content.${key}.md`;
    const edition = inEdition(key);
    // Chinese and Japanese have no spaces: their characters count, 1.7 (Chinese)
    // or 2.2 (Japanese, whose kana spell out what Chinese leaves to one
    // character) to the word.
    const length = textLength(text);
    if (length.total > LIMITS.contentWords) {
      const chinese = length.cjk - length.japanese;
      const kinds = [chinese ? `${thousands(chinese)} Chinese` : "", length.japanese ? `${thousands(length.japanese)} Japanese` : ""];
      const rates = chinese && length.japanese
        ? `Chinese counts ${CJK_CHARS_PER_WORD} characters to the word, Japanese ${JAPANESE_CHARS_PER_WORD}`
        : `${chinese ? CJK_CHARS_PER_WORD : JAPANESE_CHARS_PER_WORD} characters count as a word`;
      fails.push(length.cjk
        ? `${file}: ${kinds.filter(Boolean).join(" and ")} characters${length.words ? ` and ${thousands(length.words)} words` : ""}, ` +
          `about ${thousands(length.total)} words (at most ${thousands(LIMITS.contentWords)}; ${rates})`
        : `${file}: ${length.words} words (at most ${LIMITS.contentWords})`);
    }
    // Japanese when its kana sentences outweigh the rest: a Chinese page
    // that quotes a Japanese title stays Chinese.
    // A Latin edition that keeps one Japanese sound effect (ドン) stays Latin: the
    // kana must also outweigh its Latin words.
    if (edition && length.japanese * 2 > length.cjk && length.japanese > length.words) japaneseText = true;
    for (const line of malformedResourceEmbeds(text)) fails.push(`${file}: "${line}" is not \`::resource{id="…"}\` (double quotes, id only) or, on a composed page, \`::resource{id="…" slot="…"}\``);
    for (const name of markdownConstructs(text).unknown) fails.push(`${file}: ":::${name}" is not a Postext directive (it prints as text)`);
    fails.push(...unquotedFrontmatter(text, file));
    // Original sample prose gets the same voice check as the write-ups
    // (quoted public-domain or CC BY text is left as its authors wrote it).
    // Em dashes are not counted: fiction and verse use them for dialogue.
    if ((meta.credits?.text ?? []).length === 0) {
      const style = styleMessages(file, text, (key.split(".").pop() as Locale) ?? "en", { emDashLimit: 0 });
      fails.push(...style.fails);
      warns.push(...style.warns);
    }
    const odd = nonLatin(text);
    if (edition && odd.cjk.length) cjkText = true;
    // CJK text is set in faces the cjk block loads by slices, on screen and
    // in the PDF; without it, the kit loads the latin file of every face.
    if (odd.cjk.length && !cjkKit) {
      warns.push(`${file}: Chinese, Japanese or Korean text needs the cjk kit block: load its faces with loadCjkFonts(FONTS, markdown) (gotcha cjk-fonts-slices)`);
    }
    const historic = odd.cjk.filter((ch) => isHistoricKana(ch.codePointAt(0) ?? 0));
    if (historic.length) {
      warns.push(`${file}: hentaigana and archaic kana (${historic.slice(0, 8).join(" ")}) are in no file of a Fontsource Japanese face: ` +
        "loadCjkFonts fails on them and the PDF prints boxes; write the modern kana, or set them in a face the recipe ships in its assets (gotcha ja-fonts-kana)");
    }
    // Arabic letters are set from the arabic file of an Arabic face, which
    // loadFonts never fetches: the arabic block does, unless the recipe
    // builds its own FontFace (a face from its assets).
    if (odd.arabic.length) {
      if (edition) arabicText = true;
      // The main sample sets the book's language; a named slot in Arabic is another
      // lettering or a quotation (a manga's Arabic edition behind a button), which keeps it.
      if (edition && mostlyArabic(text) && !slotOf(key)) arabicBook = true;
      if (!arabicKit && !/\bnew\s+FontFace\s*\(/.test(ownBare)) {
        fails.push(`${file}: Arabic text needs an Arabic face: list the arabic kit block and load the faces with ` +
          "loadArabicFonts(FONTS, markdown) after loadFonts (gotcha arabic-fonts-subset)");
      }
    }
    // The kit's PDF providers add a face's latin-ext file for the letters only
    // it has (ō ǎ č †), and fontsourceProvider its greek file (α χ), so those
    // reach the PDF as they reach the screen; the capture's C25 names any
    // face that ships no such file.
    const beyond = odd.other.filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return !isLatinExtOnly(code) && (cjkKit || !isGreek(code));
    });
    if (pdfOutput && beyond.length) {
      const shown = beyond.slice(0, 8).join(" ");
      warns.push(cjkKit
        ? `${file}: characters outside Fontsource latin, latin-ext and the CJK blocks (${shown}) reach the PDF only in a CJK face ` +
          "(cjkPdfProvider takes every file it needs) or a face the pen's own provider serves"
        : `${file}: characters outside Fontsource latin, latin-ext and greek (${shown}) reach the PDF only in a face the pen's own provider serves`);
    }
  }
  if (cjkKit) lintCjk(scan, ownCode, ownBare, postextNames, pdfOutput && cjkText, cjkText, japaneseText, fails, warns);
  if (arabicText) lintArabic(scan, ownBare, arabicKit && pdfOutput, arabicBook, fails);
  // A book bound on its right edge lies open mirrored; the book block's
  // showBook (the cjk block has the same) shows it so. The binding is the
  // engine's (resolvePageBinding): page.binding as written, else 'auto',
  // the right edge for vertical text, for text that runs right to left
  // (direction, else the script of locale) and for a book with a comics
  // section whose comics read right to left (comicReadingDirection:
  // readingDirection as written, else rtl in a Japanese or Traditional
  // Chinese edition, else the art's direction).
  const binding = configString(scan, "page.binding");
  const direction = configString(scan, "direction");
  const locale = configString(scan, "locale");
  const rtl = direction === "rtl" || ((direction === undefined || direction === "auto") &&
    RTL_SCRIPTS.has(tagScript(locale) ?? ""));
  const vertical = configString(scan, "layout.writingMode") === "vertical-rl";
  const comicAsked = configString(scan, "comics.readingDirection") ?? /\breadingDirection\s*:\s*['"](ltr|rtl)['"]/.exec(js)?.[1];
  const comicArtRtl = (configString(scan, "comics.artDirection") ?? /\bartDirection\s*:\s*['"](ltr|rtl)['"]/.exec(js)?.[1]) === "rtl";
  const comicRtl = keys.includes("comics") && (comicAsked === "rtl" || (comicAsked !== "ltr" &&
    (rtl || vertical || COMICS_RTL_SCRIPTS.has(tagScript(locale) ?? "") || comicArtRtl)));
  const rightBound = binding === "right" || ((binding === undefined || binding === "auto") &&
    (vertical || rtl || comicRtl));
  if (rightBound && /\bshowPages\s*\(/.test(ownBare) && !/\bshowBook\s*\(/.test(ownBare)) {
    warns.push("script.js: a right-bound book shows its spreads mirrored with showBook(…) from the book kit block (gotcha cjk-spread-order)");
  }

  // Size.
  if (composed.ownLines > LIMITS.ownLines) fails.push(`script.js: ${composed.ownLines} lines of recipe code (at most ${LIMITS.ownLines})`);
  else if (composed.ownLines > LIMITS.ownLinesWarn[meta.level]) {
    warns.push(`script.js: ${composed.ownLines} lines of recipe code (aim for ≤ ${LIMITS.ownLinesWarn[meta.level]} at level ${meta.level})`);
  }
  const scriptBytes = bytes(js);
  if (scriptBytes > LIMITS.scriptBytes) fails.push(`the composed script weighs ${Math.round(scriptBytes / 1024)} KB (at most ${LIMITS.scriptBytes / 1024} KB)`);
  const prefill = bytes(defineData(composed, { title: "x".repeat(80), description: "x".repeat(320), tags: ["postext"] }));
  if (prefill > LIMITS.prefillBytes) fails.push(`the CodePen prefill weighs ${Math.round(prefill / 1024)} KB (at most 96 KB)`);
  const long = lines.map((line, i) => (!folded.has(i + 1) && [...line].length > LIMITS.lineLength ? i + 1 : 0)).filter(Boolean);
  if (long.length) {
    warns.push(`script.js: ${long.length} line${long.length === 1 ? "" : "s"} over ${LIMITS.lineLength} characters (line ${long.slice(0, 5).join(", ")})`);
  }

  // Level rubric.
  const suggested = staticLevel(js, { apis: [...used], configKeys: keys });
  if (meta.level && Math.abs(meta.level - suggested) >= 2) {
    warns.push(`recipe.json: level ${meta.level}, but the code reads as level ${suggested} (rubric §2.3)`);
  }
  return { fails: [...new Set(fails)], warns: [...new Set(warns)] };
}

/** Whether a recipe pins an engine older than `version`: the traps fixed in
 *  that release still bind its script. A recipe with no readable pin is read
 *  as current (`validateRecipeMeta` fails the pin itself). */
function pinnedBefore(meta: Pick<RecipeMeta, "engine">, version: string): boolean {
  const pinned = meta.engine?.postext;
  return typeof pinned === "string" && /^\d+\.\d+\.\d+$/.test(pinned) && compareSemVer(pinned, version) < 0;
}

/** True when some object literal in the recipe's own code has `level: 1`
 *  and a `breakBefore` key. */
function hasLevelOneBreak(scan: ReturnType<typeof scanJs>, isFolded: (offset: number) => boolean): boolean {
  for (const m of scan.bare.matchAll(/\blevel\s*:\s*1(?![\d.])/g)) {
    const offset = m.index ?? 0;
    if (isFolded(offset)) continue;
    let depth = 0;
    let open = -1;
    for (let i = offset; i >= 0; i--) {
      const c = scan.bare[i];
      if (c === "}" || c === "]" || c === ")") depth++;
      else if (c === "{" || c === "[" || c === "(") {
        if (depth === 0) {
          open = i;
          break;
        }
        depth--;
      }
    }
    if (open === -1 || scan.bare[open] !== "{") continue;
    const close = matchBracket(scan.bare, open);
    if (/\bbreakBefore\s*:/.test(scan.bare.slice(open, close + 1))) return true;
  }
  return false;
}

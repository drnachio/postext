// Everything the checks need from the page, as JSON.
import { composedFacts } from './composed.js';
import { plain, lineOf, loadedFaces, slicedFamilies, rangedFamilies, rangesOf, parseFont, hasFace, hexOf, dimPt } from './fonts.js';
import { collectKeys, walkPainted, pageBlocks, mathErrorsOf, pageHeading } from './paint.js';
import { record, pick, indexOfBuild, engineOf, pagesOf, sourceOf, FALLBACK_DIRECTIVES, FALLBACK_CONTAINERS, CLOSE_RE, COMPOSED_CLOSE_RE, COMPOSED_OPEN_RE, DIRECTIVE_RE, COMIC_FENCES, RESOURCE_RE, RESOURCE_SLOT_RE, spansOf, LATIN, MAIN_COLOR, TEXT_WARNING_KINDS, layoutDetail, comicDetail } from './record.js';
import { legibility, vdtText } from './render.js';
import { round } from './settle.js';

/**
 * Everything the checks need, as JSON. `select` is capture.doc; `hero` the
 * 1-based hero pages (for C26).
 */
export function facts({ select = 'last', hero = [] } = {}) {
  const cb = record();
  const out = {
    builds: cb.builds.map((b) => ({
      kind: b.kind, shim: b.shim, ms: round(b.ms ?? 0, 0.1), at: round(b.at ?? 0),
      pages: (b.docs ?? []).reduce((sum, doc) => sum + (doc?.pages?.length ?? 0), 0),
    })),
    selected: -1,
    importedAt: round(cb.importedAt ?? 0),
    registered: [...new Set(cb.images ?? [])],
    state: document.documentElement.dataset.postext ?? null,
    status: document.getElementById('pt-status')?.textContent ?? null,
    pdfButton: !!document.querySelector('[data-postext-pdf]'),
  };
  const build = pick(select);
  if (!build || !build.docs?.length) return out;
  out.selected = indexOfBuild(build);
  if (build.picked) out.selectedBuilds = build.picked.map((b) => cb.builds.indexOf(b));
  const engine = engineOf(build);
  const docs = build.docs;
  const resolved = docs[0].config;
  const dpi = resolved.page.dpi;
  const pages = pagesOf(build);
  const source = sourceOf(build);
  const user = source.config ? plain(source.config) : null;
  // `resourceTypes: defaultResourceTypes(LANG)` is one setting, not dozens of leaves.
  if (Array.isArray(user?.resourceTypes) && typeof engine.defaultResourceTypes === 'function') {
    const given = JSON.stringify(user.resourceTypes);
    const lang = [...new Set([user.locale, 'en', 'es', 'zh'].filter((l) => typeof l === 'string'))]
      .find((l) => JSON.stringify(plain(engine.defaultResourceTypes(l))) === given);
    if (lang) user.resourceTypes = `defaultResourceTypes('${lang}')`;
  }
  out.sourceKnown = source.known;
  out.userConfig = user;
  out.markdowns = source.markdowns;
  out.resources = source.resources.map((r) => ({
    id: r.id, kind: r.kind, typeId: r.typeId, note: !!r.note,
    fileId: r.bitmap?.fileId ?? r.svg?.fileId ?? null,
    placement: r.placement ? plain(r.placement) : null,
    styleId: r.table?.styleId ?? null,
  }));

  // C7–C10: the markdown, parsed by the pinned engine.
  const known = {
    directives: engine.KNOWN_DIRECTIVES ? [...engine.KNOWN_DIRECTIVES] : FALLBACK_DIRECTIVES,
    containers: engine.KNOWN_CONTAINERS ? [...engine.KNOWN_CONTAINERS] : FALLBACK_CONTAINERS,
  };
  const fenceNames = new Set([...known.directives, ...known.containers]);
  const parseIssues = [];
  const badFences = [];
  const directives = new Set();
  const inline = new Set();
  const unknownStyles = [];
  const unknownRefs = [];
  const ids = (list) => new Set((list ?? []).map((s) => s.id));
  const styleIds = {
    callout: ids(resolved.calloutStyles), paragraphs: ids(resolved.paragraphStyles),
    chip: ids(resolved.chipStyles), heading: ids(resolved.headingStyles), table: ids(resolved.tableStyles),
  };
  const userCallouts = (user?.calloutStyles ?? []).length > 0;
  const paletteIds = new Set((user?.colorPalette ?? resolved.colorPalette ?? []).map((entry) => entry.id));
  const resourceIds = new Set(source.resources.map((r) => r.id));
  let partPalette = false;
  const parsed = source.markdowns.map((markdown, chapter) => {
    const body = engine.extractFrontmatter ? engine.extractFrontmatter(markdown).content : markdown;
    let result = { blocks: [], issues: [] };
    try {
      result = engine.parseMarkdownWithIssues(body);
    } catch (error) {
      parseIssues.push({ chapter, kind: 'parserError', line: 0, excerpt: String(error?.message ?? error) });
    }
    for (const issue of result.issues ?? []) {
      parseIssues.push({
        chapter, kind: issue.kind, line: lineOf(body, issue.sourceStart),
        excerpt: body.slice(issue.sourceStart, issue.sourceStart + 60).split('\n')[0],
      });
    }
    // A comic's body (:::page, :::strip) is read by the comic parser: its
    // ::panel lines and its script are not Markdown fences.
    let comicBody = false;
    // A :::figure's ::label lines (#860) are its labels, not embeds.
    let figureBody = false;
    // A :::label container inside a figure (#1058): its lines are the
    // label's, and its first ::: closes the label, not the figure.
    let labelBody = false;
    body.split('\n').forEach((raw, i) => {
      const line = raw.trim();
      if (comicBody) {
        if (CLOSE_RE.test(line)) comicBody = false;
        return;
      }
      if (labelBody) {
        if (CLOSE_RE.test(line)) labelBody = false;
        return;
      }
      if (figureBody && /^:::label\{/.test(line)) { directives.add('label'); labelBody = true; return; }
      if (line.startsWith('::::')) {
        if (COMPOSED_CLOSE_RE.test(line)) return;
        if (COMPOSED_OPEN_RE.test(line)) { directives.add('page'); return; }
        badFences.push({ chapter, line: i + 1, text: line.slice(0, 80), name: /^:+\s*([\w-]*)/.exec(line)?.[1] ?? '' });
      } else if (line.startsWith(':::')) {
        if (CLOSE_RE.test(line)) { figureBody = false; return; }
        const m = DIRECTIVE_RE.exec(line);
        if (m && fenceNames.has(m[1])) {
          directives.add(m[1]);
          if (COMIC_FENCES.has(m[1])) comicBody = true;
          if (m[1] === 'figure') figureBody = true;
          return;
        }
        badFences.push({ chapter, line: i + 1, text: line.slice(0, 80), name: /^:::\s*([\w-]*)/.exec(line)?.[1] ?? '' });
      } else if (/^::[a-z]/i.test(line)) {
        if (RESOURCE_RE.test(line) || RESOURCE_SLOT_RE.test(line)) { directives.add('resource'); return; }
        if (figureBody && line.startsWith('::label[')) { directives.add('label'); return; }
        // A figure's own words (#935): ::alt, ::caption and ::note stand beside its labels.
        if (figureBody && /^::(alt|caption|note)\[/.test(line)) return;
        // An exercise's word bank (#1225).
        if (line.startsWith('::bank[')) { directives.add('bank'); return; }
        badFences.push({ chapter, line: i + 1, text: line.slice(0, 80), name: /^::([\w-]*)/.exec(line)?.[1] ?? '' });
      }
    });
    return { chapter, body, blocks: result.blocks ?? [] };
  });
  // Anchors a :ref may name besides resources (postext >= 1.12): headings
  // with an id and anchors set in the text, in any chapter.
  const anchorIds = new Set();
  for (const { blocks } of parsed) {
    for (const block of blocks) {
      if (block.type === 'heading' && block.attrs?.id) anchorIds.add(block.attrs.id);
      for (const mark of block.anchorMarks ?? []) anchorIds.add(mark.anchorId);
    }
  }
  const refTarget = (id) => resourceIds.has(id) || anchorIds.has(id)
    || /^(sec|fig|tbl|eq|lst):/.test(id) && (resourceIds.has(id.slice(id.indexOf(':') + 1)) || anchorIds.has(id.slice(id.indexOf(':') + 1)));
  for (const { chapter, body, blocks } of parsed) {
    const at = (block) => `chapter ${chapter + 1}, line ${lineOf(body, block.sourceStart)}`;
    for (const block of blocks) {
      const attrs = block.containerAttrs ?? {};
      if (block.type === 'containerStart' && block.containerName === 'callout'
        && attrs.type !== undefined && userCallouts && !styleIds.callout.has(attrs.type)) {
        unknownStyles.push({ what: 'callout type', id: attrs.type, at: at(block) });
      }
      if (block.type === 'containerStart' && block.containerName === 'paragraphs'
        && attrs.style !== undefined && !styleIds.paragraphs.has(attrs.style)) {
        unknownStyles.push({ what: 'paragraph style', id: attrs.style, at: at(block) });
      }
      if (block.type === 'containerStart' && block.containerName === 'part' && attrs.palette) {
        partPalette = true;
        for (const m of attrs.palette.matchAll(/([a-z0-9_-]+)\s*[=:]/gi)) {
          if (!paletteIds.has(m[1])) unknownStyles.push({ what: 'palette id', id: m[1], at: at(block) });
        }
      }
      if (block.type === 'heading' && block.attrs?.style !== undefined && !styleIds.heading.has(block.attrs.style)) {
        unknownStyles.push({ what: 'heading style', id: block.attrs.style, at: at(block) });
      }
      if (block.type === 'resourceBlock' && block.resourceId !== undefined && !resourceIds.has(block.resourceId)) {
        unknownRefs.push({ usage: '::resource', id: block.resourceId, at: at(block) });
      }
    }
    for (const { span, block } of spansOf(blocks)) {
      if (span.ref) {
        inline.add('ref');
        if (!refTarget(span.ref.resourceId)) unknownRefs.push({ usage: ':ref', id: span.ref.resourceId, at: at(block) });
      }
      if (span.chip) {
        inline.add('chip');
        // An exercise's `[[…]]` is a gap the engine sets with chip styles of its own.
        if (span.chip.style !== undefined && !span.chip.gap && !styleIds.chip.has(span.chip.style)) {
          unknownStyles.push({ what: 'chip style', id: span.chip.style, at: at(block) });
        }
      }
      if (span.swatch) inline.add('swatch');
      if (span.math) inline.add('math');
      if (span.script) inline.add(span.script);
    }
  }
  for (const r of source.resources) {
    if (r.table?.styleId && !styleIds.table.has(r.table.styleId)) {
      unknownStyles.push({ what: 'table style', id: r.table.styleId, at: `resource "${r.id}"` });
    }
  }
  // Resource ids named by the config (design images, callout icons and
  // markers) and by table cells.
  for (const { value, at } of [
    ...collectKeys(source.config, /^resourceId$/).map((x) => ({ ...x, at: `config.${x.at}` })),
    ...collectKeys(source.resources, /^resourceId$/).map((x) => ({ ...x, at: `resources${x.at}` })),
  ]) {
    if (typeof value === 'string' && value.includes('{')) {
      // A templated design image id (postext ≥ 1.8): '{attr.art}' names the
      // resource each heading or part gives it; check every value the
      // document fills in. Other placeholders are resolved at layout only.
      const ATTR = /\{attr\.([A-Za-z_][A-Za-z0-9_-]*)\}/g;
      const keys = [...value.matchAll(ATTR)].map((m) => m[1]);
      if (keys.length === 0) continue;
      for (const { chapter, body, blocks } of parsed) {
        for (const block of blocks) {
          const attrs = block.attrs ?? block.containerAttrs;
          if (!attrs || !keys.some((k) => attrs[k] !== undefined)) continue;
          const id = value.replace(ATTR, (_, k) => attrs[k] ?? '').trim();
          if (id && !id.includes('{') && !resourceIds.has(id)) {
            unknownRefs.push({ usage: `resourceId ${value}`, id, at: `chapter ${chapter + 1}, line ${lineOf(body, block.sourceStart)}` });
          }
        }
      }
      continue;
    }
    if (!resourceIds.has(value)) unknownRefs.push({ usage: 'resourceId', id: value, at });
  }
  const counts = new Map();
  for (const r of source.resources) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
  const duplicates = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
  Object.assign(out, { known, parseIssues, badFences, unknownStyles, unknownRefs, duplicates,
    directives: [...directives].sort(), inline: [...inline].sort() });

  // C11: images the pages place but nobody registered (grey placeholders).
  const placed = new Map();
  // A video's own file is no picture: the pages draw its poster.
  const videoFiles = new Set(source.resources.map((r) => r.video?.fileId).filter(Boolean));
  for (const { page, n } of pages) {
    for (const { value } of collectKeys(page, /^(fileId|iconFileId|markerFileId)$/)) {
      if (!placed.has(value) && !videoFiles.has(value)) placed.set(value, n);
    }
  }
  const registered = (fileId) => (typeof engine.getResourceImage === 'function'
    ? !!engine.getResourceImage(fileId) : (cb.images ?? []).includes(fileId));
  out.unregistered = [...placed].filter(([fileId]) => !registered(fileId)).map(([fileId, n]) => ({ fileId, page: n }));

  // C12, C16, C25: the faces and text the renderer paints.
  const loaded = loadedFaces();
  const sliced = slicedFamilies();
  const ranged = rangedFamilies();
  const used = new Map();
  const garbage = [];
  const outside = new Map();
  // Characters outside latin that a loaded file of their own face holds
  // (ō from the latin-ext file loadFonts adds): set on screen from it, and
  // in the PDF when the provider adds that file too (cjkPdfProvider does).
  const ownFile = new Map();
  // C12: a character set in a CJK or Arabic face from a file that was not
  // loaded when the layout ran was measured in a fallback face (loadCjkFonts
  // was not given it, or loadArabicFonts not the weight). The shim notes the
  // faces loaded as each build starts.
  const atLayout = new Map();
  for (const [family, weight, style, range] of build.fonts ?? []) {
    if (!sliced.has(family)) continue;
    const list = atLayout.get(family) ?? [];
    list.push({ weight, style, ranges: rangesOf(range) });
    atLayout.set(family, list);
  }
  const late = new Map();
  const judged = new Set();
  const placeholders = new Set([engine.MATH_PLACEHOLDER, engine.SWATCH_PLACEHOLDER, engine.CHIP_PLACEHOLDER, '￼'].filter(Boolean));
  walkPainted(pages, (font, text, where) => {
    const face = font ? parseFont(font) : null;
    if (face) {
      const key = `${face.family}|${face.weight}|${face.style}`;
      if (!used.has(key)) used.set(key, { family: face.family, weight: face.weight, style: face.style, where });
    }
    if (/\bundefined\b|\bNaN\b/.test(text) && garbage.length < 10) garbage.push({ text: text.slice(0, 80), where });
    const covered = face ? sliced.get(face.family) : null;
    for (const ch of text) {
      if (placeholders.has(ch)) continue;
      const cp = ch.codePointAt(0);
      if (LATIN.some(([a, b]) => cp >= a && cp <= b) || outside.has(ch)) continue;
      // A CJK or Arabic face loaded by slices takes the character from its own files.
      if (covered?.some(([a, b]) => cp >= a && cp <= b)) continue;
      if (face && ranged.get(face.family)?.some(([a, b]) => cp >= a && cp <= b)) {
        if (!ownFile.has(ch)) ownFile.set(ch, where);
        continue;
      }
      outside.set(ch, where);
    }
    if (!face || !build.fonts || !atLayout.has(face.family)) return;
    const key = `${face.family}|${face.weight}|${face.style}`;
    for (const ch of new Set(text)) {
      if (!/\S/.test(ch) || placeholders.has(ch) || judged.has(`${key}|${ch}`)) continue;
      judged.add(`${key}|${ch}`);
      const cp = ch.codePointAt(0);
      // A character no file of the family has is C25's (nonLatin).
      if (!covered?.some(([a, b]) => cp >= a && cp <= b)) continue;
      const ready = atLayout.get(face.family).some((f) => {
        if (f.style !== face.style) return false;
        const [low, high = low] = String(f.weight).split(' ').map(Number);
        return face.weight >= low && face.weight <= high && f.ranges.some(([a, b]) => cp >= a && cp <= b);
      });
      if (ready) continue;
      const entry = late.get(key) ?? { family: face.family, weight: face.weight, style: face.style, chars: '', where };
      if ([...entry.chars].length < 12) entry.chars += ch;
      late.set(key, entry);
    }
  });
  out.faces = {
    used: [...used.values()].sort((a, b) => `${a.family}${a.weight}${a.style}`.localeCompare(`${b.family}${b.weight}${b.style}`)),
    loaded,
  };
  out.faces.missing = out.faces.used.filter((f) => !hasFace(loaded, f.family, f.weight, f.style));
  if (late.size) out.faces.late = [...late.values()];
  out.garbage = garbage;
  const codeOf = (ch) => `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  out.nonLatin = [
    ...[...outside].map(([ch, where]) => ({ ch, code: codeOf(ch), where })),
    ...[...ownFile].filter(([ch]) => !outside.has(ch)).map(([ch, where]) => ({ ch, code: codeOf(ch), where, ownFile: true })),
  ].slice(0, 40);

  // C17: the default skin, read off the resolved config and the pages.
  const all = pages.flatMap((p) => pageBlocks(p.page).map((block) => ({ block, n: p.n, doc: p.doc })));
  const headingLevels = [...new Set(all
    .filter(({ block }) => block.type === 'heading' && !block.hidden && !block.designOverlay)
    .map(({ block }) => block.headingLevel))].sort();
  const bt = resolved.bodyText;
  out.defaultSkin = {
    body: bt.fontFamily === 'EB Garamond' && Number(bt.fontSize?.value) === 8 && bt.fontSize?.unit === 'pt',
    headingLevels: headingLevels.filter((level) => {
      const def = resolved.headings.levels.find((l) => l.level === level);
      return def && def.fontFamily === 'Open Sans' && hexOf(def.color) === MAIN_COLOR;
    }),
    header: user ? !('header' in user) : null,
    footer: user ? !('footer' in user) : null,
    colors: ['boldColor', 'italicColor', 'referenceColor'].filter((key) => hexOf(bt[key]) === MAIN_COLOR),
    callouts: all.filter(({ block }) => {
      if (!block.callout) return false;
      const style = (resolved.calloutStyles ?? []).find((s) => s.id === block.callout.styleId);
      return !!style && style.backgroundEnabled && hexOf(style.background) === '#F4F4F4' && !style.stripe?.enabled;
    }).length,
    tables: all.filter(({ block }) => {
      const table = block.resourceBlock?.table;
      return !!table && (table.rules ?? 'grid') === 'grid' && hexOf(table.headerBackground) === '#F0F0F0';
    }).length,
    lists: all.filter(({ block }) => block.type === 'listItem' && hexOf(block.bulletColor) === MAIN_COLOR).length,
    palette: user ? !(user.colorPalette?.length > 0) : null,
  };

  // C32: formulas set as an error box.
  out.mathErrors = mathErrorsOf(pages);

  // C5, C6, C24: the engine's own diagnostics.
  // A document's page `pageIndex` is page `nOf(doc) + pageIndex`.
  const firstN = new Map();
  for (const p of pages) if (!firstN.has(p.doc)) firstN.set(p.doc, p.n - p.page.index);
  const nOf = (doc, pageIndex) => (firstN.get(doc) ?? 1) + pageIndex;
  out.warnings = docs.flatMap((doc) => (doc.warnings ?? []).map((w) => ({
    kind: w.kind, page: nOf(doc, w.pageIndex), overflowPx: round(w.overflowPx ?? 0, 0.1),
  })));
  // The index's own warnings are content warnings the source checks (C7–C10)
  // cannot see: the expansion raises them with the whole book's marks (#172).
  out.indexWarnings = docs.flatMap((doc) => (doc.contentWarnings ?? [])
    .filter((w) => /^index[A-Z]/.test(w.kind))
    .map((w) => ({
      kind: w.kind,
      page: w.pageIndex === undefined ? null : nOf(doc, w.pageIndex),
      detail: w.target ?? w.term ?? '',
    })));
  // Content warnings about how the text is set, which no source check sees
  // either: Arabic vowel marks that reach the next line (#376), a word wider
  // than its measure, letter-spacing a joining script ignores (#368), a line
  // number in the side column painted over a side box or float (#621), a
  // `:tab` in vertical text, set as a word space (#622), a paragraph whose
  // drop cap could not be set as configured (#623), a code listing with
  // lines wider than its box (#624), a floated picture that runs past the
  // text block even at its smallest scale (#626; one merely shrunk to its
  // slot is what the recipe asked for), a side box or float set on a page
  // after the text, or on no page at all (#639), a `:::columns` group whose
  // columns are narrower than six ems or whose `flow` the engine does not
  // know (#634), a face the layout measured in a fallback or that the
  // browser synthesizes (#629, the engine's own account of C12), and a comic's (a
  // picture letterboxed in its cell, a balloon that found no room, more
  // panels than cells…), except a speaker with no anchor, which
  // is how an off-panel voice is written.
  out.textWarnings = docs.flatMap((doc) => (doc.contentWarnings ?? [])
    .filter((w) => TEXT_WARNING_KINDS.has(w.kind) || (w.kind === 'floatShrunk' && w.overflowPx !== undefined) || (/^comic[A-Z]/.test(w.kind) && w.kind !== 'comicUnknownSpeaker'))
    .map((w) => ({
      kind: w.kind,
      page: w.pageIndex === undefined ? null : nOf(doc, w.pageIndex),
      detail: layoutDetail(w) ?? (w.kind === 'floatShrunk' ? `${w.resourceId} at ${Math.round(w.scale * 100)} %: ${round(w.overflowPx, 0.1)} px past the text block` : w.kind === 'codeOverflow' ? `${w.mode}: ${w.lines} line(s)${w.lang ? ` of ${w.lang}` : ''}` : w.kind === 'dropCap' ? `${w.reason}${w.handling ? ` (${w.handling})` : ''}: ${w.text}` : w.kind === 'textWrap' ? `${w.resourceId ?? `box ${w.box ?? ''}`.trim()}: ${w.reason}` : w.text ?? (w.kind === 'lineNumberOverlap' ? `line ${w.number}` : w.kind === 'tabInVerticalText' ? ':tab' : comicDetail(w))),
    })));
  // C34: the justified lines the engine set ragged because their word
  // spaces would have stretched past 3× (#732), from the builds' own
  // `raggedLine` warnings, worst first. Not among TEXT_WARNING_KINDS: C5
  // accepts a kind wholesale, and here a recipe accepts a count.
  const ragged = docs.flatMap((doc) => (doc.contentWarnings ?? [])
    .filter((w) => w.kind === 'raggedLine')
    .map((w) => ({ page: w.pageIndex === undefined ? null : nOf(doc, w.pageIndex), ratio: Math.round(w.ratio * 10) / 10, text: (w.text ?? '').trim() })));
  out.raggedLines = { count: ragged.length, lines: [...ragged].sort((a, b) => b.ratio - a.ratio).slice(0, 5) };
  // C31: config values the engine replaced (a character grid cut to the
  // page, an unknown numbering format, a key no setting has). Every
  // chapter of a book carries its build's warnings: one entry per value.
  const configWarnings = new Map();
  for (const doc of docs) {
    for (const w of doc.configWarnings ?? []) {
      const key = `${w.kind}\0${w.path}\0${w.value}`;
      if (!configWarnings.has(key)) {
        configWarnings.set(key, { kind: w.kind, path: w.path, value: w.value, used: w.used ?? '', ...(w.suggestion ? { suggestion: w.suggestion } : {}) });
      }
    }
  }
  out.configWarnings = [...configWarnings.values()];
  // C37, C38, C40: the composed pages, their warnings and the source map.
  out.composed = composedFacts(engine, docs, { nOf, markdowns: source.markdowns ?? [] });
  out.converged = docs.every((doc) => doc.converged !== false);
  out.iterationCount = Math.max(...docs.map((doc) => doc.iterationCount ?? 0));
  let justified = 0;
  let worst = 0;
  const looseLines = [];
  // Lines of the CJK composer are justified between their characters (the
  // segments' tracking, capped at half an em or bodyText.maxJustifyTracking);
  // one past the cap is set short and flagged cjkLoose.
  let cjkJustified = 0;
  let cjkWorst = 0;
  const cjkShort = [];
  const trackingCap = (doc) => {
    const max = Number(doc.config.bodyText.maxJustifyTracking) || 0;
    return max > 0 ? Math.min(0.5, max / 1000) : 0.5;
  };
  for (const { block, doc, n } of all) {
    const max = doc.config.bodyText.maxWordSpacing ?? 2;
    const emPx = parseFont(block.fontString ?? '')?.px ?? 0;
    for (const line of block.lines ?? []) {
      if (line.cjkComposed || line.cjkLoose) {
        if (line.isLastLine || block.textAlign !== 'justify' || (line.ragged && !line.cjkLoose)) continue;
        cjkJustified++;
        const tracking = Math.max(0, ...(line.segments ?? []).map((seg) => seg.tracking ?? 0));
        if (emPx > 0) cjkWorst = Math.max(cjkWorst, tracking / emPx);
        if (line.cjkLoose) cjkShort.push({ page: n, tracking: emPx > 0 ? round(tracking / emPx, 0.01) : 0, text: (line.text ?? '').trim() });
        continue;
      }
      // The word spacing as the limits bound it (#704): on a line that
      // holds a bold or an italic space the painted ratio reads a little
      // past the limit the breaker kept (`lineWordSpacing` in the engine).
      const ratio = line.justifiedSpaceLimitRatio ?? line.justifiedSpaceRatio;
      if (ratio === undefined || line.isLastLine || line.ragged) continue;
      justified++;
      // A line set at the limit (its tracking took the rest) is not past it:
      // its ratio is the limit give or take the rounding of its widths.
      if (ratio > max + 1e-6) looseLines.push({ page: n, ratio: round(ratio, 0.01), text: (line.text ?? '').trim() });
      worst = Math.max(worst, ratio);
    }
  }
  // C35: the paragraphs set a line short to take up a runt (#733,
  // `VDTBlock.runtFix`), the ones that needed tracking first. A paragraph
  // split over two columns is one (same source range).
  const fixed = new Map();
  for (const { block, doc, n } of all) {
    if (!block.runtFix) continue;
    const key = `${docs.indexOf(doc)}:${block.contentIndex ?? ''}:${block.footnoteNote ?? ''}:${block.calloutPath ?? block.containerId ?? ''}`;
    // The first words as written: a word divided at a line end is put back.
    const text = (block.lines ?? []).map((l) => {
      const t = (l.text ?? '').trim();
      return l.hyphenated && !l.hardHyphen && t.endsWith('-') ? t.slice(0, -1) : `${t} `;
    }).join('').replace(/\s+/g, ' ').trim();
    const cap = Number(doc.config.bodyText.maxRuntTracking) || 0;
    if (!fixed.has(key)) fixed.set(key, { page: n, tracking: Number(block.runtFix.tracking) || 0, text: text.slice(0, 48), atCap: cap > 0 && block.runtFix.tracking >= cap });
  }
  if (fixed.size) {
    const blocks = [...fixed.values()];
    const tracked = blocks.filter((b) => b.tracking > 0).sort((a, b) => b.tracking - a.tracking || a.page - b.page);
    out.runtFixes = { count: blocks.length, tracked: tracked.length, worst: tracked[0]?.tracking ?? 0, atCap: tracked.some((b) => b.atCap), blocks: tracked.slice(0, 5).map(({ page, tracking, text }) => ({ page, tracking, text })) };
  }
  // The loosest lines, for copy-fitting (C24 prints them).
  const loosest = [...looseLines].sort((a, b) => b.ratio - a.ratio).slice(0, 5);
  out.loose = { count: looseLines.length, total: justified, share: justified ? looseLines.length / justified : 0,
    worst: round(worst, 0.01), threshold: bt.maxWordSpacing ?? 2, lines: loosest };
  if (cjkJustified) {
    out.cjkLoose = { count: cjkShort.length, total: cjkJustified, share: cjkShort.length / cjkJustified,
      worst: round(cjkWorst, 0.01), threshold: trackingCap(docs[0]), lines: cjkShort.slice(0, 5) };
  }
  if (docs[0].binding === 'right') out.binding = 'right';
  // A right-to-left document (direction 'rtl', or 'auto' in an Arabic,
  // Hebrew or Persian locale): the resolved config says so only then.
  if (docs[0].config?.direction === 'rtl') out.direction = 'rtl';
  // The digits of a right-to-left document are the locale's choice even when
  // the config does not name them (٠–٩ for 'ar', 0–9 for 'ar-MA'): the resolved
  // config carries numerals only when they are not latn.
  if (docs[0].config?.numerals || out.direction) out.numerals = docs[0].config?.numerals ?? 'latn';

  // Pages: roles, emptiness, coverage, hero legibility, alt-text material.
  const heroSet = new Set(hero);
  out.pages = pages.map(({ doc, docIndex, page, n, book }) => {
    const blocks = pageBlocks(page);
    const role = page.role ?? (page.blankForParity || page.blankForForce ? 'blank' : 'body');
    const columns = (page.columns ?? []).filter((c) => c.kind !== 'side');
    const colArea = columns.reduce((sum, c) => sum + c.bbox.width * c.bbox.height, 0);
    const area = (b) => (b?.bbox ? Math.max(0, b.bbox.width) * Math.max(0, b.bbox.height) : 0);
    const inColumns = columns.flatMap((c) => c.blocks ?? []).filter((b) => !(b.containerId !== undefined && !b.callout));
    const covered = inColumns.reduce((sum, b) => sum + area(b), 0) + (page.floats ?? []).reduce((s, b) => s + area(b), 0);
    // A page added by a composed page's continuation (#915) is named after
    // the page fence it continues, not after a heading in the middle of
    // the box that goes on there.
    const from = page.composed?.continuationOf;
    const fencePage = from !== undefined ? (doc.pages ?? []).find((p) => p.index === from) : undefined;
    const heading = pageHeading(fencePage ?? page, fencePage ? pageBlocks(fencePage) : blocks);
    const captions = blocks.filter((b) => b.resourceBlock?.captionLines?.length)
      .map((b) => b.resourceBlock.captionLines.map((l) => l.text).join(' ').trim());
    const entry = {
      n, book, docIndex, index: page.index, label: page.pageLabel ?? String(book), role,
      w: round(page.width, 0.1), h: round(page.height, 0.1), trimOffset: doc.trimOffset ?? 0,
      blank: role === 'blank' || !!page.blankForParity || !!page.blankForForce,
      blocks: blocks.length + (page.openerBand?.blocks?.length ?? 0),
      coverage: colArea ? Math.min(1, covered / colArea) : 1,
      h1: blocks.some((b) => b.type === 'heading' && b.headingLevel === 1),
      heading, captions,
      ...(fencePage ? { continued: true } : {}),
    };
    if (heroSet.has(n)) entry.legibility = legibility(page, doc, blocks, resolved);
    return entry;
  });

  // Specimen facts.
  const first = docs[0].pages[0];
  const trim = docs[0].trimOffset ?? 0;
  const mm = (px) => round((px / dpi) * 25.4, 0.1);
  const bodyPt = dimPt(bt.fontSize, dpi, 0);
  out.specimen = {
    trimMm: first ? [mm(first.width - 2 * trim), mm(first.height - 2 * trim)] : [0, 0],
    dpi, layoutType: resolved.layout.layoutType,
    // A grid of three or more columns names its count (absent otherwise, so older captures match).
    ...(resolved.layout.layoutType === 'multiple'
      ? { columnCount: Math.max(3, Math.min(8, Math.round(Number(resolved.layout.columnCount) || 3))) } : {}),
    gutterMm: resolved.layout.layoutType === 'single' ? undefined : round((dimPt(resolved.layout.gutterWidth, dpi, bodyPt) / 72) * 25.4, 0.1),
    mirror: !!resolved.page.margins?.mirror,
    body: { family: bt.fontFamily, sizePt: round(bodyPt, 0.1), leadingPt: round(dimPt(bt.lineHeight, dpi, bodyPt), 0.1) },
    families: [...new Set(out.faces.used.map((f) => f.family))].sort(),
    pages: pages.length,
  };

  // Level signals (spec §2.3).
  const rbs = all.map(({ block }) => block.resourceBlock).filter(Boolean);
  out.signals = {
    splitTables: rbs.some((rb) => !!rb.slice),
    rotated: rbs.some((rb) => !!rb.rotation) || source.resources.some((r) => !!r.placement?.rotate),
    sideFloats: resolved.layout.layoutType === 'oneAndHalf' && resolved.layout.sideColumnRole === 'floats',
    partPalette,
    placements: source.resources.some((r) => !!r.placement),
    chapters: Math.max(docs.length, all.filter(({ block }) => block.type === 'heading' && block.headingLevel === 1).length, 1),
  };

  out.vdt = vdtText(docs);
  return out;
}

// The `.postext` bundle for the Sandbox, written by the pen's own engine.
import { keptPosition, bundleGroup, configKeyOf, imageFile, bytesOfBase64, headingTitle, ZIP_EPOCH, base64Of } from './bundle.js';
import { plain } from './fonts.js';
import { warningsOf } from './hashes.js';
import { startOf, bundleLocale, bundleLanguage, startLossNotes, readBundleBack } from './readBack.js';
import { record, pick, engineOf, sourceOf } from './record.js';

/**
 * The document `select` picks, as a `.postext` file for the Sandbox,
 * written by the pen's own engine (`createBundle`): its markdown (or its
 * chapters, for a buildBundle book), its configuration as JSON, its
 * resources and every file they name, plus `thumbnail` (base64 WebP, the
 * card). The build's continuation travels as the bundle's `start` (#695);
 * a pen on an engine that writes none gets its page numbering in
 * `page.pageNumbering` and the rest reported in `notes`, as before. The
 * bundle's locale is the one that gives the pen's resource type names
 * ({@link bundleLocale}), and its configuration names the language the
 * pen's document was set in ({@link bundleLanguage}). Of several
 * builds the bundle holds the ones that share the configuration of the
 * build `keep` names (`capture.sandbox`; the first by default), a chapter
 * each when they are chained with `continuation` (see {@link bundleGroup});
 * the builds left out are named in `warns` when the recipe did not choose.
 * Returns the bundle as base64 with `readBack`, the same bytes opened and
 * laid out again against the pen's documents ({@link readBundleBack}), or
 * `error` when a resource's file cannot be found.
 */
export async function sandboxBundle({ select = 'last', keep = null, id, name, description, locale, thumbnail = null, folio = null, committed = null } = {}) {
  const cb = record();
  const whole = pick(select);
  if (!whole) return { error: 'no recorded build' };
  // Several builds: the ones of the kept configuration (#690).
  let group = null;
  if (whole.picked) {
    const at = keptPosition(select, keep, whole.picked);
    if (at < 0) return { error: `capture.sandbox ${JSON.stringify(keep)} names no build of capture.doc` };
    group = bundleGroup(whole.picked, name, { keep: at, explicit: keep !== null && keep !== undefined, keyOf: (b) => configKeyOf(b?.config, engineOf(b)) });
  } else if (keep !== null && keep !== undefined) {
    return { error: 'capture.sandbox chooses among the builds of a capture.doc list, and capture.doc names one build' };
  }
  const held = group ? group.builds.map((i) => whole.picked[i]) : [whole.picked?.[0] ?? whole];
  const build = held[0];
  const engine = engineOf(build);
  if (typeof engine?.createBundle !== 'function' || typeof engine?.zipBundle !== 'function') {
    return { error: 'the engine has no createBundle / zipBundle' };
  }
  const source = sourceOf(build);
  if (!source.known) return { error: `a ${build.kind} build records no source` };
  // Several builds chained with `continuation`: a book, one chapter each.
  const chain = group?.chain ?? null;
  const notes = [...(group?.notes ?? [])];
  const warns = [...(group?.warns ?? [])];
  const content = build.content ?? {};
  const config = plain(source.config ?? {}) ?? {};
  // recipe.json `folio`: how the Sandbox's Folio view shows the publication.
  if (folio) {
    const own = config.folio ?? {};
    config.folio = { ...own };
    for (const [key, value] of Object.entries(folio)) {
      config.folio[key] = value && typeof value === 'object' ? { ...own[key], ...value } : value;
    }
  }

  // Where the document starts: the continuation its build was laid out
  // with (a book the pen builds with buildBundle carries its own `start`),
  // which a bundle records as `start` (#695) so the Sandbox opens on the
  // same page side, folio and chapter number.
  const cont = build.kind === 'bundle' ? content.start : content.continuation;
  const start = startOf(cont);

  const resources = (chain?.resources ?? source.resources).map((r) => plain(r));
  // `styleId: null` means the house style; postext 1.5 reads only a missing one so.
  for (const r of resources) if (r.table && r.table.styleId === null) delete r.table.styleId;
  const owns = chain ? chain.files : content.files instanceof Map ? [content.files] : [];
  const files = new Map();
  const missing = [];
  const find = async (fileId, format) => {
    for (const own of owns) if (own.has(fileId)) return own.get(fileId);
    if (cb.bundleFiles?.has(fileId)) return cb.bundleFiles.get(fileId);
    if (cb.imageSources?.has(fileId)) return imageFile(cb.imageSources.get(fileId), format);
    return null;
  };
  for (const r of resources) {
    const wanted = [
      [r.svg?.fileId, 'svg'], [r.svg?.pdfFileId, 'pdf'], [r.bitmap?.fileId, r.bitmap?.format],
      // A video: its poster, and its own file when the pen has its bytes.
      [r.video?.poster?.fileId, r.video?.poster?.format], [r.video?.fileId, 'video'],
    ];
    for (const [fileId, format] of wanted) {
      if (!fileId || files.has(fileId)) continue;
      const data = await find(fileId, format);
      if (data != null) files.set(fileId, data);
      else if (format === 'pdf') {
        // A print master the pen hands renderToPdf only: the SVG stays.
        delete r.svg.pdfFileId;
        notes.push(`${r.id}: print master ${fileId} left out (the SVG stays)`);
      } else if (format === 'video') {
        // The Sandbox plays it from its production address (video.url).
        delete r.video.fileId;
        notes.push(`${r.id}: video file ${fileId} left out (it plays from video.url)`);
      } else missing.push(`${r.id}: ${fileId}`);
    }
  }
  // Fonts built from bytes: the recipe's own files, matched by face.
  const weightOf = (w) => String(parseInt(String(w), 10) || 400);
  for (const family of config.customFonts ?? []) {
    if (family.redistributable === false) continue; // createBundle leaves its files out
    for (const v of family.variants ?? []) {
      if (!v.fileId || files.has(v.fileId)) continue;
      let data = await find(v.fileId, v.format);
      if (data == null) {
        data = (cb.faces ?? []).find((f) => f.family === family.name && weightOf(f.weight) === weightOf(v.weight)
          && (f.style === 'italic') === (v.style === 'italic'))?.bytes ?? null;
      }
      if (data == null) missing.push(`font ${family.name} ${v.weight} ${v.style}: ${v.fileId}`);
      else files.set(v.fileId, data);
    }
  }
  if (missing.length) return { error: `no file for ${missing.join(', ')}`, notes, warns };

  // The bundle's locale names the built-in resource types its reader
  // gives it ("Figure", "شكل"): the one that gives the pen's.
  const named = bundleLocale(engine, config, resources, locale);
  if (named.resourceTypes) config.resourceTypes = named.resourceTypes;
  if (named.note) notes.push(named.note);
  // The document's language, when the configuration would store none (#660).
  const language = bundleLanguage(engine, config, build.docs?.[0]);
  if (language.locale) config.locale = language.locale;
  if (language.note) notes.push(language.note);
  const input = {
    id,
    name,
    ...(description ? { description } : {}),
    locale: named.locale,
    config,
    resources,
    files,
    ...(start ? { start } : {}),
    ...(thumbnail ? { thumbnail: { data: bytesOfBase64(thumbnail), mime: 'image/webp' } } : {}),
  };
  if (build.kind === 'bundle') {
    input.chapters = (content.chapters ?? []).map((c) => ({
      ...(typeof c?.title === 'string' && c.title ? { title: c.title } : {}),
      markdown: String(c?.markdown ?? ''),
    }));
    input.canvasScope = 'book';
  } else if (chain) {
    input.chapters = chain.chapters;
    input.canvasScope = 'book';
  } else {
    // One chapter named after its first heading: the pinned engine keeps a
    // `\\` line break of the heading in the name it derives itself.
    const markdown = source.markdowns[0] ?? '';
    input.chapters = [{ title: headingTitle(markdown) || name, markdown }];
  }
  try {
    let created = await engine.createBundle(input);
    if (start && !created.manifest?.start) {
      // An engine from before #695 writes no `start`: the page numbering
      // goes into the configuration, as it did, and the rest is lost.
      const rest = { ...input };
      delete rest.start;
      if (start.pageNumbering) {
        rest.config = { ...config, page: { ...config.page, pageNumbering: { ...config.page?.pageNumbering, ...start.pageNumbering } } };
      }
      notes.push(...startLossNotes(start));
      created = await engine.createBundle(rest);
    } else if (start) {
      notes.push(`continuation carried as the bundle's start: ${Object.keys(start).join(', ')}`);
    }
    // Zip again with a fixed date: createBundle before 1.5 stamps the time
    // of the call, and fflate reads it from Date.now().
    const now = Date.now;
    let bytes;
    try {
      Date.now = () => ZIP_EPOCH.getTime();
      bytes = engine.zipBundle(created.files, { mtime: ZIP_EPOCH });
    } finally {
      Date.now = now;
    }
    // The documents the bundle stands for, one per chapter, and the pages
    // of every build the capture publishes.
    const penDocs = held.flatMap((b) => b.docs ?? []);
    const base64 = base64Of(bytes);
    return {
      base64, warnings: created.warnings ?? [], notes, warns, files: Object.keys(created.files).sort(),
      // The committed bundle, when its bytes are others (an earlier
      // engine wrote it): read back by this engine against the pen's
      // documents, the C33 comparison on the committed bytes (#734).
      ...(committed && committed !== base64 ? { committedReadBack: await readBundleBack(engine, bytesOfBase64(committed), penDocs, held) } : {}),
      builds: group ? group.builds.map((i) => i + 1) : null,
      // The warnings of the builds the bundle holds, as C33 keys them: what
      // the Sandbox may raise on this bundle without it being news (#736).
      penWarnings: penDocs.flatMap((doc) => (doc ? warningsOf(doc) : [])),
      pages: penDocs.reduce((sum, doc) => sum + (doc?.pages?.length ?? 0), 0),
      allPages: (whole.docs ?? []).reduce((sum, doc) => sum + (doc?.pages?.length ?? 0), 0),
      readBack: await readBundleBack(engine, bytes, penDocs, held),
    };
  } catch (error) {
    return { error: `createBundle: ${error?.message ?? error}`, notes, warns };
  }
}

// The bundle read back by the pen's engine, against the pen's documents (C33).
import { stableJson } from './bundle.js';
import { plain } from './fonts.js';
import { shortHash, linesHash, firstDifference, extraWarnings, warningsOf } from './hashes.js';
import { vdtText } from './render.js';

/**
 * Why a chapter of the bundle is not the pen's document, found by laying
 * the chapter out again with what the bundle did not take from the pen's
 * build: `{ continuation: [keys] }` when the build's own continuation
 * (a page offset, heading counters) gives the pen's pages back, since a
 * bundle carries none; `{ configuration: [keys] }` when the configuration
 * as the pen wrote it does, with the top-level keys that each do so alone
 * or, when none does, the fewest that do so `together`: a key of the pen's
 * that the bundle stores otherwise (a value `stripConfigDefaults` drops and
 * that is not a default there), or one the pen leaves out and the bundle
 * sets (`resourceTypes` in the bundle's language). Null when neither
 * explains it, or for a build with no source.
 */
function causeOf(engine, opened, index, held, penText) {
  const same = (doc) => !!doc && vdtText([doc], { own: true }) === penText;
  // The bundle's configuration with some keys as the pen has them.
  const keysThat = (own, lays) => {
    const keys = [...new Set([...Object.keys(own), ...Object.keys(opened.config)])];
    const withPen = (set) => {
      const config = { ...opened.config };
      for (const key of set) {
        if (key in own) config[key] = own[key];
        else delete config[key];
      }
      return config;
    };
    const alone = keys.filter((key) => lays(withPen([key])));
    return alone.length ? { configuration: alone } : { configuration: needed(keys, (set) => lays(withPen(set))), together: true };
  };
  // Of `keys`, the ones the pen's pages do not come back without: each key
  // they still come back without is dropped in turn.
  const needed = (keys, lays) => {
    let set = keys;
    for (const key of keys) {
      const rest = set.filter((k) => k !== key);
      if (lays(rest)) set = rest;
    }
    return set;
  };
  try {
    if (held.length === 1 && held[0]?.kind === 'bundle') {
      const own = held[0].config;
      const book = (config) => same(engine.buildBundle(opened, { config })[index]);
      return own && book(own) ? keysThat(own, book) : null;
    }
    const build = held[index];
    if ((build?.kind !== 'document' && build?.kind !== 'worker') || typeof engine.buildDocument !== 'function') return null;
    const continuation = build.content?.continuation && typeof build.content.continuation === 'object' ? build.content.continuation : null;
    const chapter = (config, cont) => same(engine.buildDocument(
      { markdown: opened.chapters[index].markdown, resources: opened.resources, ...(cont ? { continuation: cont } : {}) }, config,
    ));
    // The keys of the continuation the pages need (its page numbering is in
    // the bundle's configuration already).
    const carried = (config) => needed(Object.keys(continuation), (set) => chapter(config, Object.fromEntries(set.map((key) => [key, continuation[key]]))));
    if (continuation && chapter(opened.config, continuation)) return { continuation: carried(opened.config) };
    const own = build.config;
    if (!own || !chapter(own, continuation)) return null;
    return {
      ...keysThat(own, (config) => chapter(config, continuation)),
      ...(continuation && !chapter(own, null) ? { continuation: carried(own).filter((key) => key !== 'pageNumbering') } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * The bundle just written, opened again by the pen's engine (`openBundle`)
 * and laid out as the Sandbox lays a book out (`buildBundle`: the bundle's
 * own configuration, each chapter continuing the one before it), against
 * the documents the pen built from the same source (#690, check 1 of
 * #660). One entry per chapter: its pages and layout hash on both sides
 * (a document's pages counted from its own first, so a chapter that opens
 * elsewhere in the book compares by what its pages hold), where the two
 * part and why ({@link causeOf}; `held` are the builds the bundle holds);
 * plus the warnings the bundle raises and the pen's builds did not, and
 * the language each side divides its words in with the one the bundle's
 * configuration names ({@link languageBack}). The
 * faces are the ones the pen loaded. `skipped` when the engine cannot read
 * a bundle back, `error` when the bundle does not open or lay out.
 */
export async function readBundleBack(engine, bytes, penDocs, held = []) {
  if (typeof engine?.openBundle !== 'function' || typeof engine?.buildBundle !== 'function') {
    return { skipped: 'the engine has no openBundle / buildBundle', chapters: [], extraWarnings: [] };
  }
  let opened;
  let docs;
  try {
    opened = await engine.openBundle(bytes);
    docs = await engine.buildBundle(opened);
  } catch (error) {
    return { error: `${error?.message ?? error}`, chapters: [], extraWarnings: [] };
  }
  const chapters = [];
  const extra = [];
  for (let i = 0; i < Math.max(docs.length, penDocs.length); i++) {
    const side = (doc) => {
      if (!doc) return null;
      const text = vdtText([doc], { own: true });
      return { pages: doc.pages?.length ?? 0, hash: shortHash(text), lines: linesHash(doc), text };
    };
    const pen = side(penDocs[i]);
    const bundle = side(docs[i]);
    const strip = (s) => (s ? { pages: s.pages, hash: s.hash, lines: s.lines } : null);
    const differs = !!pen && !!bundle && pen.text !== bundle.text;
    chapters.push({
      chapter: i + 1, pen: strip(pen), bundle: strip(bundle),
      difference: differs ? firstDifference(pen.text, bundle.text) : null,
      cause: differs ? causeOf(engine, opened, i, held, pen.text) : null,
    });
    if (penDocs[i] && docs[i]) extra.push(...extraWarnings(warningsOf(penDocs[i]), warningsOf(docs[i])));
  }
  return { chapters, extraWarnings: extra, language: languageBack(penDocs[0], docs[0], opened?.config) };
}

/** A language tag that says something: a blank or missing one is none. */
const tagOf = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** The language a configuration names for its document: `locale`, else the
 *  hyphenation locale as written (the engine reads them in that order);
 *  null when it names neither. */
export function namedLanguage(config) {
  return tagOf(config?.locale) ?? tagOf(config?.bodyText?.hyphenation?.locale);
}

/** How a built document divides its words: the patterns of its resolved
 *  configuration and whether they run. Null for a document without one. */
function hyphenationOf(doc) {
  const h = doc?.config?.bodyText?.hyphenation;
  return tagOf(h?.locale) ? { locale: h.locale, enabled: h.enabled !== false } : null;
}

/**
 * The language of the bundle beside the pen's (#660): how each side's
 * document divides its words (`pen`, `bundle`: the patterns and whether
 * they run), and the language the bundle's configuration names (`named`,
 * null when it names none). A bundle that names none lays out the same on
 * the pen's engine, where a document without a language is English, and
 * otherwise in a reader that fills in its own: the Sandbox reads such a
 * document in the interface language (`withHyphenationLocale`), so its
 * lines break with other patterns than the published pages'. Null when a
 * side has no resolved configuration to read.
 * @param {any} penDoc the pen's first document
 * @param {any} bundleDoc the bundle's first chapter, laid out
 * @param {any} stored the configuration the bundle opened with
 */
export function languageBack(penDoc, bundleDoc, stored) {
  const pen = hyphenationOf(penDoc);
  const bundle = hyphenationOf(bundleDoc);
  return pen && bundle ? { pen, bundle, named: namedLanguage(stored) } : null;
}

/**
 * A build's continuation as a bundle's `start` (#695): plain JSON, without
 * `bookPageCount`, which a reader counts. Null when it says nothing.
 * @param {unknown} continuation
 */
export function startOf(continuation) {
  if (!continuation || typeof continuation !== 'object') return null;
  const start = plain(continuation) ?? {};
  delete start.bookPageCount;
  return Object.keys(start).length ? start : null;
}

/** What a bundle written by an engine without `start` loses of `start`. */
export function startLossNotes(start) {
  const notes = [];
  if (start.pageIndexOffset) {
    notes.push(start.pageIndexOffset % 2
      ? `continuation.pageIndexOffset ${start.pageIndexOffset}: page 1 is a verso in the recipe, a recto in the Sandbox`
      : `continuation.pageIndexOffset ${start.pageIndexOffset} dropped (even: same page sides)`);
  }
  if (start.headings) notes.push(`continuation.headings ${JSON.stringify(start.headings)} dropped (chapter numbers restart)`);
  for (const key of Object.keys(start)) {
    if (!['pageNumbering', 'pageIndexOffset', 'headings'].includes(key)) notes.push(`continuation.${key} dropped`);
  }
  return notes;
}

/**
 * The locale a bundle is written with. A reader lays a bundle's
 * configuration over the built-in resource types of the bundle's locale
 * ("Figure 3.1", "Figura 3.1"), while the pen's document takes them from
 * its own language (`config.locale`, else the hyphenation locale). The
 * edition's language is the bundle's locale when it gives the pen's types,
 * when no type name can print (no resources, or the configuration lists
 * its own types) and when the document names no language (the read-back
 * then tells whether a name prints otherwise); else the document's
 * language, when that gives them. When neither does, the pen's types are
 * written into the configuration (`resourceTypes`).
 * @param {any} engine
 * @param {any} config the bundle's configuration, plain
 * @param {any[]} resources
 * @param {string} edition
 * @returns {{ locale: string, resourceTypes?: any[], note?: string }}
 */
export function bundleLocale(engine, config, resources, edition) {
  const keep = { locale: edition };
  if (!resources?.length || config?.resourceTypes?.length) return keep;
  if (typeof engine?.effectiveResourceTypes !== 'function' || typeof engine?.defaultResourceTypes !== 'function') return keep;
  let pen;
  try {
    pen = plain(engine.effectiveResourceTypes(config, resources)) ?? [];
  } catch {
    return keep;
  }
  // Every type the pen names, as the candidate locale names it.
  const gives = (candidate) => {
    let types;
    try {
      types = plain(engine.defaultResourceTypes(candidate)) ?? [];
    } catch {
      return false;
    }
    const byId = new Map(types.map((t) => [t.id, t]));
    return pen.every((t) => byId.has(t.id) && stableJson(byId.get(t.id)) === stableJson(t));
  };
  if (gives(edition)) return keep;
  const document = [config?.locale, config?.bodyText?.hyphenation?.locale].find((l) => typeof l === 'string' && l.trim());
  if (!document) return keep;
  if (gives(document)) return { locale: document, note: `bundle locale ${document}, the document's language: ${edition} names its resource types otherwise` };
  return { locale: edition, resourceTypes: pen, note: `resourceTypes written into the configuration: neither ${edition} nor ${document} gives the pen's` };
}

/**
 * The language to write into a bundle's configuration (#660), when the one
 * it would store names none. The engine sets a document that names no
 * language in English, and `createBundle` drops a hyphenation locale that
 * restates that default (`stripConfigDefaults`), so the bundle of such a
 * pen says nothing: the Sandbox then reads it in the interface language
 * and hyphenates an English text with Spanish or Catalan patterns, or sets
 * it as Chinese. The language is the one the pen's document was laid out
 * in (its resolved `locale`, else its hyphenation tag or patterns), and it
 * is written as `locale`, the one key every reader takes first and no
 * strip drops. Nothing for a configuration that names its language as
 * stored, or for a document with no resolved configuration.
 * @param {any} engine
 * @param {any} config the bundle's configuration, plain
 * @param {any} doc the pen's first document
 * @returns {{ locale?: string, note?: string }}
 */
export function bundleLanguage(engine, config, doc) {
  let stored = config;
  if (typeof engine?.stripConfigDefaults === 'function') {
    try {
      stored = plain(engine.stripConfigDefaults(config ?? {})) ?? config;
    } catch { /* read as written */ }
  }
  if (namedLanguage(stored)) return {};
  const h = doc?.config?.bodyText?.hyphenation;
  const language = tagOf(doc?.config?.locale) ?? tagOf(h?.tag) ?? tagOf(h?.locale);
  if (!language) return {};
  const said = namedLanguage(config) ? 'createBundle drops the hyphenation locale, which restates the default' : 'the pen names no language';
  return { locale: language, note: `locale ${language} written into the bundle's configuration: ${said}, and the Sandbox would read the document in the interface language` };
}

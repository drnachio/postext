import { resolveBodyTextConfig, shapingLanguageOf } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { withHyphenationLocale } from './hyphenation.js';

/**
 * The language the Sandbox measures a document's text in (#770).
 *
 * The layout measures every text in one language and the canvas paints in
 * it: the document's own (`bodyText.shapingLanguage: 'document'`, the
 * default since postext 1.30), the host's under `'host'`, which a book
 * stored before keeps. A face answers with other glyphs under a language
 * (Noto Serif SC sets `1` 0.471 em wide in Chinese and 0.55 em in a
 * language it has no forms for; Crimson Pro sets the Catalan dot of `l·l`
 * only in Catalan), so whatever the Sandbox measures to place a mark of
 * its own against the painted page (the caret and the selection of a band
 * title, the character of a balloon under the pointer) is measured in that
 * language too. Measured on Chrome 154, on a page in English: the caret
 * after the `1111` that opens the title of a Chinese book, set in Noto
 * Serif SC at 50 px, stood 11 px past the number, on a context left in the
 * host's language.
 *
 * Most of the Sandbox's geometry needs none of this: the caret, the
 * selection and the hit test of the body text, the captions and the table
 * cells read the places and the widths of the segments the layout
 * measured, and share a segment's width over its characters.
 */

/** {@link shapingLanguageOf} of each resolved config: asked on every
 *  pointer move and every overlay drawn. */
const byConfig = new WeakMap<object, string | undefined>();

/**
 * The language the text of `doc` was measured in and is painted in:
 * undefined for the host's (a document that asks for it), else the
 * document's tag, or the empty string when its locale is no tag.
 */
export function documentShapingLanguage(doc: Pick<VDTDocument, 'config'>): string | undefined {
  const config = doc.config;
  if (!config) return undefined;
  if (byConfig.has(config)) return byConfig.get(config);
  const lang = shapingLanguageOf(config);
  byConfig.set(config, lang);
  return lang;
}

/**
 * The same for a configuration as written, before any layout: the
 * language the layout of `config` will measure its text in, in a Sandbox
 * whose interface language is `appLocale` (a document that names no
 * language is read in the interface's, `withHyphenationLocale`).
 * Undefined for the host's.
 */
export function configShapingLanguage(config: PostextConfig, appLocale: string): string | undefined {
  let byLocale = byWrittenConfig.get(config);
  if (!byLocale) {
    byLocale = new Map();
    byWrittenConfig.set(config, byLocale);
  }
  if (byLocale.has(appLocale)) return byLocale.get(appLocale);
  let lang: string | undefined;
  // Resolved first: the default of `shapingLanguage` is the engine's to
  // decide, not read off the key here.
  const shaped = resolveBodyTextConfig(config.bodyText, config.locale).shapingLanguage;
  if (shaped !== 'host') {
    const effective = withHyphenationLocale(config, appLocale);
    lang = shapingLanguageOf({ locale: effective.locale, bodyText: { hyphenation: effective.bodyText?.hyphenation } });
  }
  byLocale.set(appLocale, lang);
  return lang;
}

/** {@link configShapingLanguage} of each written config and interface
 *  language: a settings card asks at every change of the store. */
const byWrittenConfig = new WeakMap<PostextConfig, Map<string, string | undefined>>();

/** What this module asks of a 2D context. */
interface MeasuringContext {
  font: string;
  measureText(text: string): { width: number };
}

/** A context of the Sandbox's own, on a canvas never put in the page; null
 *  where there is no canvas (node, the tests of other modules). */
function makeContext(): MeasuringContext | null {
  try {
    if (typeof document !== 'undefined') return document.createElement('canvas').getContext('2d');
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1).getContext('2d');
  } catch {
    // No canvas here.
  }
  return null;
}

/** The context of the host's language: left as it comes. */
let hostContext: MeasuringContext | null | undefined;
/** The context of each language measured in. */
const contexts = new Map<string, MeasuringContext | null>();

/**
 * The context that measures in `lang`: one per language, given its
 * language when it is made and never another.
 *
 * Measured on Chrome 154: a context that measured a text of several words
 * in one language (`2026年的故` in `zh-Hans`) and is then set back to
 * `inherit` answers with the widths of the first language, for that text
 * and for its words (`2026`: 89.24 px at 40 px in Noto Serif SC, where
 * another context left at `inherit` gives 88 px). A context that keeps its
 * language has no such memory, and the engine's own measuring context,
 * which the layout switches from one language to another, is left out of
 * it.
 *
 * The host's context is the one the Sandbox always measured with, its
 * language left alone: a canvas never put in the page has none (on a
 * Chinese page it sets the digits as on an English one), as the layout
 * worker has none. No state is saved on these contexts.
 */
function contextIn(lang: string | undefined): MeasuringContext | null {
  if (lang === undefined) {
    if (hostContext === undefined) hostContext = makeContext();
    return hostContext;
  }
  let ctx = contexts.get(lang);
  if (ctx === undefined) {
    ctx = makeContext();
    // A browser whose contexts have no language measures as it did.
    if (ctx && 'lang' in ctx) (ctx as MeasuringContext & { lang: string }).lang = lang;
    contexts.set(lang, ctx);
  }
  return ctx;
}

/**
 * The advance of `text` in `font` (a CSS font shorthand), px, measured in
 * `lang`: the language the layout measured the text in and the page
 * paints it in ({@link documentShapingLanguage}). `lang` undefined
 * measures in the host's language, as the Sandbox did before a document
 * could have its own. Null where nothing can measure (no canvas: node,
 * the tests), or when the measure fails.
 */
export function measureInLanguage(lang: string | undefined, text: string, font: string): number | null {
  const ctx = contextIn(lang);
  if (!ctx) return null;
  try {
    ctx.font = font;
    const width = ctx.measureText(text).width;
    return Number.isFinite(width) ? width : null;
  } catch {
    return null;
  }
}

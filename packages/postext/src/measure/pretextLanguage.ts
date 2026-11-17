// The language of the text library's own measuring context (#764).
//
// A paragraph with no formatting is broken by `@chenglou/pretext`, which
// measures on a context of its own: made on first use, kept for good, and
// handed to nobody (0.0.9 exports no way to give it a context or a measure
// function). Left alone that context has the language of the host page, or
// none in a worker, while the engine's own measures in the document's
// (`measure/canvas.ts`), so the plain paragraphs of a document would break
// their lines by another language than its headings and its formatted ones.
//
// Two things are done about it, neither of which changes the library:
//
// - The context is found the first time a language is asked for. The
//   library sets `font` on its context at the start of every `prepare`,
//   before it measures anything, and the whole of a `prepare` is
//   synchronous: for the length of that one call the `font` setter of the
//   2D context classes is wrapped, the context that sets a font inside it
//   is the library's, and the setter is put back as it was found (a layout
//   worker's own wrapper of it included, `worker/fontGenerations.ts`).
//   From then on its `lang` is set like the engine's own.
// - The library keeps the widths it measured by font string. A language
//   other than the host's hands it the same font written with spaces
//   after it, one more per language met: the same font to the canvas,
//   another key to the library, so two languages never share a width and
//   going from one to the other drops nothing.
//
// - The context found, its `measureText` is answered by the engine's own
//   measurer while a text is prepared in a language (#770). Chrome keeps
//   the words a context shaped under their text alone, and a word with no
//   letter has two shapes, by the kind of string it came in
//   (`measure/canvas.ts`): on one context a segment's width depended on
//   the segments measured before it, in this paragraph or in any other.
//   The engine's measurer keeps the two kinds of string on two contexts,
//   and the library's segments go through it. The library sets its font
//   and measures inside `prepare` only, so the font of the call under way
//   is the one to measure in.
//
// Where the classes cannot be reached (no canvas classes: a measurer stub,
// a platform whose contexts have no `lang`) the library measures as it
// always did.

import { prepareWithSegments, type PrepareOptions, type PreparedTextWithSegments } from '@chenglou/pretext';
import { getMeasureLanguage, measureUncachedWidth } from './canvas.js';

const HOST_LANGUAGE = 'inherit';

/** The library's context, once found; null when it could not be. */
let context: { lang: string } | null | undefined;
/** What its `lang` was last set to. */
let contextLanguage = HOST_LANGUAGE;
/** How many spaces follow the font of each language met. */
const variants = new Map<string, number>();
/** The font of the text being prepared in a language, as the engine
 *  writes it; undefined outside such a call. */
let preparing: string | undefined;

/** Have the engine's measurer answer the library's context while a text
 *  is prepared in a language; at any other time the context measures as
 *  it was made to. */
function measureThroughEngine(ctx: object): void {
  type Measures = { measureText?: (this: object, text: string) => unknown };
  if (typeof (Object.getPrototypeOf(ctx) as Measures | null)?.measureText !== 'function') return;
  try {
    Object.defineProperty(ctx, 'measureText', {
      configurable: true,
      writable: true,
      value(this: object, text: string): unknown {
        if (preparing !== undefined) return { width: measureUncachedWidth(text, preparing) };
        // The class's own method, as it stands now.
        return (Object.getPrototypeOf(this) as Required<Measures>).measureText.call(this, text);
      },
    });
  } catch {
    // A context that takes no property of its own measures as it did.
  }
}

interface ContextClass {
  prototype: object;
}

function contextClasses(): object[] {
  const g = globalThis as { OffscreenCanvasRenderingContext2D?: ContextClass; CanvasRenderingContext2D?: ContextClass };
  return [g.OffscreenCanvasRenderingContext2D?.prototype, g.CanvasRenderingContext2D?.prototype].filter((p): p is object => p !== undefined && p !== null);
}

/** Run `prepare` with the `font` setter of the context classes watched:
 *  the first context to set a font inside it is the library's, and takes
 *  `language` before the font. */
function findContext<T>(language: string, prepare: () => T): T {
  const restore: (() => void)[] = [];
  for (const prototype of contextClasses()) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'font');
    const set = descriptor?.set;
    if (!descriptor || !set || descriptor.configurable === false) continue;
    try {
      Object.defineProperty(prototype, 'font', {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(this: object, value: unknown) {
          if (context === undefined && 'lang' in this) {
            context = this as { lang: string };
            context.lang = language;
            contextLanguage = language;
            measureThroughEngine(this);
          }
          set.call(this, value);
        },
      });
      restore.push(() => Object.defineProperty(prototype, 'font', descriptor));
    } catch {
      // A class that will not be wrapped is left as it is.
    }
  }
  try {
    return prepare();
  } finally {
    for (const undo of restore) undo();
    // Looked for once: a platform with no such context has none later.
    if (context === undefined) context = null;
  }
}

/** What {@link prepareInLanguage} asks of the library for a caller that
 *  breaks the lines itself. */
const SEGMENT_WIDTHS_ONLY = { segmentWidthsOnly: true } as PrepareOptions;

/**
 * `prepareWithSegments(text, font)` measured in the language the engine
 * measures in (`setMeasureLanguage`). With the host's language and a
 * library whose context was never given another, the call is the one it
 * always was.
 *
 * `segmentWidthsOnly`: the caller breaks the lines itself (Knuth–Plass) and
 * reads the segments, their kinds and their widths, nothing else. The
 * library then leaves out what it measures for its own line breaker alone
 * (#1614): where a word may be cut between two letters, and how much
 * narrower the two neighbours of a soft hyphen are set joined, one canvas
 * measure for every soft hyphen the dictionary adds. Over half the widths
 * a first layout of a hyphenated book asked the canvas for were these. The
 * result must not go to the library's `layoutNextLine`: prepare the text
 * again without the option for that. The option is this repository's patch
 * of the library (`patches/`); an unpatched copy ignores it and prepares in
 * full, which gives the same segments and widths.
 */
export function prepareInLanguage(text: string, font: string, segmentWidthsOnly = false): PreparedTextWithSegments {
  const options = segmentWidthsOnly ? SEGMENT_WIDTHS_ONLY : undefined;
  const language = getMeasureLanguage();
  const wanted = language ?? HOST_LANGUAGE;
  let keyed = font;
  if (language !== undefined) {
    let spaces = variants.get(language);
    if (spaces === undefined) {
      spaces = variants.size + 1;
      variants.set(language, spaces);
    }
    keyed = font + ' '.repeat(spaces);
  }
  // Nothing to find while the host's language is all that was asked for.
  if (language === undefined && context === undefined) return prepareWithSegments(text, font, options);
  if (context !== undefined && context !== null && contextLanguage !== wanted) {
    context.lang = wanted;
    contextLanguage = wanted;
  }
  preparing = language === undefined ? undefined : font;
  try {
    return context === undefined ? findContext(wanted, () => prepareWithSegments(text, keyed, options)) : prepareWithSegments(text, keyed, options);
  } finally {
    preparing = undefined;
  }
}

/** Whether the library's context was found and follows the engine's
 *  language (for tests and diagnostics). */
export function pretextLanguageState(): 'unasked' | 'followed' | 'unreachable' {
  return context === undefined ? 'unasked' : context === null ? 'unreachable' : 'followed';
}

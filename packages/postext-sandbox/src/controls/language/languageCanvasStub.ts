// A canvas for the tests of what the Sandbox measures in a language
// (#770): node has none, and the widths that matter here are the ones a
// face changes with the language of the context that measures.

/** Advances, in ems, of a face that draws by language as Noto Serif SC
 *  does: a digit is 0.471 em wide in Chinese and 0.55 em in any other
 *  language (4.71 px and 5.5 px at 10 px), a Han character 1 em, a space
 *  0.25 em and anything else 0.5 em. */
function advance(ch: string, lang: string): number {
  if (ch === ' ') return 0.25;
  if (/[0-9]/.test(ch)) return lang.toLowerCase().split('-')[0] === 'zh' ? 0.471 : 0.55;
  if (/\p{Script=Han}/u.test(ch)) return 1;
  return 0.5;
}

/** A 2D context as a current Chrome makes it: a language of its own,
 *  `inherit` (the host's) until someone sets one. */
export class LanguageContext {
  /** The language of the page that hosts the Sandbox: what `inherit`
   *  measures in. */
  static host = 'en';
  /** Every language a measure was taken in (`host` for `inherit`). */
  static measuredIn: string[] = [];
  /** Every context made. */
  static made: LanguageContext[] = [];

  font = '10px Song';
  /** Every language this context was given, in order. */
  given: string[] = [];
  private language = 'inherit';

  constructor() {
    LanguageContext.made.push(this);
  }

  get lang(): string {
    return this.language;
  }

  set lang(value: string) {
    this.language = value;
    this.given.push(value);
  }

  measureText(text: string): { width: number } {
    LanguageContext.measuredIn.push(this.lang === 'inherit' ? 'host' : this.lang);
    const lang = this.lang === 'inherit' ? LanguageContext.host : this.lang;
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '10');
    let width = 0;
    for (const ch of text) width += advance(ch, lang) * size;
    return { width };
  }
}

/**
 * Give the Sandbox's measuring module and the engine's this canvas (each
 * makes its contexts from `OffscreenCanvas` where there is no page): call
 * it before anything measures. The page is in English until
 * `LanguageContext.host` says otherwise.
 */
export function installLanguageCanvas(): void {
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    getContext(): LanguageContext {
      return new LanguageContext();
    }
  };
}

import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { breaksAfterDash } from '../../measure/breakRules';
import { measureRichBlock } from '../../measure/rich';
import { measureBlock } from '../../measure/plain';
import { migrateConfig, pinLegacyDashBreaks, CONFIG_VERSION } from '../../bundle/configVersion';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../defaults/bodyText';
import type { PostextConfig } from '../../types';
import type { VDTLine } from '../../vdt';

// EF-141: Knuth–Plass had no break after an em or en dash set closed between
// words ("say—that’s"), on either path, so a paragraph full of them was set
// with loose lines; the line-by-line breaker of formatted text broke only
// between two letters ("riddles.—I" never). `bodyText.breakAfterDashes`
// (default true, pinned false for configurations stored before rules 7)
// lets a line end after such a dash.

// Deterministic stub: every character, the space included, is 7 px wide;
// bold 8 px, so a bold word sends the paragraph to the rich breaker.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].length * (/bold|700/.test(this.font) ? 8 : 7) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const FONT = '16px Test';

const ALICE = 'at least—at least I mean what I say—that’s the same thing, you know. Not the same thing a bit!—said the Hatter. You might just as well say that I see what I eat is the same thing as I eat what I see—and so on through the riddles.—I never heard it before.';

function lines(markdown: string, width: number, bodyText: PostextConfig['bodyText'] = {}): VDTLine[] {
  const doc = buildDocument({ markdown }, {
    page: { width: mm(width), height: mm(600), dpi: 96, margins: { top: mm(5), bottom: mm(5), left: mm(5), right: mm(5) } },
    layout: { layoutType: 'single' },
    bodyText: { firstLineIndent: mm(0), hyphenation: { enabled: false }, ...bodyText },
    header: { elements: [] },
    footer: { elements: [] },
  });
  return doc.blocks.flatMap((b) => b.lines);
}

const endsOnDash = (ls: readonly VDTLine[]): string[] => ls.filter((l, i) => i < ls.length - 1 && /[–—]$/.test(l.text)).map((l) => l.text);

describe('breaksAfterDash', () => {
  it('breaks after a dash set closed between words', () => {
    expect(breaksAfterDash('y', '—', 't')).toBe(true); // say—that’s
    expect(breaksAfterDash('.', '—', 'I')).toBe(true); // riddles.—I
    expect(breaksAfterDash('!', '—', 's')).toBe(true); // a bit!—said
    expect(breaksAfterDash('g', '–', 'B')).toBe(true); // Hamburg–Berlin
    expect(breaksAfterDash('4', '—', 't')).toBe(true); // 1914—the
    expect(breaksAfterDash('”', '—', 'a', 'o')).toBe(true); // “no”—and
    expect(breaksAfterDash('.', '—', 'Q')).toBe(true); // Capítulo I.—Que trata
    expect(breaksAfterDash('d', '–', 'B')).toBe(true); // Madrid–Barcelona
  });

  it('never after a dash that opens an aside, before closing punctuation, in a run of dashes or a range of numbers', () => {
    expect(breaksAfterDash(undefined, '—', 'd')).toBe(false); // —dijo
    expect(breaksAfterDash('l', '—', ',')).toBe(false); // él—,
    expect(breaksAfterDash('l', '—', '.')).toBe(false); // él—.
    expect(breaksAfterDash('—', '—', 'a')).toBe(false); // ——a
    expect(breaksAfterDash('a', '—', '—')).toBe(false);
    expect(breaksAfterDash('4', '–', '1')).toBe(false); // 1914–1918
    expect(breaksAfterDash('(', '—', 'a')).toBe(false);
    expect(breaksAfterDash('a', '-', 'b')).toBe(false); // a hard hyphen is not this rule's
  });

  it('never before a quotation mark or a bracket', () => {
    // A straight quote after a dash usually closes the speech the dash broke
    // off (“thinking—" and”), and so do “ and « in German. The line-by-line
    // breaker of plain text never breaks there either, since pretext keeps
    // the dash with the mark that follows it.
    expect(breaksAfterDash('g', '—', '"')).toBe(false); // thinking—" and
    expect(breaksAfterDash('g', '—', "'")).toBe(false);
    expect(breaksAfterDash('s', '—', '“')).toBe(false); // says—“no”
    expect(breaksAfterDash('e', '—', '“')).toBe(false); // „Ich dachte—“ sagte er
    expect(breaksAfterDash('e', '—', '«')).toBe(false); // »Ich dachte—« sagte er
    expect(breaksAfterDash('s', '—', '‘')).toBe(false);
    expect(breaksAfterDash('s', '—', '„')).toBe(false);
    expect(breaksAfterDash('s', '—', '(')).toBe(false); // says—(no)
    expect(breaksAfterDash('o', '—', '¿')).toBe(false); // dijo—¿qué?
  });

  it('after a quote before the dash only when the quote closes a word', () => {
    // A straight quote, », ” or ’ may open a quote as well as close one: a
    // space before it makes it the quote a line of dialogue opens with.
    expect(breaksAfterDash('"', '—', 'a', 'o')).toBe(true); // "no"—and
    expect(breaksAfterDash("'", '—', 'a', 's')).toBe(true); // the boys'—and
    expect(breaksAfterDash('»', '—', 'y', 'o')).toBe(true); // «no»—y
    expect(breaksAfterDash('”', '—', 'a', '.')).toBe(true); // “no.”—and
    expect(breaksAfterDash('’', '—', 'a', '1')).toBe(true); // ’91’—and
    expect(breaksAfterDash('"', '—', 'H')).toBe(false); // dijo "—Hola
    expect(breaksAfterDash('"', '—', 'H', ' ')).toBe(false);
    expect(breaksAfterDash("'", '—', 'a')).toBe(false); // whispered '—and
    expect(breaksAfterDash('»', '—', 'I')).toBe(false); // sagte »—Ich
    expect(breaksAfterDash('”', '—', 'H', '«')).toBe(false);
    expect(breaksAfterDash('"', '—', 'H', '(')).toBe(false); // ("—Hola
    // Letters and closing punctuation need nothing before them.
    expect(breaksAfterDash('.', '—', 'I')).toBe(true);
    expect(breaksAfterDash(')', '—', 't')).toBe(true);
  });

  it('after the “ and « German and Danish close with, and after a French » set off by a no-break space', () => {
    expect(breaksAfterDash('“', '—', 'u', 'n')).toBe(true); // „nein“—und
    expect(breaksAfterDash('“', '—', 'u', '!')).toBe(true); // „Nein!“—und
    expect(breaksAfterDash('«', '—', 'o', 'j')).toBe(true); // »nej«—og
    expect(breaksAfterDash('«', '—', 'u', '9')).toBe(true);
    expect(breaksAfterDash('»', '—', 'e', '\u00A0')).toBe(true); // « non »—et
    expect(breaksAfterDash('»', '—', 'e', '\u202F')).toBe(true);
    // Where they open a quote, as in English and Spanish, no break.
    expect(breaksAfterDash('“', '—', 'H')).toBe(false); // said “—Hello
    expect(breaksAfterDash('“', '—', 'H', ' ')).toBe(false);
    expect(breaksAfterDash('«', '—', 'H', ' ')).toBe(false); // dijo «—Hola
    expect(breaksAfterDash('«', '—', 'H', ':')).toBe(false); // dijo:«—Hola
    expect(breaksAfterDash('“', '—', 'H', ',')).toBe(false);
    expect(breaksAfterDash('«', '—', 'H', '(')).toBe(false);
    // A no-break space before any other quote still opens it.
    expect(breaksAfterDash('"', '—', 'H', '\u00A0')).toBe(false);
    expect(breaksAfterDash('“', '—', 'H', '\u00A0')).toBe(false);
  });
});

describe('a line break after a closed dash (EF-141)', () => {
  for (const [label, text] of [['plain', ALICE], ['formatted', ALICE.replace('Hatter', '**Hatter**')]] as const) {
    it(`Knuth–Plass breaks after one (${label} paragraph)`, () => {
      const found: string[] = [];
      for (let width = 40; width <= 90; width += 2) {
        const now = lines(text, width, { textAlign: 'justify' });
        found.push(...endsOnDash(now));
        // The source range holds what the line prints, the dash included.
        for (const l of now) expect(text.slice(l.sourceStart, l.sourceEnd).replace(/\*\*/g, '')).toBe(l.text.trimEnd());
        // As up to 1.4: no line of the optimal breaker ends on a dash.
        expect(endsOnDash(lines(text, width, { textAlign: 'justify', breakAfterDashes: false }))).toEqual([]);
      }
      expect(found.length).toBeGreaterThan(0);
      expect(found.some((t) => t.endsWith('riddles.—'))).toBe(true);
    });
  }

  it('sets the repro’s paragraph without the loose lines', () => {
    // Unna in 38 mm, no hyphenation: 1.4 set “at least—at least I mean what
    // I” and “say—that’s the same thing, you”, both far past the word
    // spacing limit.
    const md = 'at least—at least I mean what I say—that’s the same thing, you know.';
    const loosest = (ls: readonly VDTLine[]) => Math.max(0, ...ls.map((l) => l.justifiedSpaceRatio ?? 0));
    let better = 0;
    for (let width = 44; width <= 60; width += 1) {
      const before = loosest(lines(md, width, { textAlign: 'justify', breakAfterDashes: false }));
      const after = loosest(lines(md, width, { textAlign: 'justify' }));
      expect(after).toBeLessThanOrEqual(before + 1e-9);
      if (after < before - 0.05) better++;
    }
    expect(better).toBeGreaterThan(0);
  });

  it('breaks after a dash that follows punctuation in formatted ragged text', () => {
    // The line-by-line breaker: 1.4 broke only between two letters.
    const spans = [{ text: 'through the ', bold: false, italic: false }, { text: 'riddles.', bold: true, italic: false }, { text: '—I never heard it', bold: false, italic: false }];
    const at = (breakAfterDashes: boolean) => measureRichBlock(spans, FONT, 'bold 16px Test', FONT, FONT, 160, 20, { textAlign: 'left', breakAfterDashes }).lines.map((l) => l.text);
    expect(at(true)[0]).toBe('through the riddles.—');
    expect(at(false)[0]).toBe('through the');
  });

  it('never breaks after an opening dash, before a comma, or inside a range', () => {
    const md = 'Sancho dijo —como siempre— que el camino de 1914–1918 era largo, y él—, cansado, calló. Sancho dijo —como siempre— que el camino de 1914–1918 era largo.';
    for (let width = 30; width <= 80; width += 1) {
      for (const textAlign of ['justify', 'left'] as const) {
        const ls = lines(md, width, { textAlign });
        for (const [i, l] of ls.entries()) {
          if (i === ls.length - 1) continue;
          expect(l.text, `${width} mm`).not.toMatch(/(?:^|\s)—$/);
          expect(l.text, `${width} mm`).not.toMatch(/1914–$/);
          expect(ls[i + 1]!.text, `${width} mm`).not.toMatch(/^,/);
        }
      }
    }
  });

  it('breaks after a dash that closes a run before a run in another style', () => {
    // “say—*that’s*”: the dash ends one run and the word after it opens the
    // next. The stub sets italics as wide as roman, so the lines must be
    // those of the text with the italics elsewhere.
    const runs = ALICE.replace('say—that’s', 'say—*that’s*').replace('see—and', 'see—*and*').replace('riddles.—I', 'riddles.—*I*');
    const ref = ALICE.replace('Hatter', '*Hatter*');
    const texts = (ls: readonly VDTLine[]) => ls.map((l) => l.text);
    let found = 0;
    for (let width = 40; width <= 90; width += 2) {
      for (const bodyText of [
        { textAlign: 'justify' as const },
        { textAlign: 'left' as const },
        { textAlign: 'justify' as const, optimalLineBreaking: false },
        { textAlign: 'left' as const, optimalRagged: false },
      ]) {
        const now = lines(runs, width, bodyText);
        expect(texts(now), `${width} mm ${JSON.stringify(bodyText)}`).toEqual(texts(lines(ref, width, bodyText)));
        found += endsOnDash(now).length;
        for (const l of now) expect(runs.slice(l.sourceStart, l.sourceEnd).replace(/\*/g, '')).toBe(l.text.trimEnd());
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('never starts a line with the quote or bracket that follows a dash', () => {
    // The review's repro (EF-141): with straight quotes, 1.5's
    // first rule ended lines on “thinking—” and started the next one with a
    // lone closing quote, on both paths.
    const text = 'He looked at me and said "I was only thinking—" and then he stopped, and "we could go—" was all he managed before the door shut. „Ich dachte—“ sagte er, »und dann—« nichts. She says—“no”—and he says—(no) or—‘no’ or—«no» again.';
    const afterDash = (ls: readonly VDTLine[]) => ls.flatMap((l, i) => (i > 0 && /[–—]$/.test(ls[i - 1]!.text.trimEnd()) && /^["'“”‘’«»„(]/.test(l.text) ? [`${ls[i - 1]!.text} | ${l.text}`] : []));
    let dashEnds = 0;
    for (const [label, md] of [['plain', text], ['formatted', text.replace('door', '**door**')]] as const) {
      for (const textAlign of ['justify', 'left'] as const) {
        for (let width = 30; width <= 110; width += 2) {
          const ls = lines(md, width, { textAlign });
          expect(afterDash(ls), `${label} ${textAlign} ${width} mm`).toEqual([]);
          dashEnds += endsOnDash(ls).length;
        }
      }
    }
    // It still breaks after “—and”, the dash between a quote and a word.
    expect(dashEnds).toBeGreaterThan(0);
  });

  it('never ends a line on a space, a quote and the dash that opens a line of dialogue', () => {
    // The review's probe (EF-141): `said "—Hola` and German `sagte »—Ich`
    // open the quote and the dialogue together, but a straight quote and »
    // also close one, so the rule took them for "\"no\"—and" and ended lines
    // on `said "—`, on both paths. It still breaks after a quote that closes
    // a word.
    const texts = [
      'She turned to him and whispered "—and then what happened to the others who stayed?" but he only said "no"—and shook his head, and later "—nothing that I could tell you now" before leaving.',
      'Entonces se volvió hacia la ventana y le dijo en voz baja "—Hola, ¿qué haces aquí tan temprano?" y ella dijo «no»—y no contestó más, y él repitió "—Te he preguntado algo" antes de irse.',
      'Er drehte sich um und sagte leise »—Ich weiß es nicht, wirklich nicht« und dann ging er, und sie rief ihm nach »—Warte doch einen Augenblick« aber er blieb nicht stehen.',
      "She turned to him and whispered '—and then what happened to the others who stayed?' but the boys'—and the girls'—voices said '—nothing that I could tell you now' before leaving.",
    ];
    const opening = (ls: readonly VDTLine[]) => ls.flatMap((l, i) => (i < ls.length - 1 && /(?:^|\s)["'»]—$/.test(l.text.trimEnd()) ? [`${l.text} | ${ls[i + 1]!.text}`] : []));
    const closing: string[] = [];
    for (const text of texts) {
      const variants = [
        ['plain', text],
        ['formatted', text.replace(/ (\p{L}{6,}) /u, ' **$1** ')],
        ['runs', text.replace('"—and', '"—*and*').replace('"—Hola', '"—*Hola*').replace('»—Ich', '»—*Ich*').replace('"no"—and', '*"no"*—and').replace('«no»—y', '*«no»*—y')],
      ] as const;
      for (const [label, md] of variants) {
        for (const textAlign of ['justify', 'left'] as const) {
          for (let width = 34; width <= 110; width += 2) {
            const ls = lines(md, width, { textAlign });
            expect(opening(ls), `${label} ${textAlign} ${width} mm: ${text.slice(0, 20)}`).toEqual([]);
            closing.push(...endsOnDash(ls).filter((t) => /(?:"no"|«no»|boys'|girls')—$/.test(t.trimEnd())));
          }
        }
      }
    }
    expect(closing.length).toBeGreaterThan(0);
  });

  it('breaks after a German, Danish or French closing quote before a dash, plain and formatted alike', () => {
    const texts = [
      'Er fragte sie noch einmal, ob sie mitkommen wolle, aber sie sagte nur „nein“—und ging dann ohne ein weiteres Wort über die Straße nach Hause.',
      'Han spurgte hende igen, om hun ville med, men hun sagde bare »nej«—og gik så hjem over gaden uden at sige et eneste ord mere til nogen.',
      'Il lui demanda encore une fois si elle voulait venir, mais elle répondit seulement «\u00A0non\u00A0»—et rentra chez elle sans dire un mot de plus.',
    ];
    for (const text of texts) {
      const closing = /(?:nein“|nej«|non\u00A0»)—$/;
      let found = 0;
      for (const textAlign of ['justify', 'left'] as const) {
        for (let width = 30; width <= 110; width += 2) {
          const plain = lines(text, width, { textAlign });
          // An italic word measures as roman here: same widths, other path.
          const rich = lines(text.replace(/ (\p{L}{7,}) /u, ' *$1* '), width, { textAlign });
          expect(rich.map((l) => l.text.trimEnd()), `${textAlign} ${width} mm`).toEqual(plain.map((l) => l.text.trimEnd()));
          found += plain.filter((l, i) => i < plain.length - 1 && closing.test(l.text.trimEnd())).length;
          // As up to 1.4: the optimal breaker never ends a line there.
          expect(lines(text, width, { textAlign: 'justify', breakAfterDashes: false }).some((l) => closing.test(l.text.trimEnd()))).toBe(false);
        }
      }
      expect(found, text.slice(0, 30)).toBeGreaterThan(0);
    }
  });

  it('plain and formatted paragraphs break alike at a dash before a quote or bracket', () => {
    // The plain Knuth–Plass path never broke after “says—” before “no”, as
    // pretext keeps the dash with the quote; the rich path did, so bolding
    // an unrelated word moved the break.
    const text = 'She told him that she says—“no” and that he says—(no) while they both say—‘no’ and then say—«no» to every single question they are asked today.';
    const quoteBreaks = (ls: readonly VDTLine[]) => ls.filter((l, i) => i < ls.length - 1 && /says?—$/.test(l.text.trimEnd())).length;
    for (const textAlign of ['justify', 'left'] as const) {
      for (let width = 25; width <= 110; width += 3) {
        const plain = lines(text, width, { textAlign });
        const rich = lines(text.replace('single', '**single**'), width, { textAlign });
        expect(quoteBreaks(plain), `plain ${textAlign} ${width} mm`).toBe(0);
        expect(quoteBreaks(rich), `formatted ${textAlign} ${width} mm`).toBe(0);
      }
    }
  });

  it('plain and rich measurers agree on where they may break', () => {
    // The second text puts a quote before the dash, closing a word or
    // opening a line of dialogue.
    const texts = ['I say—that is all I mean—and nothing more, you know.', 'He said "—and then" and she said "no"—and left, the boys\'—and girls\'—voices, «no»—y nada, sagte »—Ich weiß« and so on.'];
    for (const text of texts) {
      for (let width = 60; width <= 200; width += 7) {
        const opts = { textAlign: 'justify' as const, optimal: true, breakAfterDashes: true };
        const plain = measureBlock(text, FONT, width, 20, opts).lines.map((l) => l.text);
        const rich = measureRichBlock([{ text, bold: false, italic: false }], FONT, FONT, FONT, FONT, width, 20, opts).lines.map((l) => l.text);
        expect(rich, `${width} px`).toEqual(plain);
        for (const l of plain.slice(0, -1)) expect(l).not.toMatch(/\s["'»]—\s*$/);
      }
    }
  });
});

describe('breakAfterDashes in the configuration', () => {
  it('defaults to true and strips as a default', () => {
    expect(resolveBodyTextConfig().breakAfterDashes).toBe(true);
    expect(resolveBodyTextConfig({ breakAfterDashes: false }).breakAfterDashes).toBe(false);
    expect(stripBodyTextDefaults({ breakAfterDashes: true })).toBeUndefined();
    expect(stripBodyTextDefaults({ breakAfterDashes: false })).toEqual({ breakAfterDashes: false });
  });

  it('is pinned off for configurations stored before rules 7 whose text sets a closed dash', () => {
    expect(CONFIG_VERSION).toBe(11);
    const stored: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    for (const version of [undefined, 3, 5, 6]) {
      expect(migrateConfig(stored, version, { content: ALICE }).bodyText?.breakAfterDashes, `${version}`).toBe(false);
    }
    // Unknown content may set one.
    expect(migrateConfig(stored, 6).bodyText?.breakAfterDashes).toBe(false);
    // Text with no closed dash, today's rules, or a named value: as it is.
    expect(migrateConfig(stored, 6, { content: 'Sancho dijo —como siempre— que no, y calló.' })).toBe(stored);
    expect(migrateConfig(stored, 6, { content: ['No dash.', 'From 1914–1918.'] }).bodyText?.breakAfterDashes).toBe(false);
    expect(migrateConfig(stored, CONFIG_VERSION, { content: ALICE })).toBe(stored);
    // A dash touching an inline mark (the Markdown is read raw).
    for (const content of ['through the **riddles.**—I never', 'the *riddles*—and so on', 'say—`that` is all', 'say—*that’s* all', 'see [the note](#n)—and']) {
      expect(migrateConfig(stored, 6, { content }).bodyText?.breakAfterDashes, content).toBe(false);
    }
    const named: PostextConfig = { bodyText: { breakAfterDashes: true } };
    expect(pinLegacyDashBreaks(named)).toBe(named);
    expect(migrateConfig(named, undefined, { content: ALICE })).toBe(named);
  });

  it('is not pinned for a dash after a quote that opens a line of dialogue, where no rule breaks', () => {
    const stored: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    for (const content of ['He said "—and then" and left.', 'Le dijo «—Hola» y se fue.', 'Er sagte »—Ich weiß« und ging.', "She whispered '—and then' twice.", '"—Hola", dijo.', 'Il dit «\u00A0—non\u00A0» et partit.']) {
      expect(migrateConfig(stored, 6, { content }), content).toBe(stored);
    }
    // A closing quote before the dash, in any of its forms, is pinned.
    for (const content of ['she said "no"—and left', 'sie sagte „nein“—und ging', 'hun sagde »nej«—og gik', 'elle dit «\u00A0non\u00A0»—et partit', 'said *no*"—and left', 'sagte **„nein“**—und']) {
      expect(migrateConfig(stored, 6, { content }).bodyText?.breakAfterDashes, content).toBe(false);
    }
  });

  it('pins every dash the rule may break after (the check is a superset of the rule)', () => {
    // Rendered text reads as the Markdown here: no inline marks.
    const stored: PostextConfig = { bodyText: { fontFamily: 'Georgia' } };
    const before = ['a', 'Z', '7', ' ', '.', ',', ';', ':', '!', '?', ')', ']', '}', '…', '(', '«', '“', '"', "'", '\u00A0', '\u202F', '-', '—'];
    const prev = ['a', 'é', '9', '.', ',', ';', ':', '!', '?', ')', ']', '}', '…', '»', '”', '’', '"', "'", '“', '«', '(', '[', '¿', '-', '/'];
    const next = ['a', 'Ü', '3', '(', '«', '“', '"', "'", ',', ' ', '¿'];
    let breaks = 0;
    for (const a of before) {
      for (const b of prev) {
        for (const dash of ['—', '–']) {
          for (const c of next) {
            if (!breaksAfterDash(b, dash, c, a === ' ' ? undefined : a)) continue;
            breaks++;
            const content = `x${a}${b}${dash}${c}y`;
            expect(migrateConfig(stored, 6, { content }).bodyText?.breakAfterDashes, JSON.stringify(content)).toBe(false);
          }
        }
      }
    }
    expect(breaks).toBeGreaterThan(100);
  });
});

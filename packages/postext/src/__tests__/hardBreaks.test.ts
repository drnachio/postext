import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../parse';
import { buildDocument } from '../pipeline';
import { renderToHtml } from '../html-backend';
import { measureRichBlock, measureBlock } from '../measure';
import { CONFIG_VERSION, migrateConfig, migrateBundleConfig, pinLegacyHardBreaks } from '../bundle/configVersion';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../defaults/bodyText';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTDocument, VDTLine } from '../vdt';

// #620: forced line breaks inside a paragraph — a backslash that ends a
// source line, or `\\` — end the line there; the line before the break is
// set at its natural width, the paragraph goes on.

// 7 px a character, whatever the font.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const BREAK = ' ';
const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (bodyText: Record<string, unknown> = {}, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(300), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { firstLineIndent: pt(0), textAlign: 'justify', fontFamily: 'Test', boldFontWeight: 700, hyphenation: { enabled: false }, ...bodyText },
  ...extra,
});

const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');
const words = (line: VDTLine): string => line.text.trim();

const LONG = 'The quick brown fox jumps over the lazy dog and keeps running across the wide green field';
const SHORT = 'Short line.';

describe('the parser (#620)', () => {
  it('reads a backslash at the end of a line as a forced break, the source map 1:1', () => {
    const md = 'One line\\\nnext line';
    const [b] = parseMarkdown(md);
    expect(b!.text).toBe(`One line${BREAK}next line`);
    expect(b!.sourceMap).toHaveLength(b!.text.length);
    expect(b!.sourceMap[8]).toBe(md.indexOf('\\'));
    expect(b!.sourceMap[9]).toBe(md.indexOf('next'));
    // The 1.22 reading rides along for stored configurations.
    expect(b!.literalBreaks?.text).toBe('One line\\ next line');
  });

  it('reads `\\\\` in a line as a forced break, with the spaces around it', () => {
    const md = 'a \\\\ b';
    const [b] = parseMarkdown(md);
    expect(b!.text).toBe(`a${BREAK}b`);
    expect(b!.sourceMap).toEqual([0, 2, 5]);
  });

  it('leaves a `\\\\` glued to the next character alone', () => {
    expect(parseMarkdown('rise \\\\*40 now')[0]!.text).not.toContain(BREAK);
    expect(parseMarkdown('see C:\\\\path here')[0]!.text).toBe('see C:\\\\path here');
  });

  it('keeps the backslashes of code, maths and link destinations, and of a paragraph end', () => {
    expect(parseMarkdown('In `a\\\\b` code')[0]!.text).toBe('In a\\\\b code');
    expect(parseMarkdown('x $a \\\\ b$ y')[0]!.text).not.toContain(BREAK);
    expect(parseMarkdown('[link](http://x/\\\\y) z')[0]!.text).toBe('link z');
    expect(parseMarkdown('ends here\\')[0]!.text).toBe('ends here\\');
    expect(parseMarkdown('ends here \\\\')[0]!.text).toBe('ends here \\\\');
    expect(parseMarkdown('ends here\\')[0]!.literalBreaks).toBeUndefined();
  });

  it('merges two breaks in a row', () => {
    const [b] = parseMarkdown('a\\\n\\\nb');
    expect(b!.text).toBe(`a${BREAK}b`);
  });

  it('keeps inline formatting across a break', () => {
    const [b] = parseMarkdown('**bold\\\nnext**');
    expect(b!.text).toBe(`bold${BREAK}next`);
    expect(b!.spans.every((s) => s.bold)).toBe(true);
  });

  it('breaks quotations and list items too, and leaves two trailing spaces alone', () => {
    expect(parseMarkdown('> quote\\\n> two')[0]!.text).toBe(`quote${BREAK}two`);
    expect(parseMarkdown('- item \\\\ two')[0]!.text).toBe(`item${BREAK}two`);
    expect(parseMarkdown('two spaces  \nnext')[0]!.text).toBe('two spaces next');
  });

  it('joins Chinese lines with no space and breaks them at a backslash', () => {
    expect(parseMarkdown('中文\\\n文字')[0]!.text).toBe(`中文${BREAK}文字`);
  });

  it('leaves a heading title break as it was', () => {
    const [h] = parseMarkdown('# One \\\\ Two');
    expect(h!.titleBreaks).toEqual([3]);
    expect(h!.literalBreaks).toBeUndefined();
  });
});

describe('layout (#620)', () => {
  const md = `${SHORT}\\\n${LONG}`;

  for (const [name, bodyText] of [
    ['Knuth–Plass', {}],
    ['line by line', { optimalLineBreaking: false }],
  ] as const) {
    it(`ends the line at the break, set at its natural width (${name})`, () => {
      for (const markdown of [md, `**${SHORT}**\\\n${LONG}`]) {
        const doc = buildDocument({ markdown }, config(bodyText));
        const [p] = paragraphs(doc);
        const lines = p!.lines;
        expect(words(lines[0]!)).toBe(SHORT);
        expect(lines[0]!.isLastLine).toBe(true);
        expect(lines[0]!.hardBreak).toBe(true);
        expect(lines[0]!.justifiedSpaceRatio).toBeUndefined();
        expect(lines[1]!.text.startsWith('The')).toBe(true);
        expect(lines.length).toBeGreaterThan(2);
        // The lines before the paragraph's end but the break are justified.
        expect(lines.slice(1, -1).every((l) => !l.isLastLine)).toBe(true);
        expect(lines[lines.length - 1]!.hardBreak).toBeUndefined();
        // One paragraph, its lines one under the other.
        lines.forEach((l, i) => expect(l.bbox.y - lines[0]!.bbox.y).toBeCloseTo(i * (lines[1]!.bbox.y - lines[0]!.bbox.y), 5));
        // Plain and source ranges skip the break.
        expect(lines[0]!.plainEnd).toBe(SHORT.length);
        expect(lines[1]!.plainStart).toBe(SHORT.length + 1);
        expect(lines[1]!.sourceStart).toBe(markdown.indexOf('The'));
      }
    });
  }

  it('breaks a ragged paragraph too, and a Chinese one', () => {
    const ragged = paragraphs(buildDocument({ markdown: md }, config({ textAlign: 'left' })))[0]!;
    expect(words(ragged.lines[0]!)).toBe(SHORT);
    const zh = paragraphs(buildDocument({ markdown: '短行。\\\n这是一段很长的中文文字，它会在页面的宽度内自动换行，并且继续排下去，直到段落结束为止。' }, config({}, { locale: 'zh-Hans' })))[0]!;
    expect(zh.lines[0]!.text.trim()).toBe('短行。');
    expect(zh.lines[0]!.hardBreak).toBe(true);
    expect(zh.lines.length).toBeGreaterThan(2);
  });

  it('indents the paragraph\'s first line only, and hangs every line after it', () => {
    const indented = paragraphs(buildDocument({ markdown: md }, config({ firstLineIndent: pt(20), indentAfterHeading: true })))[0]!;
    const x = (l: VDTLine) => l.bbox.x - indented.bbox.x;
    expect(x(indented.lines[0]!)).toBeCloseTo(20, 5);
    expect(x(indented.lines[1]!)).toBeCloseTo(0, 5);
    const hanging = paragraphs(buildDocument({ markdown: md }, config({ firstLineIndent: pt(20), hangingIndent: true })))[0]!;
    const hx = (l: VDTLine) => l.bbox.x - hanging.bbox.x;
    expect(hx(hanging.lines[0]!)).toBeCloseTo(0, 5);
    for (const l of hanging.lines.slice(1)) expect(hx(l)).toBeCloseTo(20, 5);
  });

  it('copies a line feed at the break', () => {
    const doc = buildDocument({ markdown: md }, config({ textAlign: 'left' }));
    const html = renderToHtml(doc);
    const [p] = paragraphs(doc);
    const start = html.indexOf(`data-block-id="${p!.id}"`);
    const text = html.slice(start).replace(/<[^>]+>/g, '');
    expect(text.startsWith(`${SHORT}\n`) || text.includes(`${SHORT}\n`)).toBe(true);
  });

  it('prints the backslashes under bodyText.hardLineBreaks: false', () => {
    const doc = buildDocument({ markdown: md }, config({ hardLineBreaks: false, textAlign: 'left' }));
    const [p] = paragraphs(doc);
    expect(p!.lines[0]!.text).toContain('\\');
    expect(p!.lines.some((l) => l.hardBreak)).toBe(false);
  });
});

describe('the measurers (#620)', () => {
  const font = '10px Test';
  const spans = (text: string) => [{ text, bold: false, italic: false }];
  const text = `${SHORT}${BREAK}${LONG}${BREAK}${LONG}`;
  const opts = { textAlign: 'justify' as const, optimal: true, maxStretchRatio: 2, minShrinkRatio: 0.6 };

  it('break the text between two breaks on its own, on every path', () => {
    for (const m of [
      measureRichBlock(spans(text), font, font, font, font, 200, 14, opts),
      measureBlock(text, font, 200, 14, opts),
      measureRichBlock(spans(text), font, font, font, font, 200, 14, { textAlign: 'justify' }),
    ]) {
      expect(words(m.lines[0]!)).toBe(SHORT);
      const ends = m.lines.flatMap((l, i) => (l.hardBreak ? [i] : []));
      expect(ends).toHaveLength(2);
      expect(m.totalHeight).toBe(m.lines.length * 14);
    }
  });

  it('weighs the runt of the paragraph\'s last line only', () => {
    const m = measureRichBlock(spans(`Hi.${BREAK}${LONG}`), font, font, font, font, 200, 14, { ...opts, runtPenalty: 5000, runtMinCharacters: 20 });
    expect(words(m.lines[0]!)).toBe('Hi.');
  });

  it('runs the paragraph a line long with looseness', () => {
    const natural = measureRichBlock(spans(text), font, font, font, font, 200, 14, opts);
    const loose = measureRichBlock(spans(text), font, font, font, font, 200, 14, { ...opts, looseness: 1 });
    expect(loose.lines.length).toBe(natural.lines.length + 1);
    expect(loose.lines.filter((l) => l.hardBreak)).toHaveLength(2);
  });

  it('keeps the breaks of a trace cut to its first lines', () => {
    const first = measureRichBlock(spans(text), font, font, font, font, 200, 14, opts);
    expect(first.breaks?.at).toHaveLength(first.lines.length);
    const again = measureRichBlock(spans(text), font, font, font, font, 200, 14, { ...opts, keepBreaks: { path: first.breaks!.path, at: first.breaks!.at.slice(0, 3) } });
    expect(again.lines.map((l) => l.text)).toEqual(first.lines.map((l) => l.text));
  });

  it('sets later lines at another measure (restWidths) counted through the paragraph', () => {
    const m = measureRichBlock(spans(text), font, font, font, font, 200, 14, { ...opts, restWidths: [{ fromLine: 2, maxWidthPx: 120 }] });
    for (const l of m.lines.slice(2)) expect(l.bbox.width).toBeLessThanOrEqual(120 + 1e-6);
    expect(m.lines[1]!.bbox.width).toBeGreaterThan(120);
  });
});

describe('CONFIG_VERSION 9 (#620)', () => {
  const stored = { bodyText: { fontSize: pt(10) } } as PostextConfig;

  it('pins documents stored before #620 whose text holds a forced break', () => {
    expect(CONFIG_VERSION).toBe(10);
    for (const content of ['One line\\\nnext', 'a \\\\ b', 'a\\\\\nb', '> quote\\\n> more']) {
      expect(migrateConfig(stored, 8, { content }).bodyText?.hardLineBreaks).toBe(false);
    }
    expect(migrateConfig(stored, 8).bodyText?.hardLineBreaks).toBe(false);
    expect(migrateBundleConfig({} as PostextConfig, [stored], 8, { content: 'a\\\nb' }).bodyText?.hardLineBreaks).toBe(false);
  });

  it('leaves text with no such backslash, and current documents, as they are', () => {
    for (const content of [
      'Plain text\nwith lines.',
      'Ends the paragraph\\\n\nNext paragraph.',
      '$$\na \\\\ b\n$$',
      'Inline $a \\\\ b$ maths.',
      '# Title \\\\ broken',
      ':::verse\nOne line \\\\ two\n:::',
      'Code `a\\\\b` here.',
      'Escaped \\\\*star and C:\\\\path.',
    ]) {
      expect(migrateConfig(stored, 8, { content }).bodyText?.hardLineBreaks).toBeUndefined();
    }
    expect(migrateConfig(stored, CONFIG_VERSION, { content: 'a\\\nb' })).toBe(stored);
    const named = { bodyText: { hardLineBreaks: true } } as PostextConfig;
    expect(pinLegacyHardBreaks(named)).toBe(named);
  });

  it('resolves and strips the setting', () => {
    expect(resolveBodyTextConfig(undefined).hardLineBreaks).toBe(true);
    expect(resolveBodyTextConfig({ hardLineBreaks: false }).hardLineBreaks).toBe(false);
    expect(stripBodyTextDefaults(resolveBodyTextConfig({ hardLineBreaks: false }))?.hardLineBreaks).toBe(false);
    expect(stripBodyTextDefaults(resolveBodyTextConfig(undefined))?.hardLineBreaks).toBeUndefined();
  });
});

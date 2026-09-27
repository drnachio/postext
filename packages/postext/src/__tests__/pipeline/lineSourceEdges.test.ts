import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { stampSourceRanges } from '../../pipeline/buildHelpers';
import { computeSourceMap, parseMarkdown } from '../../parse';
import { createBoundingBox } from '../../vdt';
import type { VDTLine } from '../../vdt';
import type { ContentBlock } from '../../parse';

// Deterministic stub: every character, the space included, is 7 px wide;
// bold ones 8 px.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * (/bold|700/.test(this.font) ? 8 : 7) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });

function linesAt(markdown: string, width: number, textAlign: 'left' | 'justify' = 'left', hyphenate = true): VDTLine[] {
  return buildDocument({ markdown }, {
    page: { width: mm(width), height: mm(400), margins: { top: mm(5), bottom: mm(5), left: mm(5), right: mm(5) } },
    layout: { layoutType: 'single' },
    bodyText: { textAlign, firstLineIndent: mm(0), hyphenation: { enabled: hyphenate, ragged: hyphenate } },
    header: { elements: [] },
    footer: { elements: [] },
  }).blocks.flatMap((b) => b.lines);
}

// EF-177: the dictionary puts a zero-width space after every slash of a word
// it hyphenates. It must reach neither a line's text nor its segments, and
// the lines' source offsets must follow the source.
describe('web addresses and slashes in hyphenated text (EF-177)', () => {
  const URL_MD = 'The timetable is posted at both slips and at https://aldercounty.example/nightferry today.';
  const SLASH_MD = 'Each input/output channel and every read/write head reports its state to the controller/supervisor.';

  for (const [name, md] of [['a web address', URL_MD], ['words joined by a slash', SLASH_MD], ['a web address, formatted', URL_MD.replace('posted', '**posted**')], ['words joined by a slash, formatted', SLASH_MD.replace('Each', '**Each**')]] as const) {
    for (const textAlign of ['left', 'justify'] as const) {
      it(`keeps U+200B out of the lines and the offsets on the source (${name}, ${textAlign})`, () => {
        for (let width = 30; width <= 80; width += 2) {
          const lines = linesAt(md, width, textAlign);
          let covered = '';
          for (const [i, line] of lines.entries()) {
            expect(line.text, `${width} mm`).not.toMatch(/​/);
            for (const seg of line.segments ?? []) expect(seg.text, `${width} mm`).not.toMatch(/​/);
            const src = md.slice(line.sourceStart, line.sourceEnd).replace(/\*\*/g, '');
            const printed = line.hyphenated && !line.hardHyphen ? line.text.replace(/-$/, '') : line.text;
            expect(src, `${width} mm, line ${i}`).toBe(printed.trimEnd());
            if (i > 0) {
              // Nothing but the space a break consumed lies between two lines.
              const gap = md.slice(lines[i - 1]!.sourceEnd, line.sourceStart);
              expect(gap === '' || gap === ' ', `${width} mm, line ${i}: ${JSON.stringify(gap)}`).toBe(true);
            }
            covered += src;
          }
          expect(covered.replace(/\s/g, '')).toBe(md.replace(/\*\*/g, '').replace(/\s/g, ''));
        }
      });
    }
  }

  it('does not let a zero-width character the line holds, and the text lacks, move the offsets', () => {
    // A measurer that leaves a U+200B in a line (as 1.4's rich path did
    // after a slash) must not shift the offsets of that line or the next.
    const text = 'see https://a.example/b now';
    const block: ContentBlock = {
      type: 'paragraph',
      text,
      spans: [{ text, bold: false, italic: false }],
      sourceStart: 0,
      sourceEnd: text.length,
      sourceMap: [...text].map((_, i) => i),
    };
    const line = (t: string, y: number): VDTLine => ({ text: t, bbox: createBoundingBox(0, y, 10, 10), baseline: y + 8, hyphenated: false });
    const measured = { lines: [line('see https://​a.example/', 0), line('b now', 10)], totalHeight: 20 };
    measured.lines[0]!.hyphenated = true;
    stampSourceRanges(measured, block, block, 0);
    expect(text.slice(measured.lines[0]!.sourceStart, measured.lines[0]!.sourceEnd)).toBe('see https://a.example/');
    expect(text.slice(measured.lines[1]!.sourceStart, measured.lines[1]!.sourceEnd)).toBe('b now');
  });
});

// EF-178: a backslash escape (`\$`) prints one character. A line that opens
// with it starts at the backslash, so no source character between two lines
// belongs to neither.
describe('a line that opens with an escaped character (EF-178)', () => {
  const cases = [
    'A car and driver pay \\$9, and a monthly pass costs \\$40.',
    'A car and driver pay \\*9, and a monthly pass costs \\*40.',
    'A car and *driver* pay \\$9, and a monthly pass costs \\$40 or \\_12 in \\~tildes\\~ and \\^carets\\^.',
  ];
  /** The source as printed: the escapes the body reads (`\$`, `\*`, `\_`,
   *  `\^`, `\~`), emphasis markers dropped. */
  const unescape = (s: string) => s.replace(/\\([$*_^~])|\*/g, (_, c: string | undefined) => c ?? '');

  for (const md of cases) {
    it(`covers the backslash: ${md.slice(0, 40)}…`, () => {
      let openers = 0;
      for (let width = 24; width <= 70; width += 1) {
        for (const textAlign of ['left', 'justify'] as const) {
          const lines = linesAt(md, width, textAlign, false);
          for (const [i, line] of lines.entries()) {
            const src = md.slice(line.sourceStart, line.sourceEnd);
            expect(unescape(src), `${width} mm, line ${i}`).toBe(line.text.trimEnd());
            if (i > 0) {
              const gap = md.slice(lines[i - 1]!.sourceEnd, line.sourceStart);
              expect(gap === '' || gap === ' ', `${width} mm, line ${i}: ${JSON.stringify(gap)}`).toBe(true);
              if (md[line.sourceStart!] === '\\') openers++;
            }
          }
        }
      }
      expect(openers).toBeGreaterThan(0);
    });
  }

  it('keeps the per-character map on the escaped character (the Sandbox caret)', () => {
    const [block] = parseMarkdown('pay \\$9');
    expect(block!.text).toBe('pay $9');
    expect(block!.sourceMap).toEqual([0, 1, 2, 3, 5, 6]);
  });

  it('starts at the second backslash when the first one is printed, and not at a literal one', () => {
    // `\\*`: the body prints the first backslash and reads `\*` as an escape.
    const md = 'Costs rise \\\\*40 and \\\\*50 in every quarter of the year while `a\\$b` stays literal.';
    let seen = 0;
    for (let width = 24; width <= 60; width += 1) {
      const lines = linesAt(md, width, 'left', false);
      for (const [i, line] of lines.entries()) {
        if (i === 0) continue;
        const gap = md.slice(lines[i - 1]!.sourceEnd, line.sourceStart);
        expect(gap === '' || gap === ' ', `${width} mm, line ${i}: ${JSON.stringify(gap)}`).toBe(true);
        if (line.text.startsWith('\\*')) {
          seen++;
          expect(md.slice(line.sourceStart, line.sourceStart! + 3)).toBe('\\\\*');
        }
        if (line.text.startsWith('`') || line.text.startsWith('a\\$')) {
          expect(md[line.sourceStart!]).not.toBe(' ');
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    // A backslash in a code span is literal: the map is one to one there.
    expect(computeSourceMap('`a\\$b`', 0, 6, 'a\\$b')).toEqual([1, 2, 3, 4]);
  });
});

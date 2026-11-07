// Text of the semantic writer after the third page review (#1444): flush
// first paragraphs, the faces and colours of emphasis, list spacing and
// tab stops, a paragraph style's margins, swatches in their palette
// colour, inline maths at the text's size. Every export reads back
// unchanged.

import { describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import type { PostextConfig } from '../../../types.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, type Exported } from '../fixtures/harness.js';
import { circled } from './chips.js';

const cfg = (c: Record<string, unknown>): PostextConfig => c as unknown as PostextConfig;

function unchanged(e: Exported, md: string[]): void {
  const r = applyDocxEdits(e.bytes, { chapters: md.map((markdown, i) => ({ id: `ch${i + 1}`, markdown })) });
  expect(r.edits).toEqual([]);
  expect(r.chapters.map((c) => c.markdown)).toEqual(md);
}

/** The `w:p` that holds `text`. */
const paraOf = (xml: string, text: string): string => {
  const at = xml.indexOf(text);
  const start = xml.lastIndexOf('<w:p>', at);
  return xml.slice(start, xml.indexOf('</w:p>', at) + 6);
};

const styleOf = (e: Exported, id: string): string => {
  const xml = e.part('word/styles.xml');
  const at = xml.indexOf(`w:styleId="${id}"`);
  return at < 0 ? '' : xml.slice(at, xml.indexOf('</w:style>', at));
};

describe('semantic docx: text after the third review (#1444)', () => {
  it('sets the first paragraph after a heading or a space flush when the body does not indent it', async () => {
    const md = '# Title\n\nFirst after.\n\nSecond.\n\n:::space\n\nAfter space.\n\n## Sub\n\n:::paragraphs{style="hang"}\nHung.\n:::\n';
    const config = cfg({ bodyText: { indentAfterHeading: false, firstLineIndent: { value: 1, unit: 'em' } }, paragraphStyles: [{ id: 'hang', hangingIndent: { value: 2, unit: 'em' } }] });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(paraOf(e.doc, 'First after.')).toContain('<w:ind w:firstLine="0"/>');
    expect(paraOf(e.doc, 'Second.')).not.toContain('<w:ind');
    expect(paraOf(e.doc, 'After space.')).toContain('<w:ind w:firstLine="0"/>');
    // A hanging paragraph keeps its hang.
    expect(paraOf(e.doc, 'Hung.')).not.toContain('<w:ind');
    unchanged(e, [md]);
    // The default indents it like any other.
    const plain = await exportDocx(md, { config: cfg({ bodyText: { firstLineIndent: { value: 1, unit: 'em' } } }) });
    expect(paraOf(plain.doc, 'First after.')).not.toContain('<w:ind');
  });

  it('sets a list item\'s italic in the body\'s face and emphasis in the style\'s colours', async () => {
    const md = 'Body *it* and **bold**.\n\n- An *italic* item\n\n:::callout{type="info"}\nA **key** term.\n:::\n';
    const config = cfg({
      bodyText: { color: { hex: '#111111', model: 'hex' }, boldColor: { hex: '#111111', model: 'hex' }, italicColor: { hex: '#aa0000', model: 'hex' } },
      calloutStyles: [{ id: 'info', body: { boldColor: { hex: '#1d5470', model: 'hex' } } }],
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    // Bold in the body's own ink takes no colour; italic its colour.
    expect(paraOf(e.doc, 'Body')).toMatch(/<w:i\/><w:iCs\/><w:color w:val="AA0000"\/><\/w:rPr><w:t[^>]*>it</);
    expect(paraOf(e.doc, 'Body')).toMatch(/<w:b\/><w:bCs\/><\/w:rPr><w:t[^>]*>bold</);
    expect(paraOf(e.doc, 'An ')).toMatch(/<w:color w:val="AA0000"\/><\/w:rPr><w:t[^>]*>italic</);
    // A box's bold takes the box's strong colour.
    expect(paraOf(e.doc, 'key')).toMatch(/<w:color w:val="1D5470"\/><\/w:rPr><w:t[^>]*>key</);
    unchanged(e, [md]);
  });

  it('spaces list items as the engine does and keeps the list paragraph style\'s face', async () => {
    const md = 'Intro.\n\n1. Question\n   - option\n2. Next\n\nAfter.\n';
    const config = cfg({ orderedLists: { itemSpacing: { value: 5, unit: 'pt' }, marginTop: { value: 7.5, unit: 'pt' }, marginBottom: { value: 0, unit: 'pt' } }, unorderedLists: { itemSpacing: { value: 15, unit: 'pt' } } });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    // 5 pt = 100 twips under the question and under its option too (the
    // item after a nested list takes its own list's spacing), the list's
    // top margin above the first.
    expect(paraOf(e.doc, 'Question')).toContain('<w:spacing w:before="150" w:after="100"/>');
    expect(paraOf(e.doc, 'option')).toContain('<w:spacing w:after="100"/>');
    expect(paraOf(e.doc, 'Next')).toContain('<w:spacing w:after="0"/>');
    expect(paraOf(e.doc, 'Question')).toContain('<w:contextualSpacing w:val="0"/>');
    unchanged(e, [md]);
  });

  it('sets a tab to the body\'s end stop', async () => {
    const md = '1. Which year? :tab :chip[1 mark]\n';
    const e = await exportDocx(md, { config: cfg({ bodyText: { tabStops: [{ position: 'end', align: 'end' }] } }) });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(paraOf(e.doc, 'Which year?')).toMatch(/<w:tabs><w:tab w:val="right" w:pos="\d+"\/><\/w:tabs>/);
    unchanged(e, [md]);
  });

  it('keeps a paragraph style\'s margins round its group, not between its paragraphs', async () => {
    const md = ':::paragraphs{style="argument"}\nOne.\n\nTwo.\n:::\n\nNext.\n';
    const config = cfg({ paragraphStyles: [{ id: 'argument', italic: true, marginTop: { value: 0, unit: 'pt' }, marginBottom: { value: 16, unit: 'pt' }, spaceBetween: { value: 0, unit: 'pt' } }] });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const style = styleOf(e, 'PostextParaargument');
    expect(style).toContain('w:after="320"');
    expect(style).toContain('<w:contextualSpacing/>');
    unchanged(e, [md]);
  });

  it('fills a swatch with its palette colour', async () => {
    const md = 'Key :swatch{color="sea"} sea.\n';
    const e = await exportDocx(md, { config: cfg({ colorPalette: [{ id: 'sea', name: 'Sea', value: { hex: '#1d5470', model: 'hex' } }] }) });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toMatch(/<w:color w:val="1D5470"\/><\/w:rPr><w:t[^>]*>■</);
    unchanged(e, [md]);
  });

  it('sets inline maths at the text\'s size, its fractions stacked as in print', async () => {
    const md = 'Length $L(1+\\tfrac{2}{5})$ and $\\frac{a+b}{c+d}$ here.\n';
    const e = await exportDocx(md, { config: cfg({ bodyText: { fontSize: { value: 9.5, unit: 'pt' } } }) });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toContain('<m:r><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr><m:t xml:space="preserve">L</m:t></m:r>');
    expect(e.doc).toContain('<m:f><m:num>');
    expect(e.doc).not.toContain('m:val="lin"');
    unchanged(e, [md]);
    // An edited fraction comes back as a fraction, not as a slash.
    const files = unzipSync(e.bytes);
    files['word/document.xml'] = strToU8(e.doc.replace('>5</m:t>', '>7</m:t>'));
    const r = applyDocxEdits(zipSync(files), { chapters: [{ id: 'ch1', markdown: md }] });
    expect(r.edits).toHaveLength(1);
    expect(r.chapters[0]!.markdown).toMatch(/\\frac\{2\}\{7\}/);
    expect(r.chapters[0]!.markdown).not.toMatch(/2\/7/);
  });

  it('knows the circled forms of letters and numbers', () => {
    expect(circled('A', false)).toBe('Ⓐ');
    expect(circled('z', false)).toBe('ⓩ');
    expect(circled('C', true)).toBeUndefined();
    expect(circled('7', true)).toBe('❼');
    expect(circled('12', false)).toBe('⑫');
    expect(circled('12', true)).toBe('⓬');
    expect(circled('AB', false)).toBeUndefined();
  });
});

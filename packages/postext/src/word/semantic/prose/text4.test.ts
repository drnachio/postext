// Text of the semantic writer after the fourth review (#1444): lists in a
// box in the box's face with no space under its title, display numbers
// that keep the leading, a box with a fill kept off the text above it,
// flush paragraph groups after a heading, contents entries in their
// configured columns and faces, wide readings centred over their base,
// display equations at the paragraph's size, and vertical text without
// widow control. Every export reads back unchanged.

import { describe, expect, it } from 'vitest';
import type { PostextConfig } from '../../../types.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, type Exported } from '../fixtures/harness.js';

const cfg = (c: Record<string, unknown>): PostextConfig => c as unknown as PostextConfig;
const pt = (value: number) => ({ value, unit: 'pt' });
const mm = (value: number) => ({ value, unit: 'mm' });

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

describe('semantic docx: text after the fourth review (#1444)', () => {
  it('sets a list in a box in the box\'s face, with no space above it under the title', async () => {
    const md = 'Body.\n\n:::callout{type="panel" title="In this chapter"}\n- One *item*\n- Two\n:::\n\n- Outside\n';
    const config = cfg({
      bodyText: { fontFamily: 'Serif Body' },
      unorderedLists: { marginTop: pt(14) },
      calloutStyles: [{ id: 'panel', body: { fontFamily: 'Sans Box', fontSize: pt(8), lineHeight: pt(11) } }],
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const item = paraOf(e.doc, 'One');
    expect(item).toContain('<w:pStyle w:val="PostextListBoxpanel"/>');
    expect(item).toContain('w:before="0"');
    const list = styleOf(e, 'PostextListBoxpanel');
    expect(list).toContain('<w:basedOn w:val="PostextBoxpanel"/>');
    expect(styleOf(e, 'PostextBoxpanel')).toContain('Sans Box');
    // A list outside a box keeps the body's list style and its space.
    expect(paraOf(e.doc, 'Outside')).toContain('<w:pStyle w:val="ListParagraph"/>');
    expect(paraOf(e.doc, 'Outside')).toContain('w:before="280"');
    unchanged(e, [md]);
  });

  it('holds an item with a display number to the leading of its text', async () => {
    const md = '1. Peel the potatoes and slice them thin.\n2. Fry them.\n\n- A bullet\n';
    const config = cfg({ bodyText: { fontSize: pt(9.5), lineHeight: pt(12.8) }, orderedLists: { numberFontSize: pt(26) } });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(paraOf(e.doc, 'Peel')).toContain('w:line="256" w:lineRule="exact"');
    expect(paraOf(e.doc, 'A bullet')).not.toContain('w:lineRule="exact"');
    unchanged(e, [md]);
    // A number at the text's size leaves the leading alone.
    const plain = await exportDocx(md, { config: cfg({ bodyText: { fontSize: pt(9.5), lineHeight: pt(12.8) } }) });
    expect(paraOf(plain.doc, 'Peel')).not.toContain('w:lineRule="exact"');
  });

  it('keeps a filled box half a line off the text above it', async () => {
    const md = 'Text above.\n\n:::callout{type="term"}\nA term.\n:::\n';
    const config = cfg({ bodyText: { lineHeight: pt(13.5) }, calloutStyles: [{ id: 'term', backgroundEnabled: true, background: { hex: '#edf5f1', model: 'hex' }, marginTop: pt(0) }] });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const before = e.doc.slice(e.doc.indexOf('Text above.'), e.doc.indexOf('<w:tag w:val="ptx:box:term"/>'));
    expect(before).toMatch(/w:line="135" w:lineRule="exact"/);
    unchanged(e, [md]);
  });

  it('sets a paragraph group after a heading flush, as the engine does', async () => {
    const md = '## A note\n\n:::paragraphs{style="note"}\nFirst of the note.\n\nSecond of the note.\n:::\n\nBody after.\n';
    const config = cfg({ bodyText: { indentAfterHeading: false, firstLineIndent: pt(10) }, paragraphStyles: [{ id: 'note' }] });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(paraOf(e.doc, 'First of the note.')).toContain('<w:ind w:firstLine="0"/>');
    expect(paraOf(e.doc, 'Second of the note.')).not.toContain('<w:ind');
    expect(paraOf(e.doc, 'Body after.')).not.toContain('<w:ind');
    unchanged(e, [md]);
  });

  it('sets contents entries in their columns: a right-aligned number in its face, the title in the level\'s', async () => {
    const md = '# Contents {toc=false}\n\n:::toc\n\n# First poem {author="A. Poet"}\n\nText.\n';
    const config = cfg({
      headings: { levels: [{ level: 1, numbering: { enabled: true, template: '{1:upper-roman}' } }] },
      toc: {
        levels: [{ level: 1, italic: true, marginBottom: pt(15), numberColor: { hex: '#56673f', model: 'hex' }, numberWidth: mm(6), numberGap: mm(3) }],
        pageNumber: { color: { hex: '#746a60', model: 'hex' } },
        subtitle: { enabled: true, italic: true, fontSize: pt(8) },
      },
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const toc1 = styleOf(e, 'TOC1');
    expect(toc1).toContain('<w:i/>');
    expect(toc1).toContain('w:after="300"');
    const entry = paraOf(e.doc, 'First poem');
    expect(entry).toMatch(/<w:tab w:val="right" w:pos="340"\/><w:tab w:val="left" w:pos="510"\/><w:tab w:val="right" w:leader="dot"/);
    expect(entry).toContain('<w:ind w:left="510" w:hanging="510"/>');
    expect(entry).toMatch(/<w:r><w:tab\/><\/w:r><w:r><w:rPr>.*?<w:color w:val="56673F"\/>.*?<w:t xml:space="preserve">[^<]+<\/w:t><\/w:r><w:r><w:tab\/><\/w:r>/);
    expect(entry).toContain('<w:color w:val="746A60"/>');
    // The subtitle line sits under the title and takes the entry's space after.
    expect(entry).toContain('w:after="0"');
    const sub = paraOf(e.doc, 'A. Poet');
    expect(sub).toContain('<w:pStyle w:val="PostextTOCsubtitle"/>');
    expect(sub).toContain('<w:spacing w:after="300"/><w:ind w:left="510" w:firstLine="0"/>');
    expect(styleOf(e, 'PostextTOCsubtitle')).toContain('<w:sz w:val="16"/>');
    unchanged(e, [md]);
  });

  it('keeps the contents columns and the leader setting in the level styles, which a field update keeps', async () => {
    const md = '# Contents {toc=false}\n\n:::toc\n\n# First poem\n\nText.\n\n# Second poem\n\nText.\n';
    const config = cfg({
      headings: { levels: [{ level: 1, numbering: { enabled: true, template: '{1:upper-roman}' } }] },
      toc: { levels: [{ level: 1, italic: true, numberWidth: mm(6), numberGap: mm(3) }], leader: { enabled: false } },
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    // Word rebuilds the entries from TOC1 on an update: the style holds
    // the number column, the hanging indent and a page tab with no leader.
    const toc1 = styleOf(e, 'TOC1');
    expect(toc1).toMatch(/<w:tab w:val="right" w:pos="340"\/><w:tab w:val="left" w:pos="510"\/><w:tab w:val="right" w:pos="\d+"\/>/);
    expect(toc1).toContain('<w:ind w:left="510" w:hanging="510"/>');
    expect(toc1).not.toContain('w:leader');
    expect(paraOf(e.doc, 'Second poem')).not.toContain('w:leader');
    unchanged(e, [md]);
  });

  it('sets unnumbered contents entries in the unnumbered look', async () => {
    const md = '# Contents {toc=false}\n\n:::toc\n\n# Editorial {style="plain"}\n\nText.\n\n# Comets\n\nText.\n';
    const config = cfg({
      headings: { levels: [{ level: 1, numbering: { enabled: true, template: '{1}' } }] },
      headingStyles: [{ id: 'plain', name: 'Plain', numbered: false }],
      toc: { levels: [{ level: 1, fontWeight: 700, italic: false }], unnumbered: { fontWeight: 400, italic: true } },
    });
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    // A level with numbered and unnumbered entries keeps no number column
    // in its style; each entry carries its own.
    const toc1 = styleOf(e, 'TOC1');
    expect(toc1).toContain('<w:b/>');
    expect(toc1).not.toContain('w:hanging');
    const plain = paraOf(e.doc, "Editorial");
    expect(plain).toMatch(/<w:rPr>[^]*?<w:b w:val="0"\/>[^]*?<w:i\/>[^]*?<\/w:rPr><w:t[^>]*>Editorial/);
    expect(paraOf(e.doc, 'Comets')).not.toContain('<w:i/>');
    unchanged(e, [md]);
  });

  it('centres a reading wider than its base, and spreads one that fits', async () => {
    const md = ':ruby[差支]{rt="さしつかえ"}ない。:ruby[東京都]{rt="とうきょうと"}。\n';
    const e = await exportDocx(md, { config: cfg({ locale: 'ja' }) });
    expect(exportProblems(e, [md])).toEqual([]);
    const rubies = [...e.doc.matchAll(/<w:rubyAlign w:val="(\w+)"\/>.*?<w:rubyBase>.*?<w:t[^>]*>([^<]+)<\/w:t>/g)].map((m) => [m[2], m[1]]);
    expect(rubies).toContainEqual(['差支', 'center']);
    expect(rubies).toContainEqual(['東京都', 'distributeSpace']);
    unchanged(e, [md]);
  });

  it('sets display equations at the paragraph\'s size', async () => {
    const md = 'Text.\n\n$$\nT = 2\\pi\\sqrt{L/g}\n$$\n';
    const e = await exportDocx(md, { config: cfg({ bodyText: { fontSize: pt(9.5) } }) });
    expect(exportProblems(e, [md])).toEqual([]);
    const runs = e.doc.match(/<m:r>.*?<\/m:r>/g) ?? [];
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r).toContain('<w:sz w:val="19"/>');
    unchanged(e, [md]);
  });

  it('turns widow control off in vertical text only', async () => {
    const md = '縦書きの本文。\n';
    const vertical = await exportDocx(md, { config: cfg({ locale: 'ja', layout: { writingMode: 'vertical-rl' } }) });
    expect(vertical.part('word/styles.xml')).toContain('<w:pPrDefault><w:pPr><w:widowControl w:val="0"/></w:pPr></w:pPrDefault>');
    unchanged(vertical, [md]);
    const plain = await exportDocx(md, { config: cfg({ locale: 'ja' }) });
    expect(plain.part('word/styles.xml')).toContain('<w:pPrDefault><w:pPr/></w:pPrDefault>');
  });
});

// Composed-page heads, strips, sound effects, videos, figure spacing,
// box label plates, boxes at a page's foot and tick marks in the semantic
// .docx (#1444, round four): each as print shows it, and an unedited
// export reading back into the exact Markdown.

import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from '../../../types.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, looseMarkup, type Exported } from '../fixtures/harness.js';
import { bottomBoxesLast } from './bottomBoxes.js';
import { panelShares } from './strip.js';
import { buildTree } from '../blocks.js';
import { parseMarkdownWithIssues } from '../../../parse/index.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const at = { createdAt: 0, updatedAt: 0 };
const pic = (id: string, extra: Partial<Resource> = {}): Resource => ({ id, typeId: 'figure', kind: 'bitmap', ...at, bitmap: { fileId: 'f1', format: 'png', width: 2000, height: 1000 }, ...extra });
const bytes = (id: string): Uint8Array | undefined => (id === 'f1' ? PNG : undefined);
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

/** An unedited export reads back into the same Markdown. */
function unchanged(e: Exported, md: string[], resources?: Resource[]): void {
  const r = applyDocxEdits(e.bytes, { chapters: md.map((markdown, i) => ({ id: `ch${i + 1}`, markdown })), ...(resources ? { resources } : {}) });
  expect(r.edits).toEqual([]);
  expect(r.chapters.map((c) => c.markdown)).toEqual(md);
}

describe('semantic docx round four: composed-page heads', () => {
  const config = {
    colorPalette: [{ id: 'tema', name: 'Tema', value: hex('#1b6aa0') }],
    headings: { levels: [{ level: 1, color: hex('#ffffff') }] },
    calloutStyles: [{ id: 'cover', background: { ...hex('#1b6aa0'), paletteId: 'tema' } }],
    pageTemplates: [
      {
        id: 'unit',
        decoration: {
          elements: [
            { kind: 'image', id: 'art', resourceId: 'cover', decorative: true, placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: 'fill', height: { value: 150, unit: 'mm' } } } },
            { kind: 'text', id: 'kicker', content: '{attr.unit}', fontSize: { value: 11, unit: 'pt' }, color: hex('#1b6aa0'), placement: { anchor: { to: '#title', edge: 'top-left' }, offset: { y: { value: -9, unit: 'mm' } } } },
          ],
        },
        frames: [{ name: 'title', takes: 'h1', style: 'cover' }, { name: 'text', flow: true }],
      },
      {
        id: 'topic',
        palette: 'tema=#336f27',
        decoration: { elements: [{ kind: 'box', id: 'tab', style: { backgroundColor: { ...hex('#1b6aa0'), paletteId: 'tema' } }, placement: { anchor: { to: '#title', edge: 'top-left' }, size: { width: { to: '#title', edge: 'right' }, height: { to: '#title', edge: 'bottom' } } } }] },
        frames: [{ name: 'title', takes: 'h1' }, { name: 'text', flow: true }],
      },
    ],
  } as unknown as PostextConfig;
  const md = '::::page{template="unit" unit="Unit 4 · Social science"}\n# Our river\n\nEvery town stands near water.\n::::\n\n::::page{template="topic"}\n# Where a river is born\n\nRain falls.\n::::\n';

  it('writes the cover picture, the kicker from the page attribute and the title on its band', async () => {
    const resources = [pic('cover')];
    const e = await exportDocx(md, { config, resources, resourceBytes: bytes });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    const art = e.doc.indexOf('name="cover"');
    const kicker = e.doc.indexOf('Unit 4 · Social science');
    const title = e.doc.indexOf('>Our river<');
    expect(art).toBeGreaterThan(0);
    expect(kicker).toBeGreaterThan(art);
    expect(title).toBeGreaterThan(kicker);
    // The kicker is the attribute printed: generated text.
    expect(e.frag('Unit 4 · Social science').target).toEqual({ kind: 'generated' });
    // The title sits in a cell shaded the band's colour, the second page's
    // in its own palette's green.
    expect(e.doc.slice(e.doc.lastIndexOf('<w:tbl>', title), title)).toContain('w:fill="1B6AA0"');
    const topic = e.doc.indexOf('>Where a river is born<');
    expect(e.doc.slice(e.doc.lastIndexOf('<w:tbl>', topic), topic)).toContain('w:fill="336F27"');
    expect(e.part('word/styles.xml')).toMatch(/on band[^]*?<w:color w:val="FFFFFF"\/>/);
    unchanged(e, [md], resources);
  });

  it("prints a template's number badge on a plate of its fill before the title", async () => {
    const badge = { kind: 'text', id: 'number', content: '{headingNumber}', fontSize: { value: 22, unit: 'pt' }, fontWeight: 700, color: hex('#1b6aa0'), box: { backgroundColor: hex('#ffffff') }, placement: { anchor: { to: '#title', edge: 'top-left' }, offset: { y: { value: 2, unit: 'mm' } } } };
    const tab = { kind: 'box', id: 'tab', style: { backgroundColor: hex('#1b6aa0') }, placement: { anchor: { to: '#title', edge: 'top-left' }, size: { width: { to: '#title', edge: 'right' }, height: { to: '#title', edge: 'bottom' } } } };
    const cfg = { headings: { levels: [{ level: 1, color: hex('#ffffff') }] }, pageTemplates: [{ id: 'topic', decoration: { elements: [tab, badge] }, frames: [{ name: 'title', takes: 'h1' }, { name: 'text', flow: true }] }] } as unknown as PostextConfig;
    const src = '::::page{template="topic"}\n# Where a river is born\n\nRain falls.\n::::\n\n::::page{template="topic"}\n# From the mountains\n\nIt runs.\n::::\n';
    const e = await exportDocx(src, { config: cfg });
    expect(exportProblems(e, [src])).toEqual([]);
    const title = e.doc.indexOf('>From the mountains<');
    const para = e.doc.slice(e.doc.lastIndexOf('<w:p>', title), title);
    // The number in the badge's ink on its white plate, then the title.
    expect(para).toMatch(/<w:color w:val="1B6AA0"\/>[^]*<w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"\/>[^]*\u00a02\u00a0/);
    expect(e.frag('\u00a02\u00a0 ').target).toEqual({ kind: 'generated' });
    unchanged(e, [src]);
  });
});

describe('semantic docx round four: strips and sound effects', () => {
  const md = 'Before.\n\n:::strip{split="* | * | *" caption="A strip in three panels."}\n::panel\neditor: The line runs over.\n::panel\ndesigner: Tighten the paragraph.\n::panel\nsfx: flip\n:::\n\nAfter.\n';
  const config = { comics: { balloonStyles: [{ id: 'sfx', color: hex('#b8322a') }] } } as unknown as PostextConfig;

  it('draws the panels as bordered cells with the caption in a row under them', async () => {
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    const strip = e.doc.slice(e.doc.indexOf('ptx:strip'), e.doc.indexOf('After.'));
    expect(strip.match(/<w:tc>/g)).toHaveLength(4);
    expect(strip).toContain('<w:gridSpan w:val="3"/>');
    expect(strip.indexOf('A strip in three panels.')).toBeGreaterThan(strip.indexOf('flip'));
    expect(e.frag('The line runs over.').role).toBe('comic:speech');
    // In a narrow panel a speaker's words run on under the name, with no
    // hanging indent.
    expect(e.part('word/styles.xml')).toMatch(/Comic speech in a panel[^]*?<w:ind w:left="0" w:firstLine="0"\/>/);
    expect(strip).not.toContain('w:hanging');
    // The sound in the sfx style's colour, larger than the lettering.
    expect(e.part('word/styles.xml')).toMatch(/Comic sound[^]*?<w:caps\/>[^]*?<w:color w:val="B8322A"\/>/);
    unchanged(e, [md]);
  });

  it('shares a strip by its one-tier split', () => {
    for (const s of panelShares('* | * | *', 3)) expect(s).toBeCloseTo(1 / 3);
    expect(panelShares('50 | *', 2)).toEqual([0.5, 0.5]);
    expect(panelShares('30 / *', 2)).toEqual([0.5, 0.5]);
  });
});

describe('semantic docx round four: figures and videos', () => {
  it('keeps a caption with its note, the note right under it, and space above the picture', async () => {
    const md = 'Text before.\n\n:::figure{resource="p"}\n::caption[A plate.]\n::note[Book I, line 1]\n:::\n\nText after.\n';
    const resources = [pic('p')];
    const e = await exportDocx(md, { resources, resourceBytes: bytes });
    expect(exportProblems(e, [md])).toEqual([]);
    const fig = e.doc.slice(e.doc.indexOf('ptx:figure:p'));
    expect(fig).toMatch(/<w:pStyle w:val="PostextFigure"\/><w:keepNext\/><w:spacing w:before="\d+"/);
    const cap = fig.slice(fig.lastIndexOf('<w:p>', fig.indexOf('A plate.')), fig.indexOf('A plate.'));
    expect(cap).toContain('<w:keepNext/>');
    expect(cap).toContain('w:after="0"');
    unchanged(e, [md], resources);
  });

  it('draws a video without a poster as its frame, play mark and QR code, linked', async () => {
    const md = 'Watch it.\n\n::resource{id="v"}\n';
    const resources: Resource[] = [{ id: 'v', typeId: 'video', kind: 'video', ...at, video: { source: 'file', url: 'https://example.com/v.m3u8', width: 1920, height: 1080 }, caption: 'The film.' } as Resource];
    let svg = '';
    const e = await exportDocx(md, { resources, resourceBytes: bytes, rasterizeSvg: async (s) => ((svg = s), PNG.slice()) });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(svg).toContain('#1f1f1f');
    expect(svg).toContain('crispEdges');
    expect(e.doc).toMatch(/<wp:docPr id="\d+" name="v"[^>]*><a:hlinkClick r:id="rId\w+"\/><\/wp:docPr>/);
    expect(e.part('word/_rels/document.xml.rels')).toContain('https://example.com/v.m3u8');
    expect(e.doc).not.toContain('▶');
    unchanged(e, [md], resources);
  });
});

describe('semantic docx round four: boxes', () => {
  it('sets a label tab as a padded plate at the head of its box', async () => {
    const md = ':::callout{type="try" label="Try it"}\nSqueeze a sponge.\n:::\n';
    const config = { calloutStyles: [{ id: 'try', border: { enabled: true, color: hex('#1b6aa0') }, label: { position: 'top-left', background: hex('#1b6aa0'), color: hex('#ffffff') } }] } as unknown as PostextConfig;
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const box = e.doc.slice(e.doc.indexOf('ptx:box:try'));
    // The plate is the cell's first paragraph, shaded, padded by borders
    // of its fill, narrowed by indents and kept with the text after it
    // (no nested table, which LibreOffice left behind at a page foot).
    const cell = box.slice(box.indexOf('<w:tc>'));
    const plate = cell.slice(cell.indexOf('<w:p>'), cell.indexOf('</w:p>'));
    expect(plate).toContain('Try it');
    expect(cell.slice(0, cell.indexOf('Try it'))).not.toContain('<w:tbl>');
    expect(plate).toContain('<w:keepNext/>');
    expect(plate).toContain('<w:shd w:val="clear" w:color="auto" w:fill="1B6AA0"/>');
    expect(plate).toMatch(/<w:top w:val="single" w:sz="4" w:space="\d+" w:color="1B6AA0"\/>/);
    expect(plate).toMatch(/<w:ind w:left="\d+" w:right="[1-9]\d*" w:firstLine="0"\/>/);
    expect(e.frag('Try it').role).toBe('attr:callout:label');
    unchanged(e, [md]);
  });

  it('moves a box placed at the foot of the page after the story it closes', async () => {
    const md = '# Front\n\n## Lead story\n\n:::callout{type="briefs" placement="bottom" title="In brief"}\nShort news.\n:::\n\nThe story goes on.\n\n### More of it\n\nAnd ends.\n\n## Next story\n\nOther text.\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    const at = (t: string): number => e.doc.indexOf(t);
    expect(at('Short news.')).toBeGreaterThan(at('And ends.'));
    expect(at('Short news.')).toBeLessThan(at('Next story'));
    unchanged(e, [md]);
  });

  it('leaves a box in place when the story ends right after it', () => {
    const { blocks } = parseMarkdownWithIssues('## A\n\n:::callout{placement="bottom"}\nx\n:::\n\n## B\n');
    const nodes = buildTree(blocks);
    expect(bottomBoxesLast(nodes, [])).toEqual(nodes);
  });
});

describe('semantic docx round four: tick marks', () => {
  it('ticks a one-answer question in rings and a task list in Arial squares', async () => {
    const md = ':::exercise\nPick one.\n\n- [ ] Red\n- [x] Blue\n:::\n\n- [ ] Eggs\n- [x] Bowl\n';
    const config = { exercises: { styles: [{ id: 'default', options: { labels: 'none' } }] } } as unknown as PostextConfig;
    const e = await exportDocx(md, { config });
    expect(exportProblems(e, [md])).toEqual([]);
    const numbering = e.part('word/numbering.xml');
    expect(numbering).toContain('<w:lvlText w:val="□"/>');
    expect(numbering).toContain('<w:lvlText w:val="■"/>');
    expect(numbering).not.toContain('Segoe UI Symbol');
    unchanged(e, [md]);
  });
});

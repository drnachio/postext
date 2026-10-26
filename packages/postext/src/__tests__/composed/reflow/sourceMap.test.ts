import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { parseMarkdown } from '../../../parse/index.js';
import { elementsForSource, findElement, sourceAt, type SourceElement } from '../../../composed/sourceMap.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, VDTBlock, VDTDocument, VDTPage } from '../../../index.js';
import { flowRectToPage, flowToPage } from '../../../vdt.js';
import { page8Fixture } from '../fixtures/page8.js';

// Seven px per character, whatever the face (no DOM in node).
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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
};

const page8 = (locale: 'es' | 'en', edit?: (md: string) => string) => {
  const { markdown, config, resources } = page8Fixture(locale);
  const md = edit ? edit(markdown) : markdown;
  return { md, doc: buildDocument({ markdown: md, resources }, config, createMeasurementCache()) };
};
const composed = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frameBlocks = (page: VDTPage): VDTBlock[] => {
  const ids = new Set(page.composed!.frames.flatMap((f) => f.blockIds));
  return (page.floats ?? []).filter((b) => ids.has(b.id));
};
const levels = (chain: SourceElement[]) => chain.map((e) => e.level);
const centre = (r: { x: number; y: number; width: number; height: number }) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** The glyphs a line paints, in logical order, spaces left out. */
function paintedGlyphs(line: VDTBlock['lines'][number]): string {
  let out = '';
  const segs = line.segments ?? [];
  segs.forEach((s, i) => {
    if (s.kind === 'space' || s.inserted || s.leader !== undefined) return;
    if (s.chip) { out += s.chip.runs.map((r) => r.text).join(''); return; }
    let t = s.text;
    if (i === segs.length - 1 && line.hyphenated && !line.hardHyphen && t.endsWith('-')) t = t.slice(0, -1);
    out += t;
  });
  return out.replace(/\s+/g, '');
}

describe('source map of a composed page (#857)', () => {
  for (const locale of ['es', 'en'] as const) {
    it(`every glyph of the ${locale} p. 8 stand-in resolves to its exact source`, () => {
      const { md, doc } = page8(locale);
      const page = composed(doc);
      let glyphs = 0;
      for (const block of frameBlocks(page)) {
        if (block.type === 'callout' || block.resourceBlock) continue;
        for (const line of block.lines) {
          if (line.plainStart === undefined || line.plainEnd === undefined || line.plainEnd <= line.plainStart) continue;
          // Sweep the line: each glyph sourceAt finds, read back from the
          // Markdown, in order, is the line as painted.
          const y = line.bbox.y + line.bbox.height / 2;
          const right = block.bbox.x + block.bbox.width;
          const found: number[] = [];
          for (let x = line.bbox.x + 0.5; x < right; x += 2) {
            const hit = sourceAt(doc, page.index, x, y)[0];
            if (!hit || hit.level !== 'text' || hit.source.kind !== 'markdown') continue;
            if (found[found.length - 1] !== hit.source.start) found.push(hit.source.start);
          }
          const read = [...new Set(found)].map((o) => md[o]!).join('').replace(/\s+/g, '');
          expect(read).toBe(paintedGlyphs(line));
          glyphs += read.length;
        }
      }
      expect(glyphs).toBeGreaterThan(600);
    });
  }

  it('a glyph in a frame answers with its line, paragraph, frame and template', () => {
    const { md, doc } = page8('es');
    const page = composed(doc);
    const f = page.composed!.frames.find((x) => x.name === 'dinero')!;
    const para = page.floats!.find((b) => b.id === f.blockIds[1])!;
    const line = para.lines[0]!;
    const chain = sourceAt(doc, page.index, line.bbox.x + 3, line.bbox.y + line.bbox.height / 2);
    // The three boxes of the stand-in stack as one group (#856).
    expect(levels(chain)).toEqual(['text', 'line', 'block', 'frame', 'group', 'template']);
    const [text, , block, frame, group, template] = chain;
    expect(group).toMatchObject({ id: 'cp0:group:cajas', source: { kind: 'config', path: '/pageTemplates/0/groups/0' } });
    expect(text!.source).toEqual({ kind: 'markdown', start: para.sourceStart, end: para.sourceStart! + 1 });
    expect(md[para.sourceStart!]).toBe('E');
    expect(block!.id).toBe('cp0:dinero-c0');
    expect(frame).toMatchObject({ id: 'cp0:dinero', source: { kind: 'config', path: '/pageTemplates/0/frames/2' }, content: { start: f.sourceStart, end: f.sourceEnd } });
    expect(template).toMatchObject({ id: 'cp0', source: { kind: 'config', path: '/pageTemplates/0' }, content: { start: page.composed!.sourceStart, end: page.composed!.sourceEnd } });
  });

  it('a chip’s words map character by character', () => {
    const { md, doc } = page8('es');
    const page = composed(doc);
    for (const block of frameBlocks(page)) {
      for (const line of block.lines) {
        for (const seg of line.segments ?? []) {
          if (!seg.chip) continue;
          const words = seg.chip.runs.map((r) => r.text).join('');
          expect(seg.chip.sourceOffsets).toHaveLength(words.length);
        }
      }
    }
    // Read through the block maps: each chip's words, written as they print.
    const texto = page.floats!.find((b) => b.id === 'cp0:texto-c1')!;
    const chipSegs = texto.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.chip));
    const starts = [...md.matchAll(/:chip\[/g)].map((m) => m.index!).filter((i) => i >= texto.sourceStart! && i < texto.sourceEnd!);
    chipSegs.forEach((s, i) => {
      const words = s.chip!.runs.map((r) => r.text).join('');
      expect(s.chip!.sourceOffsets!.map((o) => md[starts[i]! + o]).join('')).toBe(words);
    });
  });

  it('a frame’s tab maps to its label attribute; the decoration to the template and the fence', () => {
    const { md, doc } = page8('es');
    const page = composed(doc);
    const box = page.floats!.find((b) => b.id === 'cp0:dinero')!;
    const tab = box.designOverlay!.blocks.find((b) => b.kind === 'text')! as Extract<NonNullable<VDTBlock['designOverlay']>['blocks'][number], { kind: 'text' }>;
    const tabHit = sourceAt(doc, page.index, tab.bbox.x + tab.bbox.width / 2, tab.bbox.y + tab.bbox.height / 2);
    expect(tabHit[0]!.source.kind).toBe('attr');
    const label = tabHit[0]!.source as { name: string; start: number; end: number };
    expect(label.name).toBe('label');
    // The glyph under the middle of the tab, in the attribute's value.
    expect(label.end - label.start).toBe(1);
    expect(md.slice(tab.sourceStart, tab.sourceEnd)).toBe('Para qué sirve el dinero');
    expect(label.start).toBeGreaterThanOrEqual(tab.sourceStart!);
    expect(label.end).toBeLessThanOrEqual(tab.sourceEnd!);
    expect(levels(tabHit)).toEqual(['text', 'frame', 'group', 'template']);

    const deco = page.composed!.decoration!.blocks;
    const tema = deco.find((b) => b.elementId === 'tema')!;
    const temaHit = sourceAt(doc, page.index, ...Object.values(centre(tema.bbox)) as [number, number]);
    expect(temaHit[0]!.source).toMatchObject({ kind: 'attr', name: 'tema' });
    const src = temaHit[0]!.source as { start: number };
    expect('Retos del planeta').toContain(md[src.start]!);
    expect(temaHit[1]).toMatchObject({ level: 'design', id: 'cp0:decoration:tema', source: { kind: 'config', path: '/pageTemplates/0/decoration/elements/2' } });
    expect(temaHit[2]).toMatchObject({ level: 'slot', source: { kind: 'config', path: '/pageTemplates/0/decoration' } });
    expect(temaHit[3]!.level).toBe('template');

    // The picture of the band, picked by `{attr.fondo}`: the attribute, the
    // resource, the element. Probed off the white card and the frames.
    const fondo = deco.find((b) => b.elementId === 'fondo')!;
    const corner = sourceAt(doc, page.index, fondo.bbox.x + 5, fondo.bbox.y + 5);
    expect(levels(corner)).toEqual(['attr', 'resource', 'design', 'slot', 'template']);
    expect(corner[0]!.source).toMatchObject({ kind: 'attr', name: 'fondo', start: page.composed!.attrSources.fondo!.sourceStart });
    expect(corner[1]!.source).toEqual({ kind: 'resource', resourceId: 'banda-tema' });
    const card = deco.find((b) => b.elementId === 'tarjeta')!;
    const cardHit = sourceAt(doc, page.index, card.bbox.x + 2, card.bbox.y + card.bbox.height - 2);
    expect(cardHit[0]).toMatchObject({ level: 'design', id: 'cp0:decoration:tarjeta', source: { kind: 'config', path: '/pageTemplates/0/decoration/elements/1' } });

    const folio = page.footer!.blocks[0]!;
    const folioHit = sourceAt(doc, page.index, ...Object.values(centre(folio.bbox)) as [number, number]);
    expect(folioHit[0]).toMatchObject({ level: 'design', id: 'cp0:footer:folio', source: { kind: 'config', path: '/footer/elements/0' } });
    expect(folioHit[1]).toMatchObject({ level: 'slot', source: { kind: 'config', path: '/footer' } });
  });

  it('a picture in a frame answers with its resource', () => {
    const { doc } = page8('es');
    const page = composed(doc);
    const f = page.composed!.frames.find((x) => x.name === 'gasto-fotos')!;
    const pic = page.floats!.find((b) => b.id === f.blockIds[1])!;
    const chain = sourceAt(doc, page.index, ...Object.values(centre(pic.bbox)) as [number, number]);
    expect(chain[0]).toMatchObject({ level: 'resource', source: { kind: 'resource', resourceId: 'foto-gasto' } });
    expect(chain.find((e) => e.level === 'frame')!.id).toBe('cp0:gasto-fotos');
  });

  it('a group of frames stands between the frame and the template', () => {
    const tpl: PageTemplate = {
      id: 'g',
      frames: [{ name: 'a', flow: true, width: mm(80) }, { name: 'b', width: mm(80), placement: { anchor: { to: '#a', edge: 'below' } } }],
      groups: [{ name: 'col', frames: ['a', 'b'] }],
    } as never;
    const doc = buildDocument({ markdown: '::::page{template="g"}\nFirst words.\n\n:::frame{slot="b"}\nSecond.\n:::\n::::' }, { ...PAGE, pageTemplates: [tpl] }, createMeasurementCache());
    const page = composed(doc);
    const b = page.floats!.find((x) => x.id === 'cp0:b-c0')!;
    const chain = sourceAt(doc, page.index, b.lines[0]!.bbox.x + 2, b.lines[0]!.bbox.y + 2);
    expect(levels(chain)).toEqual(['text', 'line', 'block', 'frame', 'group', 'template']);
    expect(chain[4]).toMatchObject({ id: 'cp0:group:col', source: { kind: 'config', path: '/pageTemplates/0/groups/0' } });
  });

  it('a turned frame is hit in its own upright box', () => {
    const tpl: PageTemplate = { id: 'r', frames: [{ name: 'a', flow: true, width: mm(60), rotate: 90, placement: { anchor: { to: 'container', edge: 'center' } } }] } as never;
    const doc = buildDocument({ markdown: '::::page{template="r"}\nTurned words here.\n::::' }, { ...PAGE, pageTemplates: [tpl] }, createMeasurementCache());
    const page = composed(doc);
    const f = page.composed!.frames[0]!;
    const line = page.floats!.find((x) => x.id === 'cp0:a-c0')!.lines[0]!;
    // The line's first glyph, turned a quarter clockwise about the frame's centre.
    const cx = f.rect.x + f.rect.width / 2;
    const cy = f.rect.y + f.rect.height / 2;
    const ux = line.bbox.x + 3 - cx;
    const uy = line.bbox.y + line.bbox.height / 2 - cy;
    const chain = sourceAt(doc, page.index, cx - uy, cy + ux);
    expect(chain[0]).toMatchObject({ level: 'text' });
    expect(chain.find((e) => e.level === 'frame')).toMatchObject({ id: 'cp0:a', rotate: 90 });
  });

  it('`{attr.x}` in a composed page’s running head maps to the page fence', () => {
    const md = '::::page{template="h" tema="Savings"}\nText.\n::::';
    const doc = buildDocument({ markdown: md }, { ...PAGE, pageTemplates: [{ id: 'h', frames: [{ name: 'f', flow: true }] }], header: { elements: [{ kind: 'text', id: 'x', content: '{attr.tema}', placement: { anchor: { to: 'container', edge: 'top-left' } } }] } as never }, createMeasurementCache());
    const page = composed(doc);
    const head = page.header!.blocks[0]!;
    const chain = sourceAt(doc, page.index, head.bbox.x + 2, head.bbox.y + head.bbox.height / 2);
    expect(chain[0]!.source).toMatchObject({ kind: 'attr', name: 'tema' });
    const s = chain[0]!.source as { start: number };
    expect(md[s.start]).toBe('S');
    expect(chain[1]).toMatchObject({ level: 'design', id: 'cp0:header:x', source: { kind: 'config', path: '/header/elements/0' } });
  });

  it('names the file the host gives', () => {
    const { doc } = page8('es');
    const page = composed(doc);
    const f = page.composed!.frames.find((x) => x.name === 'texto')!;
    const chain = sourceAt(doc, page.index, f.rect.x + 30, f.rect.y + 30, { file: 'tema-1.md' });
    expect(chain[0]!.source).toMatchObject({ file: 'tema-1.md' });
  });
});

describe('the reverse: what a range of the Markdown became (#857)', () => {
  it('a word finds its line, paragraph, frame and composed page', () => {
    const { md, doc } = page8('es');
    const at = md.indexOf('instrumento') >= 0 ? md.indexOf('instrumento') : md.indexOf('trabajo por');
    const hits = elementsForSource(doc, at, at + 7);
    const ids = hits.map((h) => `${h.element.level}:${h.element.id}`);
    expect(ids).toContain('template:cp0');
    expect(ids).toContain('frame:cp0:dinero');
    expect(ids).toContain('block:cp0:dinero-c0');
    expect(ids.some((i) => i.startsWith('line:cp0:dinero-c0:l'))).toBe(true);
    expect(hits.every((h) => h.pageIndex === 0)).toBe(true);
  });

  it('an attribute of the page fence finds the design text that shows it', () => {
    const { md, doc } = page8('es');
    const at = md.indexOf('Retos');
    const hits = elementsForSource(doc, at, at + 5);
    expect(hits.map((h) => h.element.id)).toContain('cp0:decoration:tema');
  });

  it('text laid past a frame’s foot stays in the source map, marked clipped', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    const md = `::::page{template="c"}\n${words}\n::::`;
    const doc = buildDocument({ markdown: md }, { ...PAGE, pageTemplates: [{ id: 'c', frames: [{ name: 'a', flow: true, width: mm(40), height: mm(20) }] } as never] }, createMeasurementCache());
    const at = md.indexOf('word199');
    const hits = elementsForSource(doc, at, at + 7);
    expect(hits.some((h) => h.element.level === 'line' && h.element.clipped)).toBe(true);
  });

  it('finds an element by its stable id', () => {
    const { doc } = page8('es');
    expect(findElement(doc, 'cp0:gasto')!.element).toMatchObject({ level: 'frame', source: { path: '/pageTemplates/0/frames/4' } });
    expect(findElement(doc, 'cp0')!.element.level).toBe('template');
    expect(findElement(doc, 'cp0:decoration:tema')!.element.level).toBe('design');
    expect(findElement(doc, 'cp0:ahorro-c0')!.element.level).toBe('block');
    expect(findElement(doc, 'cp9:nothing')).toBeUndefined();
  });
});

describe('stable ids (#857)', () => {
  const ids = (doc: VDTDocument): string[] => {
    const page = composed(doc);
    return [
      ...page.composed!.frames.flatMap((f) => [f.id, ...f.blockIds]),
      ...(page.composed!.decoration?.blocks ?? []).map((b) => b.elementId ?? ''),
    ];
  };

  it('are the same in both locales of the stand-in', () => {
    expect(ids(page8('en').doc)).toEqual(ids(page8('es').doc));
  });

  it('survive a relayout after an edit inside a frame and before the page', () => {
    const before = ids(page8('es').doc);
    expect(ids(page8('es', (m) => m.replace('El dinero nos deja', 'El dinero, que cuesta ganar, nos deja')).doc)).toEqual(before);
    expect(ids(page8('es', (m) => `---\ntitle: Tema 1\n---\n${m}`).doc)).toEqual(before);
  });

  it('a label of a figure on a composed page takes its id and anchor', () => {
    const md = '::::page{template="t"}\n:::frame{slot="mapa"}\n:::figure{resource="europa"}\n::label[Madrid]{at="madrid"}\n::label[Mar]{at="62% 48%"}\n:::\n:::\n::::';
    const blocks = parseMarkdown(md);
    const fig = blocks.find((b) => b.figure)!;
    expect(fig.figure!.labels.map((l) => [l.id, l.anchorRef])).toEqual([
      ['cp0:mapa:label:madrid', 'europa#madrid'],
      ['cp0:mapa:label:@1', undefined],
    ]);
    // Outside a composed page: the anchor, no id.
    const flow = parseMarkdown(':::figure{resource="europa"}\n::label[Madrid]{at="madrid"}\n:::').find((b) => b.figure)!;
    expect(flow.figure!.labels[0]).toMatchObject({ anchorRef: 'europa#madrid' });
    expect(flow.figure!.labels[0]!.id).toBeUndefined();
  });
});

describe('contents entries point at their headings (#857)', () => {
  it('stamps the heading’s body offset on each entry', () => {
    const md = '# Contents\n\n:::toc\n\n# One\n\nText.\n\n# Two\n\nMore.';
    const doc = buildDocument({ markdown: md }, PAGE, createMeasurementCache());
    const entries = doc.blocks.filter((b) => b.tocEntry);
    const sources = entries.map((b) => b.tocEntry!.headingSource);
    expect(sources).toContain(md.indexOf('# One'));
    expect(sources).toContain(md.indexOf('# Two'));
    const one = entries.find((b) => b.tocEntry!.headingSource === md.indexOf('# One'))!;
    const chain = sourceAt(doc, one.pageIndex, one.bbox.x + 2, one.bbox.y + one.bbox.height / 2);
    expect(chain.find((e) => e.level === 'block')!.heading).toBe(md.indexOf('# One'));
  });
});

describe('figure labels in the source map (#857)', () => {
  const resources = [{ id: 'mapa', typeId: 'figure', kind: 'bitmap', caption: '', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'm.png', format: 'png', width: 100, height: 80 } } as never];
  const md = '---\ntitle: Mapas\n---\n::::page{template="m"}\n:::frame{slot="pic"}\n:::figure{resource="mapa"}\n::label[Madrid]{at="madrid"}\n::label[Mar]{at="62% 48%"}\n:::\n:::\n::::';
  const cfg = { ...PAGE, pageTemplates: [{ id: 'm', frames: [{ name: 'pic', flow: true, width: mm(100) }] }] } as PostextConfig;
  const laid = () => {
    const doc = buildDocument({ markdown: md, resources }, cfg, createMeasurementCache());
    const page = composed(doc);
    const pic = page.floats!.find((b) => b.resourceBlock)!;
    return { doc, page, pic };
  };

  it('each label carries its id, its anchor and the source of each character, in the chapter file', () => {
    const { pic } = laid();
    const labels = pic.resourceBlock!.labels!;
    expect(labels.map((l) => [l.id, l.anchorRef])).toEqual([['cp0:pic:label:madrid', 'mapa#madrid'], ['cp0:pic:label:@1', undefined]]);
    // Front matter counted: the offsets are the file's.
    expect(md.slice(labels[0]!.sourceStart, labels[0]!.sourceEnd)).toBe('Madrid');
    expect(labels[0]!.sourceMap!.map((o) => md[o]).join('')).toBe('Madrid');
  });

  it('a point on a laid label answers with its glyph, the label at its anchor, the picture and the frame', () => {
    const { doc, page, pic } = laid();
    // Where P6 (#860) will set the label: given here by hand.
    const label = pic.resourceBlock!.labels![0]!;
    label.rect = { x: pic.bbox.x + 10, y: pic.bbox.y + 10, width: 60, height: 20 };
    const chain = sourceAt(doc, page.index, pic.bbox.x + 11, pic.bbox.y + 20);
    expect(levels(chain).slice(0, 3)).toEqual(['text', 'label', 'resource']);
    expect(md[(chain[0]!.source as { start: number }).start]).toBe('M');
    expect(chain[1]).toMatchObject({ id: 'cp0:pic:label:madrid', source: { kind: 'resource', resourceId: 'mapa', anchor: 'madrid' } });
    expect(chain.find((e) => e.level === 'frame')!.id).toBe('cp0:pic');
    // Off the label, the picture.
    expect(sourceAt(doc, page.index, pic.bbox.x + pic.bbox.width - 2, pic.bbox.y + pic.bbox.height - 2)[0]!.level).toBe('resource');
  });

  it('the label’s text finds the label; its id finds it again', () => {
    const { doc } = laid();
    const at = md.indexOf('Madrid');
    expect(elementsForSource(doc, at, at + 3).map((h) => `${h.element.level}:${h.element.id}`)).toContain('label:cp0:pic:label:madrid');
    expect(findElement(doc, 'cp0:pic:label:madrid')!.element).toMatchObject({ level: 'label', source: { kind: 'resource', resourceId: 'mapa', anchor: 'madrid' } });
  });
});

describe('spreads in the source map (#857, #861)', () => {
  const tpl: PageTemplate = {
    id: 'tl', spread: true, gutter: mm(10), grid: { columns: 4, rows: 4, columnGap: mm(12) },
    frames: [{ name: 'band', crossGutter: true, grid: { col: 1, row: 1, cols: 4 } }, { name: 'left', grid: { col: 1, row: 2 } }],
  } as never;
  const md = ['::::page{template="tl" spread}', ':::frame{slot="band"}', 'Band across the spine with words enough to reach the other page of the sheet', ':::', '', ':::frame{slot="left"}', 'Left card', ':::', '::::'].join('\n');
  const doc = () => buildDocument({ markdown: md }, { ...PAGE, pageTemplates: [tpl] }, createMeasurementCache());

  it('the half of a frame on the facing page answers with the blocks it shows, flagged facing', () => {
    const d = doc();
    const pages = d.pages.filter((p) => p.composed?.spread);
    const facingPage = pages.find((p) => p.composed!.frames.some((f) => f.facingBlocks?.length))!;
    const half = facingPage.composed!.frames.find((f) => f.facingBlocks?.length)!;
    const para = half.facingBlocks!.find((b) => b.type !== 'callout' && b.lines.length > 0)!;
    const line = para.lines[0]!;
    // A point of that line inside the page's part of the sheet.
    const clip = facingPage.composed!.sheetClip!;
    const x = Math.max(line.bbox.x, clip.x) + 3;
    const chain = sourceAt(d, facingPage.index, x, line.bbox.y + line.bbox.height / 2);
    expect(chain[0]).toMatchObject({ level: 'text', facing: true });
    const block = chain.find((e) => e.level === 'block')!;
    expect(block.id.endsWith('-facing')).toBe(false);
    expect(d.blocks.some((b) => b.id === block.id)).toBe(true);
    expect(chain.find((e) => e.level === 'frame')!.id).toBe('cp0:band');
    // The band's words are found on both pages of the sheet.
    const at = md.indexOf('Band');
    const hits = elementsForSource(d, at, at + 4).filter((h) => h.element.level === 'block');
    expect(new Set(hits.map((h) => h.pageIndex)).size).toBe(2);
    expect(hits.some((h) => h.element.facing)).toBe(true);
  });

  it('a frame across the spine is found again by a click on the part each page paints (#877)', () => {
    // A band that starts near the spine on the verso and runs over the recto: most of its box
    // is on the recto, so a point of its whole box on the verso falls off the page.
    const banded: PageTemplate = {
      id: 'tl', spread: true, gutter: mm(10), grid: { columns: 2, rows: 4, columnGap: mm(30) },
      frames: [
        { name: 'left', grid: { col: 1, row: 1 } },
        { name: 'band', crossGutter: true, width: 'fill', height: mm(9), padding: { left: mm(40) },
          placement: { anchor: { to: '#left', edge: 'right-of' } } },
      ],
    } as never;
    const src = ['::::page{template="tl" spread}', ':::frame{slot="left"}', 'Left', ':::', '', ':::frame{slot="band"}', 'Words on the recto', ':::', '::::'].join('\n');
    const d = buildDocument({ markdown: src }, { ...PAGE, pageTemplates: [banded] }, createMeasurementCache());
    const at = src.indexOf('Words');
    const frames = elementsForSource(d, at, at + 5).filter((h) => h.element.level === 'frame' && h.element.id === 'cp0:band');
    expect(frames.length).toBe(2);
    for (const { pageIndex, element } of frames) {
      const page = d.pages[pageIndex]!;
      const clip = page.composed!.sheetClip!;
      const r = element.rect!;
      expect(r.x).toBeGreaterThanOrEqual(clip.x - 0.01);
      expect(r.x + r.width).toBeLessThanOrEqual(clip.x + clip.width + 0.01);
      const c = centre(r);
      expect(sourceAt(d, pageIndex, c.x, c.y).find((e) => e.level === 'frame')?.id).toBe('cp0:band');
    }
  });

  it('a spread is laid out afresh each time: no layout key', () => {
    expect(doc().pages.filter((p) => p.composed?.spread).every((p) => p.composed!.layoutKey === undefined)).toBe(true);
  });
});

describe('sourceAt on composed pages set through a flow frame (#929)', () => {
  // A title frame at the template's top-left (the right of a right-to-left page, the
  // top right of a vertical one), a body frame under it, and a band of decoration on the
  // sheet's left edge, which stays where the template puts it on the sheet.
  const t: PageTemplate = {
    id: 'sheet',
    frames: [
      { name: 'title', takes: 'h1', width: mm(80), placement: { anchor: { to: 'container', edge: 'top-left' } } },
      { name: 'body', flow: true, width: mm(80), height: mm(60), placement: { anchor: { to: '#title', edge: 'below' } } },
    ],
    decoration: { elements: [{ kind: 'box', id: 'band', style: { backgroundColor: { hex: '#1d5f73', model: 'hex' } },
      placement: { anchor: { to: 'bleed', edge: 'top-left' }, size: { width: mm(12), height: 'fill' } } }] } as never,
  };
  const md = '::::page{template="sheet"}\n# A title\n\nWords in the body frame, a line or two of them.\n::::\n';
  const cases = [
    ['right to left', { direction: 'rtl' }],
    ['vertical', { locale: 'ja', layout: { layoutType: 'single', writingMode: 'vertical-rl' } }],
  ] as const;
  for (const [name, extra] of cases) {
    it(`${name}: a sheet point on a frame's words picks them, the decoration stays on the sheet`, () => {
      const d = buildDocument({ markdown: md }, { ...PAGE, ...extra, pageTemplates: [t] } as PostextConfig, createMeasurementCache());
      const page = composed(d);
      expect(page.flow).toBeDefined();
      const body = frameBlocks(page).find((b) => b.type !== 'callout' && b.lines.length > 0 && b.type !== 'heading')!;
      const line = body.lines[0]!;
      const flowPoint = { x: line.bbox.x + 3, y: line.bbox.y + line.bbox.height / 2 };
      const sheet = flowToPage(page, flowPoint.x, flowPoint.y);
      const chain = sourceAt(d, page.index, sheet.x, sheet.y);
      expect(levels(chain).slice(0, 4)).toEqual(['text', 'line', 'block', 'frame']);
      expect(chain.find((e) => e.level === 'frame')!.id).toBe('cp0:body');
      // Boxes in the flow frame say so; the template has none of its own.
      expect(chain.filter((e) => e.level !== 'template').every((e) => e.flow === true)).toBe(true);
      expect(chain.find((e) => e.level === 'template')!.flow).toBeUndefined();
      // The line's own box, put on the sheet, holds the point clicked.
      const r = flowRectToPage(page, chain.find((e) => e.level === 'line')!.rect!);
      expect(sheet.x).toBeGreaterThanOrEqual(r.x - 0.01);
      expect(sheet.x).toBeLessThanOrEqual(r.x + r.width + 0.01);
      // The band of decoration, at the sheet's left edge.
      const band = page.composed!.decoration!.blocks.find((b) => b.elementId === 'band')!;
      const onBand = sourceAt(d, page.index, band.bbox.x + 2, band.bbox.y + band.bbox.height / 2);
      expect(onBand[0]!.level).toBe('design');
      expect(onBand[0]!.flow).toBeUndefined();
      // The reverse map flags the same boxes, and its frame comes back from the sheet.
      const at = md.indexOf('Words');
      const frame = elementsForSource(d, at, at + 5).find((m) => m.element.level === 'frame')!.element;
      expect(frame.flow).toBe(true);
      const c = flowToPage(page, frame.rect!.x + frame.rect!.width / 2, frame.rect!.y + 4);
      expect(sourceAt(d, page.index, c.x, c.y).find((e) => e.level === 'frame')?.id).toBe('cp0:body');
      expect(findElement(d, 'cp0:body')!.element.flow).toBe(true);
    });
  }

  it('left to right: nothing is flagged', () => {
    const d = buildDocument({ markdown: md }, { ...PAGE, pageTemplates: [t] } as PostextConfig, createMeasurementCache());
    const page = composed(d);
    const body = frameBlocks(page).find((b) => b.type !== 'callout' && b.lines.length > 0 && b.type !== 'heading')!;
    const line = body.lines[0]!;
    const chain = sourceAt(d, page.index, line.bbox.x + 3, line.bbox.y + line.bbox.height / 2);
    expect(levels(chain).slice(0, 4)).toEqual(['text', 'line', 'block', 'frame']);
    expect(chain.some((e) => e.flow)).toBe(false);
  });
});

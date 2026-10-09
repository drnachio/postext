import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { measureBlock, measureRichBlock, type MeasureBlockOptions } from '../../measure';
import { migrateConfig, migrateBundleConfig, pinLegacyRaggedBreaking, CONFIG_VERSION } from '../../bundle/configVersion';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../defaults/bodyText';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTLine } from '../../vdt';

// EF-147: ragged text was always set line by line, so `avoidRunts`,
// `runtPenalty`, `tightenRunts` and `optimalLineBreaking` did nothing for it.
// `bodyText.optimalRagged` (default true, pinned false for configurations
// stored before rules 7 that set text ragged) breaks ragged running text
// with Knuth–Plass, in a ragged cost model.

// Deterministic stub: every character, the space included, is 7 px wide;
// bold 8 px.
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
const pt = (value: number) => ({ value, unit: 'pt' as const });

// The recipe's paragraph (accessible-tagged-pdf).
const COMPOST = 'Restos de comida, crudos o cocinados: mondas de fruta, cáscaras de huevo, espinas, posos de café e infusiones, tapones de corcho y papel de cocina sucio. Usa bolsas compostables, con la marca de la norma UNE-EN 13432: el plástico no se descompone y hay que retirarlo a mano en la planta.';

function config(width: number, bodyText: PostextConfig['bodyText'] = {}, extra: PostextConfig = {}): PostextConfig {
  return {
    locale: 'es',
    page: { width: mm(width), height: mm(800), dpi: 96, margins: { top: mm(5), bottom: mm(5), left: mm(5), right: mm(5) } },
    layout: { layoutType: 'single' },
    ...extra,
    bodyText: { fontSize: pt(10.5), lineHeight: pt(15.5), textAlign: 'left', firstLineIndent: mm(0), hyphenation: { enabled: false }, ...bodyText },
    header: { elements: [] },
    footer: { elements: [] },
  };
}

const blocksOf = (markdown: string, cfg: PostextConfig): VDTBlock[] => buildDocument({ markdown }, cfg).blocks;
const linesOf = (markdown: string, cfg: PostextConfig): VDTLine[] => blocksOf(markdown, cfg).flatMap((b) => b.lines);
const texts = (ls: readonly VDTLine[]): string[] => ls.map((l) => l.text);

/** Lines of a block, one array per paragraph. */
const paragraphs = (markdown: string, cfg: PostextConfig): string[][] =>
  blocksOf(markdown, cfg).filter((b) => b.type === 'paragraph').map((b) => texts(b.lines));

/** The runt threshold of the body in this stub: 20 word spaces of 7 px. */
const RUNT_PX = 20 * 7;
const isRunt = (ls: readonly VDTLine[]): boolean => ls.length > 1 && ls[ls.length - 1]!.bbox.width < RUNT_PX;

describe('ragged text broken with Knuth–Plass (EF-147)', () => {
  it('avoids the runts the line-by-line breaker left', () => {
    let before = 0;
    let after = 0;
    for (let width = 60; width <= 110; width += 1) {
      const greedy = linesOf(COMPOST, config(width, { optimalRagged: false }));
      const optimal = linesOf(COMPOST, config(width));
      if (isRunt(greedy)) before++;
      if (isRunt(optimal)) after++;
      // Never longer than first-fit by more than the line a runt fix takes.
      expect(optimal.length).toBeLessThanOrEqual(greedy.length + 1);
    }
    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  it('keeps every line within its measure, word spaces at their width', () => {
    const space = linesOf('a b', config(80, { optimalRagged: false }))[0]!.segments!.find((seg) => seg.kind === 'space')!.width;
    for (let width = 50; width <= 110; width += 3) {
      const cfg = config(width);
      const measure = buildDocument({ markdown: COMPOST }, cfg).pages[0]!.columns[0]!.bbox.width;
      for (const block of blocksOf(COMPOST, cfg)) {
        for (const line of block.lines) {
          expect(line.bbox.width).toBeLessThanOrEqual(measure + 0.5);
          expect(line.justifiedSpaceRatio).toBeUndefined();
          // The word space, plus the tracking a runt fix gave the block.
          for (const seg of line.segments ?? []) {
            if (seg.kind === 'space') expect(seg.width).toBeCloseTo(space + (block.letterSpacing ?? 0), 6);
          }
        }
      }
    }
  });

  it('sets ragged text line by line with optimalRagged or optimalLineBreaking off, as 1.4 did', () => {
    for (let width = 60; width <= 110; width += 5) {
      const off = texts(linesOf(COMPOST, config(width, { optimalRagged: false })));
      expect(texts(linesOf(COMPOST, config(width, { optimalLineBreaking: false })))).toEqual(off);
    }
  });

  it('takes the configuration’s name in the measuring API', () => {
    // `MeasureBlockOptions.optimalRagged`, as `BodyTextConfig.optimalRagged`:
    // a host that measures a paragraph itself spells it the same way.
    const font = '14px Test';
    const on: MeasureBlockOptions = { textAlign: 'left', optimal: true, runtPenalty: 1000, runtMinCharacters: 20, optimalRagged: true };
    const off: MeasureBlockOptions = { ...on, optimalRagged: undefined };
    let differs = 0;
    for (let width = 200; width <= 420; width += 7) {
      const plain = (o: MeasureBlockOptions) => measureBlock(COMPOST, font, width, 20, o).lines.map((l) => l.text);
      const rich = (o: MeasureBlockOptions) => measureRichBlock([{ text: COMPOST, bold: false, italic: false }], font, font, font, font, width, 20, o).lines.map((l) => l.text.trimEnd());
      if (plain(on).join('|') !== plain(off).join('|')) differs++;
      // The two paths read the option alike.
      expect(rich(on), `${width} px`).toEqual(plain(on).map((t) => t.trimEnd()));
    }
    expect(differs).toBeGreaterThan(0);
  });

  it('leaves justified text and headings alone', () => {
    const md = `# ${COMPOST.slice(0, 120)}\n\n${COMPOST}`;
    for (let width = 60; width <= 110; width += 10) {
      const justified = (optimalRagged: boolean) => texts(linesOf(md, config(width, { textAlign: 'justify', optimalRagged })));
      expect(justified(true)).toEqual(justified(false));
      const heading = (optimalRagged: boolean) => texts(blocksOf(md, config(width, { optimalRagged })).find((b) => b.type === 'heading')!.lines);
      expect(heading(true)).toEqual(heading(false));
    }
  });

  it('reaches ragged paragraph styles and box bodies in a justified book', () => {
    const md = `:::paragraphs{style="ragged"}\n${COMPOST}\n:::\n\n:::callout{type="note"}\n${COMPOST}\n:::`;
    const extra: PostextConfig = {
      paragraphStyles: [{ id: 'ragged', name: 'Ragged', textAlign: 'left' }],
      calloutStyles: [{ id: 'note', body: { textAlign: 'left' } }],
    };
    let differs = 0;
    for (let width = 60; width <= 110; width += 2) {
      const on = paragraphs(md, config(width, { textAlign: 'justify' }, extra));
      const off = paragraphs(md, config(width, { textAlign: 'justify', optimalRagged: false }, extra));
      if (JSON.stringify(on) !== JSON.stringify(off)) differs++;
    }
    expect(differs).toBeGreaterThan(0);
  });

  it('breaks after the hyphens the text carries, with or without formatting, as line by line', () => {
    // A plain paragraph goes through pretext's segments, a formatted one
    // through the rich tokens: both may end a line on "enseñanza-", as the
    // line-by-line breaker could.
    const COMPOUNDS = 'La relación enseñanza-aprendizaje y el análisis coste-beneficio del modelo político-económico: un estudio teórico-práctico de la frontera franco-alemana, con datos físico-químicos y socio-culturales del eje norte-sur.';
    let plainEnds = 0;
    let greedyEnds = 0;
    for (let width = 40; width <= 100; width += 1) {
      const plain = linesOf(COMPOUNDS, config(width));
      // The stub sets italics as wide as roman: the same measure, the rich
      // path.
      const rich = linesOf(COMPOUNDS.replace('frontera', '*frontera*'), config(width));
      expect(texts(plain), `${width} mm`).toEqual(texts(rich));
      plain.forEach((line, i) => {
        if (i === plain.length - 1 || !/\p{L}-$/u.test(line.text)) return;
        plainEnds++;
        expect(line.hyphenated).toBe(true);
        expect(line.hardHyphen).toBe(true);
      });
      const greedy = linesOf(COMPOUNDS, config(width, { optimalRagged: false }));
      greedyEnds += greedy.filter((l, i) => i < greedy.length - 1 && /\p{L}-$/u.test(l.text)).length;
    }
    expect(greedyEnds).toBeGreaterThan(0);
    expect(plainEnds).toBeGreaterThan(0);
  });

  it('keeps the hyphenation zone of ragged text', () => {
    // A zone wider than the measure: no word is divided.
    for (let width = 40; width <= 90; width += 5) {
      const ls = linesOf(COMPOST, config(width, { hyphenation: { enabled: true, ragged: true, zone: { value: 60, unit: 'em' } } }));
      expect(ls.filter((l, i) => i < ls.length - 1 && /\p{L}-$/u.test(l.text) && !l.hardHyphen)).toEqual([]);
    }
  });
});

describe('optimalRagged in the configuration', () => {
  it('defaults to true and strips as a default', () => {
    expect(resolveBodyTextConfig().optimalRagged).toBe(true);
    expect(resolveBodyTextConfig({ optimalRagged: false }).optimalRagged).toBe(false);
    expect(stripBodyTextDefaults({ optimalRagged: true })).toBeUndefined();
    expect(stripBodyTextDefaults({ optimalRagged: false })).toEqual({ optimalRagged: false });
  });

  it('is pinned off for configurations stored before rules 7 that set running text ragged', () => {
    expect(CONFIG_VERSION).toBe(11);
    const ragged: PostextConfig = { bodyText: { textAlign: 'left' } };
    for (const version of [undefined, 3, 5, 6]) {
      expect(migrateConfig(ragged, version, { content: 'Text.' }).bodyText, `${version}`).toEqual({ textAlign: 'left', optimalRagged: false });
    }
    // A ragged paragraph style, box body, part body or HTML viewer override.
    for (const cfg of [
      { paragraphStyles: [{ id: 'p', name: 'P', textAlign: 'center' as const }] },
      { calloutStyles: [{ id: 'c', body: { textAlign: 'left' as const } }] },
      { parts: { bodyStyle: { textAlign: 'right' as const } } },
      { htmlViewer: { overrides: { bodyText: { textAlign: 'left' as const } } } },
      // The body of a section style, in the book or the HTML viewer.
      { headingStyles: [{ id: 's', bodyStyle: { textAlign: 'left' as const } }] },
      { htmlViewer: { overrides: { headingStyles: [{ id: 's', bodyStyle: { textAlign: 'center' as const } }] } } },
    ] as PostextConfig[]) {
      expect(migrateConfig(cfg, 6, { content: 'Text.' }).bodyText?.optimalRagged, JSON.stringify(cfg)).toBe(false);
    }
    // Justified throughout, today's rules, optimal breaking off, or a named
    // value: as it is.
    const justified: PostextConfig = {
      bodyText: { textAlign: 'justify' },
      paragraphStyles: [{ id: 'p', name: 'P' }],
      headings: { textAlign: 'left' },
      headingStyles: [{ id: 's', bodyStyle: { textAlign: 'justify' } }],
    };
    expect(migrateConfig(justified, 6, { content: 'Text.' })).toBe(justified);
    expect(migrateConfig(ragged, CONFIG_VERSION, { content: 'Text.' })).toBe(ragged);
    const greedy: PostextConfig = { bodyText: { textAlign: 'left', optimalLineBreaking: false } };
    expect(migrateConfig(greedy, undefined, { content: 'Text.' })).toBe(greedy);
    const named: PostextConfig = { bodyText: { textAlign: 'left', optimalRagged: true } };
    expect(pinLegacyRaggedBreaking(named)).toBe(named);
    // The bundle reader pins the `bodyText` the layers leave in force.
    expect(migrateBundleConfig({ bodyText: { fontFamily: 'Base' } }, [{ paragraphStyles: [{ id: 'p', name: 'P', textAlign: 'left' }] }], undefined, { content: ['Text.'] }).bodyText)
      .toEqual({ fontFamily: 'Base', optimalRagged: false });
  });

  it('keeps a section style’s ragged body as 1.4 set it once pinned', () => {
    const md = `# Prefacio {style="preface"}\n\n${COMPOST}`;
    const stored = (width: number): PostextConfig => config(width, { textAlign: 'justify' }, {
      headingStyles: [{ id: 'preface', bodyStyle: { textAlign: 'left' } }],
    });
    let differs = 0;
    for (let width = 60; width <= 110; width += 2) {
      const pinned = migrateConfig(stored(width), undefined, { content: md });
      expect(pinned.bodyText?.optimalRagged).toBe(false);
      // The section's paragraph, set line by line.
      const old = paragraphs(md, { ...stored(width), bodyText: { ...stored(width).bodyText, optimalLineBreaking: false } });
      expect(paragraphs(md, pinned)).toEqual(old);
      if (JSON.stringify(paragraphs(md, stored(width))) !== JSON.stringify(old)) differs++;
    }
    expect(differs).toBeGreaterThan(0);
  });

  it('lays a pinned book out as 1.4 did', () => {
    for (let width = 60; width <= 110; width += 5) {
      const stored = config(width);
      const pinned = migrateConfig(stored, undefined, { content: COMPOST });
      expect(texts(linesOf(COMPOST, pinned))).toEqual(texts(linesOf(COMPOST, config(width, { optimalLineBreaking: false }))));
    }
  });
});

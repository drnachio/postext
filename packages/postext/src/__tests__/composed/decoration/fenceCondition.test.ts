import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { collectConfigWarnings } from '../../../checks/configWarnings.js';
import { stripPageTemplatesDefaults } from '../../../composed/templates.js';
import { sourceAt } from '../../../composed/sourceMap.js';
import {
  fenceAttributesSet,
  fenceConditionMet,
  fenceConditionUses,
  fenceConditionsNeverMet,
  fenceSetsAttribute,
} from '../../../design/fenceCondition.js';
import type { DesignElement, PageTemplate, PostextConfig, VDTDesignTextBlock, VDTDocument, VDTPage } from '../../../index.js';

// #1087: one page shell for every page. Decoration elements and the
// template's running heads carry `when` / `unless` on the page fence's
// attributes, so a front-matter page drops the folio and the band the body
// pages print.

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
const PAGE = {
  page: { width: mm(170), height: mm(240), dpi: 150, margins: { top: mm(20), bottom: mm(20), left: mm(18), right: mm(18) } },
} as unknown as PostextConfig;

const folio = (extra: Partial<DesignElement> = {}): DesignElement => ({
  kind: 'text', id: 'folio', content: '{pageNumber}',
  placement: { anchor: { to: 'page', edge: 'bottom-center' }, offset: { y: mm(-8) } },
  ...extra,
} as unknown as DesignElement);
const band = (extra: Partial<DesignElement> = {}): DesignElement => ({
  kind: 'box', id: 'band',
  placement: { anchor: { to: 'page', edge: 'top-left' }, size: { width: 'fill', height: mm(12) } },
  style: { backgroundColor: { hex: '#2a6f97' } },
  ...extra,
} as unknown as DesignElement);
// Hangs from the band: goes when the band goes.
const bandLabel: DesignElement = {
  kind: 'text', id: 'band-label', content: 'Unit',
  placement: { anchor: { to: '#band', edge: 'bottom-left' } },
} as unknown as DesignElement;
const runningHead: DesignElement = {
  kind: 'text', id: 'head', content: '{chapterTitle}', when: 'folio',
  placement: { anchor: { to: 'container', edge: 'top-right' } },
} as unknown as DesignElement;

const SHELL: PageTemplate = {
  id: 'shell',
  frames: [{ name: 'texto', flow: true }],
  decoration: { elements: [band({ unless: 'frontmatter' }), bandLabel, folio({ when: 'folio' })] },
  header: { elements: [runningHead] },
};

const MARKDOWN = [
  '# Invented chapter',
  '',
  '::::page{template="shell" frontmatter}',
  '',
  'A title page with no folio and no band.',
  '',
  '::::',
  '',
  '::::page{template="shell" folio}',
  '',
  'The first body page prints its folio and its band.',
  '',
  '::::',
  '',
  '::::page{template="shell" folio=false}',
  '',
  'A fence that writes false sets nothing.',
  '',
  '::::',
].join('\n');

function build(templates: PageTemplate[] = [SHELL], markdown = MARKDOWN): VDTDocument {
  return buildDocument({ markdown }, { ...PAGE, pageTemplates: templates } as PostextConfig, createMeasurementCache());
}

const composedPages = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.composed);
const decoIds = (page: VDTPage): string[] => (page.composed!.decoration?.blocks ?? []).map((b) => b.elementId ?? '').filter(Boolean);
const headText = (page: VDTPage): string[] => (page.header?.blocks ?? [])
  .filter((b): b is VDTDesignTextBlock => b.kind === 'text')
  .flatMap((b) => b.lines.map((l) => l.text));

describe('page fence conditions (#1087)', () => {
  it('reads an attribute as set when the fence writes it as a flag or with any value but false', () => {
    expect(fenceSetsAttribute({ folio: '' }, 'folio')).toBe(true);
    expect(fenceSetsAttribute({ folio: 'yes' }, 'folio')).toBe(true);
    expect(fenceSetsAttribute({ folio: 'False' }, 'folio')).toBe(false);
    expect(fenceSetsAttribute({}, 'folio')).toBe(false);
    expect(fenceSetsAttribute(undefined, 'folio')).toBe(false);
    // Not a key of Object.prototype.
    expect(fenceSetsAttribute({}, 'toString')).toBe(false);
    expect(fenceConditionMet({}, undefined)).toBe(true);
    expect(fenceConditionMet({ when: 'folio' }, undefined)).toBe(false);
    expect(fenceConditionMet({ unless: 'frontmatter' }, undefined)).toBe(true);
    expect(fenceConditionMet({ when: 'a', unless: 'b' }, { a: '', b: '' })).toBe(false);
    expect(fenceAttributesSet({ template: 'shell', folio: '', draft: 'false' })).toEqual(['template', 'folio']);
  });

  it('one shell: the front-matter page draws no band and no folio, the body page both', () => {
    const [front, body, off] = composedPages(build());
    expect(front && body && off).toBeTruthy();
    expect(decoIds(front!)).toEqual([]);
    expect(decoIds(body!)).toEqual(['band', 'band-label', 'folio']);
    // folio=false: no folio; no frontmatter: the band and what hangs from it.
    expect(decoIds(off!)).toEqual(['band', 'band-label']);
  });

  it('the template running head follows the same rule', () => {
    const [front, body, off] = composedPages(build());
    expect(headText(front!)).toEqual([]);
    expect(headText(body!)).toEqual(['Invented chapter']);
    expect(headText(off!)).toEqual([]);
  });

  it('the document running heads read it too: a page with no fence sets nothing', () => {
    const doc = buildDocument(
      { markdown: '# Plain\n\nFlow page.\n\n::::page{template="bare" frontmatter}\n\nFront.\n\n::::' },
      {
        ...PAGE,
        pageTemplates: [{ id: 'bare', frames: [{ name: 'texto', flow: true }] }],
        footer: { elements: [folio({ unless: 'frontmatter' }), { ...folio({ when: 'frontmatter' }), id: 'roman', content: 'front' } as DesignElement] },
      } as PostextConfig,
      createMeasurementCache(),
    );
    const plain = doc.pages.find((p) => !p.composed)!;
    const front = doc.pages.find((p) => p.composed)!;
    const footIds = (p: VDTPage) => (p.footer?.blocks ?? []).map((b) => b.elementId);
    expect(footIds(plain)).toEqual(['folio']);
    expect(footIds(front)).toEqual(['roman']);
  });

  it('elements without a condition draw as before (same blocks as a shell with none)', () => {
    const plain: PageTemplate = { ...SHELL, decoration: { elements: [band(), bandLabel, folio()] }, header: { elements: [{ ...runningHead, when: undefined } as DesignElement] } };
    const md = '# C\n\n::::page{template="shell" frontmatter}\n\nText.\n\n::::';
    const a = composedPages(build([plain], md))[0]!;
    expect(decoIds(a)).toEqual(['band', 'band-label', 'folio']);
    expect(headText(a)).toEqual(['C']);
  });

  it('the source map of a drawn element keeps its config path; nothing answers where an element is not drawn', () => {
    const doc = build();
    const [front, body] = composedPages(doc);
    const bandBlock = body!.composed!.decoration!.blocks.find((b) => b.elementId === 'band')!;
    const at = { x: bandBlock.bbox.x + bandBlock.bbox.width - 4, y: bandBlock.bbox.y + 2 };
    const paths = (pageIndex: number) => sourceAt(doc, pageIndex, at.x, at.y)
      .map((e) => (e.source.kind === 'config' ? e.source.path : undefined));
    expect(paths(body!.index)).toContain('/pageTemplates/0/decoration/elements/0');
    expect(paths(front!.index)).not.toContain('/pageTemplates/0/decoration/elements/0');
    // The folio keeps its own path (its index in the template, not among
    // the elements drawn).
    const folioBlock = body!.composed!.decoration!.blocks.find((b) => b.elementId === 'folio')!;
    expect(folioBlock.configPath).toBe('/pageTemplates/0/decoration/elements/2');
  });

  it('survives stripping and the extends chain', () => {
    expect(stripPageTemplatesDefaults([SHELL])![0]!.decoration!.elements[0]).toMatchObject({ unless: 'frontmatter' });
    const child: PageTemplate = { id: 'child', extends: 'shell' };
    const md = '::::page{template="child" frontmatter}\n\nText.\n\n::::';
    expect(decoIds(composedPages(build([SHELL, child], md))[0]!)).toEqual([]);
  });

  it('validation: a value that names no attribute, and a condition a heading design ignores', () => {
    const warnings = collectConfigWarnings({
      header: { elements: [folio({ when: 7 as never })] },
      pageTemplates: [{ ...SHELL, decoration: { elements: [band({ unless: '' })] } }],
      headingStyles: [{ id: 'h', advancedDesign: { slot: { elements: [folio({ when: 'folio' })] } } } as never],
    } as PostextConfig).filter((w) => w.kind === 'unknownConfigValue');
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'header.elements[0].when', value: '7', used: '' }),
      expect.objectContaining({ path: 'pageTemplates[0].decoration.elements[0].unless', value: '', used: '' }),
      expect.objectContaining({ path: 'headingStyles[0].advancedDesign.slot.elements[0].when', value: 'folio', used: '' }),
    ]));
    // The shell itself is clean.
    expect(collectConfigWarnings({ pageTemplates: [SHELL] } as PostextConfig).filter((w) => w.kind === 'unknownConfigValue' || w.kind === 'unknownConfigKey')).toEqual([]);
  });

  it('conditionNeverMet: the conditions on attributes no page sets', () => {
    const config = { pageTemplates: [SHELL] } as PostextConfig;
    expect(fenceConditionUses(config).map((u) => `${u.condition}:${u.attribute}`)).toEqual(['unless:frontmatter', 'when:folio', 'when:folio']);
    expect(fenceConditionsNeverMet(config, ['folio', 'frontmatter'])).toEqual([]);
    expect(fenceConditionsNeverMet(config, ['folio']).map((u) => u.path)).toEqual(['pageTemplates[0].decoration.elements[0].unless']);
  });
});

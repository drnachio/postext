import { describe, expect, it } from 'vitest';
import type { ColorValue, DesignElement, PostextConfig } from 'postext';
import { DEFAULT_LABELS } from '../types/defaultLabels';
import { findPaletteUsages, unlinkPaletteRefs } from './paletteUtils';

// EF-71: every palette-linked colour follows the palette — design slots,
// callout labels, `bodyText.referenceColor`… — so deleting an entry must
// find, and unlink, every one of them, not only the fields the palette
// section listed by hand.

const accent = (hex = '#111111'): ColorValue => ({ hex, model: 'hex', paletteId: 'accent' });
const rule = (id: string): DesignElement => ({
  kind: 'rule', id, direction: 'horizontal', color: accent(), thickness: { value: 1, unit: 'pt' },
  placement: { anchor: { to: 'container', edge: 'top' } },
});
const config: PostextConfig = {
  colorPalette: [{ id: 'accent', name: 'Accent', value: { hex: '#00aa00', model: 'hex' } }],
  bodyText: { color: accent(), referenceColor: accent() },
  headings: { levels: [{ level: 2, color: accent() }] },
  header: { elements: [rule('r')] },
  calloutStyles: [{ id: 'note', label: { background: accent() } }],
};

const L = DEFAULT_LABELS;
const j = (...parts: string[]) => parts.join(' › ');

describe('palette entry usages', () => {
  it('lists every linked colour by the names the panels give it', () => {
    expect(findPaletteUsages(config, 'accent', L)).toEqual([
      L.bodyColor,
      L.bodyReferenceColor,
      j(L.headings, 'H2', L.headingColor),
      j(L.header, 'r', L.headerFooterElementColor),
      j(L.calloutStylesSection, 'note', L.calloutStyleLabelGroup, L.calloutStyleLabelBackground),
    ]);
    expect(findPaletteUsages(config, 'other', L)).toEqual([]);
  });

  it('names the colours of every section, style and design the panels edit (no config paths)', () => {
    const everywhere: PostextConfig = {
      page: { backgroundColor: accent(), cutLines: { color: accent() }, baselineGrid: { color: accent() } },
      layout: { columnRule: { color: accent() } },
      bodyText: { color: accent(), boldColor: accent(), italicColor: accent(), referenceColor: accent() },
      math: { color: accent() },
      headings: {
        color: accent(),
        levels: [{ level: 1, color: accent(), advancedDesign: { enabled: true, slot: { elements: [rule('opener-rule')] } } }],
      },
      unorderedLists: { color: accent(), taskCompletedColor: accent(), levels: [{ color: accent() }] },
      orderedLists: { color: accent(), separatorColor: accent(), levels: [{ color: accent(), separatorColor: accent() }] },
      tableStyle: {
        bodyColor: accent(), headerColor: accent(), headerBackground: accent(),
        bodyBackground: accent(), bodyAlternateBackground: accent(), borderColor: accent(),
      },
      tableStyles: [{ id: 'grid', bodyColor: accent(), borderColor: accent() }],
      captionStyle: { color: accent(), labelColor: accent(), background: accent(), note: { color: accent() } },
      resourceTypes: [{
        id: 'figure', name: 'Figure', shortLabel: 'Fig.', numberingTemplate: '{n}', resetOn: 'none',
        counterFormat: 'decimal', captionPrefix: 'Figure', captionStyle: { labelColor: accent() },
      }],
      diagramStyle: { inkColor: accent() },
      paragraphStyles: [{ id: 'quote', name: 'Quote', color: accent(), boldColor: accent() }],
      calloutStyles: [{
        id: 'note',
        background: accent(), border: { color: accent() }, stripe: { color: accent() }, icon: { color: accent() },
        marker: { color: accent(), rule: { color: accent() } },
        label: { color: accent(), background: accent(), rule: { color: accent() } },
        titleStyle: { color: accent() },
        body: { color: accent(), boldColor: accent(), italicColor: accent() },
        lists: { color: accent() },
      }],
      chipStyles: [{ id: 'tag', color: accent(), background: accent(), borderColor: accent() }],
      parts: {
        design: { elements: [rule('part-rule')] },
        versoDesign: { elements: [rule('verso-rule')] },
        bodyStyle: { color: accent(), bulletColor: accent(), numberColor: accent(), orderedLists: { color: accent() } },
      },
      headingStyles: [{
        id: 'preface', name: 'Preface', color: accent(),
        header: { elements: [rule('preface-head')] },
        advancedDesign: { enabled: true, slot: { elements: [rule('preface-opener')] } },
        layout: { columnRule: { color: accent() } },
        bodyStyle: { color: accent(), unorderedLists: { taskCompletedColor: accent() } },
      }],
      toc: {
        levels: [{ level: 1, color: accent(), numberColor: accent() }],
        unnumbered: { color: accent() },
        pageNumber: { color: accent() },
        subtitle: { color: accent() },
        parts: { design: { elements: [rule('toc-part-rule')] } },
      },
      header: {
        elements: [
          {
            kind: 'text', id: 'running-head', content: '{title}', color: accent(),
            dropCap: { color: accent() }, stroke: { width: { value: 0.2, unit: 'pt' }, color: accent() },
            box: { backgroundColor: accent(), borderColor: accent() },
            placement: { anchor: { to: 'container', edge: 'top' } },
          } as DesignElement,
        ],
      },
      footer: {
        elements: [{ kind: 'box', id: 'band', style: { backgroundColor: accent(), borderColor: accent() }, placement: { anchor: { to: 'container', edge: 'bottom' } } } as DesignElement],
      },
      debug: { cursorSync: { color: accent() }, selectionSync: { color: accent() }, looseLineHighlight: { color: accent() } },
      // A sparse fixture: only the colours matter here.
    } as unknown as PostextConfig;
    const usages = findPaletteUsages(everywhere, 'accent', L);
    // A config path would carry a dot or a bracket; the labels here do not.
    expect(usages.filter((u) => /[.[\]]/.test(u))).toEqual([]);
    expect(usages).toHaveLength(new Set(usages).size);
    expect(usages).toContain(j(L.tableStylesSection, 'grid', L.tableBorderColor));
    expect(usages).toContain(j(L.resourceTypesSection, 'Figure', L.captionLabelGroup, L.colorLabel));
    expect(usages).toContain(j(L.headings, 'H1', L.headingAdvancedDesign, 'opener-rule', L.headerFooterElementColor));
    expect(usages).toContain(j(L.headingStylesSection, 'Preface', L.header, 'preface-head', L.headerFooterElementColor));
    expect(usages).toContain(j(L.footer, 'band', L.headerFooterElementBoxBackgroundColor));
    expect(usages).toContain(L.debugLooseLinesColor);
  });

  it('lists a colour no panel shows by its path', () => {
    const odd = { bodyText: { color: accent() }, htmlViewer: { overrides: { bodyText: { color: accent() } } } } as PostextConfig;
    expect(findPaletteUsages(odd, 'accent', L)).toEqual([L.bodyColor, 'htmlViewer.overrides.bodyText.color']);
  });
});

describe('unlinking a palette entry', () => {
  it('unlinks every linked colour, frozen at the colour the entry gave it', () => {
    const out = unlinkPaletteRefs(config, 'accent');
    const plain = { hex: '#00aa00', model: 'hex' };
    expect(out.bodyText!.color).toEqual(plain);
    expect(out.bodyText!.referenceColor).toEqual(plain);
    expect(out.headings!.levels![0]!.color).toEqual(plain);
    expect((out.header!.elements[0] as { color: ColorValue }).color).toEqual(plain);
    expect(out.calloutStyles![0]!.label!.background).toEqual(plain);
    expect(findPaletteUsages(out, 'accent', L)).toEqual([]);
    // The palette itself is left for the caller to edit.
    expect(out.colorPalette).toBe(config.colorPalette);
  });

  it('keeps the stored colour when the entry is already gone, and leaves other links alone', () => {
    const other: ColorValue = { hex: '#222222', model: 'hex', paletteId: 'other' };
    const out = unlinkPaletteRefs({ bodyText: { color: accent('#333333'), boldColor: other } }, 'accent');
    expect(out.bodyText!.color).toEqual({ hex: '#333333', model: 'hex' });
    expect(out.bodyText!.boldColor).toBe(other);
  });
});

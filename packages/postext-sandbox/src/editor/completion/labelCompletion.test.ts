import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { Resource } from 'postext';
import { labelCompletionSource, type LabelCompletionContext } from './labelCompletion.js';

// #866: inside a figure, `at="…"` of a ::label offers the picture's anchors
// with the label style each one gives.

const MAP: Resource = {
  id: 'mapa', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'm.png', format: 'png', width: 400, height: 300 },
  anchors: [
    { id: 'albar', x: 0.2, y: 0.4, style: 'capital' },
    { id: 'puerto', x: 0.5, y: 0.4, style: 'ciudad' },
    { id: 'rio', x: 0.3, y: 0.5 },
  ],
};
const CTX: LabelCompletionContext = {
  resources: [MAP],
  labelStyles: [{ id: 'capital', name: 'Capital' }, { id: 'ciudad' }],
  words: { labelled: 'already labelled', noStyle: 'no label style', label: 'figure label' },
};

/** The completion at the `|` of `doc`. */
function complete(doc: string, ctx: LabelCompletionContext = CTX): CompletionResult | null {
  const pos = doc.indexOf('|');
  const state = EditorState.create({ doc: doc.slice(0, pos) + doc.slice(pos + 1) });
  return labelCompletionSource(() => ctx)(new CompletionContext(state, pos, true)) as CompletionResult | null;
}

describe('label anchors in the Markdown editor', () => {
  const fig = (line: string) => `:::figure{resource="mapa" slot="mapa"}\n::label[Albar]{at="albar"}\n\n${line}\n:::`;

  it('offers the anchors of the figure’s picture, those not labelled yet first, with their label styles', () => {
    const r = complete(fig('::label[Puerto Gris]{at="|'))!;
    expect(r.options.map((o) => o.label)).toEqual(['puerto', 'rio', 'albar']);
    expect(r.options.map((o) => o.detail)).toEqual(['ciudad', 'no label style', 'Capital (capital)']);
    expect((r.options[2] as { caption?: string }).caption).toBe('already labelled');
    // Inside the quotes the id alone; without them, quoted.
    expect(r.options[0]!.apply).toBe('puerto');
    expect(complete(fig('::label[Puerto Gris]{at=|'))!.options[0]!.apply).toBe('"puerto"');
  });

  it('filters from what is typed and keeps to anchor names', () => {
    const r = complete(fig('::label[Río]{style="x" at="ri|'))!;
    expect(r.to! - r.from).toBe(2);
    expect(r.validFor).toBeInstanceOf(RegExp);
  });

  it('offers the label styles in style="…"', () => {
    const r = complete(fig('::label[Albar]{at="albar" style="|'))!;
    expect(r.options.map((o) => [o.label, o.detail])).toEqual([['capital', 'Capital'], ['ciudad', undefined]]);
  });

  it('writes a label line after ::la inside a figure', () => {
    const r = complete(fig('::la|'))!;
    expect(r.options[0]!.label).toBe('::label[…]{at="…"}');
  });

  it('stays quiet outside a figure, on percentages and for a picture without anchors', () => {
    expect(complete('::label[X]{at="|')).toBeNull();
    expect(complete(':::frame{slot="a"}\n::label[X]{at="|')).toBeNull();
    expect(complete(fig('::label[X]{at="4|'))).toBeNull();
    expect(complete(fig('::label[X]{at="|'), { ...CTX, resources: [{ ...MAP, anchors: [] }] })).toBeNull();
    expect(complete(fig('Some text at="|'))).toBeNull();
  });
});

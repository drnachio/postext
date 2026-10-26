import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { emptyCaptionWarnings } from '../../pipeline/contentWarnings.js';
import type { PostextConfig, Resource } from '../../index.js';

// #1203: column balancing builds its final document by splicing the pages
// of a later pass into the best one; the warnings a pass keeps per document
// (emptyCaption, floatShrunk, textWrap, dropCap…) must follow their pages.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 6 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const SENTENCE =
  'La composición tipográfica editorial exige columnas alineadas, rejilla base estable y márgenes consistentes en cada página del documento. ';
const paragraph = (n: number) => SENTENCE.repeat(n).trim();

const figure: Resource = {
  id: 'fig',
  typeId: 'figure',
  kind: 'bitmap',
  caption: '',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'fig.png', format: 'png', width: 1000, height: 500 },
  placement: { position: 'here' },
};

function markdown(at: number): string {
  const parts: string[] = ['# Documento de prueba', '', paragraph(6), ''];
  for (let i = 1; i <= 8; i++) {
    parts.push(`## Sección ${i}`, '', paragraph(5), '', paragraph(4), '');
    if (i === at) parts.push('::resource{id="fig"}', '');
    parts.push(`### Detalle ${i}`, '', paragraph(5), '', paragraph(3), '');
  }
  return parts.join('\n');
}

describe('warnings kept per document survive a balancing splice (#1203)', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('reports the empty caption the final layout prints (figure after section %i)', (at) => {
    const config: PostextConfig = { headings: { balancing: { enabled: true } } };
    const doc = buildDocument({ markdown: markdown(at), resources: [figure] }, config, createMeasurementCache());
    const printed = emptyCaptionWarnings(doc);
    expect(printed).toHaveLength(1);
    expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'emptyCaption')).toHaveLength(1);
  }, 30_000);
});

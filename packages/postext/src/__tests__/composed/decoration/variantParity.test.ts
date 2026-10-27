import { describe, it, expect } from 'vitest';
import { validatePageTemplates } from '../../../composed/validate.js';
import { attrPlaceholderUses, attrPlaceholdersNeverSet, markdownAttributesSet } from '../../../design/fenceCondition.js';
import { parseMarkdown } from '../../../parse/index.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { PostextConfig } from '../../../types.js';

// #1152: an element of a variant whose parity is the other side's is never
// drawn (a recto is an odd page, a verso an even one), and an {attr.x} no
// heading or fence sets always reads ''.
const mm = (value: number) => ({ value, unit: 'mm' as const });
const text = (id: string, content: string, parity?: 'all' | 'odd' | 'even') => ({
  kind: 'text', id, content, ...(parity ? { parity } : {}),
  placement: { anchor: { to: 'page', edge: 'bottom' }, offset: { x: mm(0), y: mm(-8) } },
  size: { width: mm(30), height: 'auto' },
});

function warnings(template: PageTemplate): string[] {
  return validatePageTemplates({ pageTemplates: [template] } as PostextConfig)
    .map((w) => `${w.kind} ${w.path} ${'value' in w ? w.value : ''}`);
}

describe('a variant element on the wrong side', () => {
  it('is reported in variants.recto and variants.verso', () => {
    const template = {
      id: 'shell',
      frames: [{ name: 'texto', flow: true }],
      variants: {
        recto: { footer: { elements: [text('folio', '{pageNumber}', 'even'), text('foot', '{attr.foot}', 'odd')] } },
        verso: { decoration: { elements: [text('band', 'x', 'odd')] } },
      },
    } as unknown as PageTemplate;
    expect(warnings(template)).toEqual([
      'unknownConfigValue /pageTemplates/0/variants/recto/footer/elements/0/parity even',
      'unknownConfigValue /pageTemplates/0/variants/verso/decoration/elements/0/parity odd',
    ]);
  });

  it('is quiet when the parity matches its side or is all', () => {
    const template = {
      id: 'shell',
      frames: [{ name: 'texto', flow: true }],
      variants: {
        recto: { footer: { elements: [text('folio', '{pageNumber}', 'odd'), text('foot', 'x', 'all')] } },
        verso: { header: { elements: [text('head', 'x', 'even'), text('plain', 'x')] } },
      },
    } as unknown as PageTemplate;
    expect(warnings(template)).toEqual([]);
  });
});

describe('{attr.x} that nothing sets', () => {
  const config = {
    footer: { elements: [text('foot', '{attr.foot} · {attr.unit}')] },
    pageTemplates: [{ id: 'p', frames: [], decoration: { elements: [{ kind: 'image', id: 'bg', resourceId: 'ground-{attr.fondo}' }] } }],
  } as unknown as PostextConfig;

  it('lists every use with its path', () => {
    expect(attrPlaceholderUses(config)).toEqual([
      { path: 'footer.elements[0].content', attribute: 'foot' },
      { path: 'footer.elements[0].content', attribute: 'unit' },
      { path: 'pageTemplates[0].decoration.elements[0].resourceId', attribute: 'fondo' },
    ]);
  });

  it('reads the keys headings and fences set', () => {
    const blocks = parseMarkdown('# One {unit="1"}\n\n::::page{template="p" fondo="a"}\nText.\n::::\n\n:::callout{type="note" tip="x"}\nA.\n:::\n');
    const set = markdownAttributesSet(blocks);
    expect(set).toEqual(expect.arrayContaining(['unit', 'fondo', 'tip']));
    expect(attrPlaceholdersNeverSet(config, set).map((u) => u.attribute)).toEqual(['foot']);
  });
});

import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from 'postext';
import { PNG, baseConfig, layOut, pt } from '../__tests__/vdt.js';
import { buildReflowablePublication } from '../index.js';
import { bookStylesheet, type CssRule } from '../css.js';

// The caption style of a resource type (`resourceTypes[].captionStyle`,
// #1550) in the reflowable book: the figure or table box carries the
// type's class, and the stylesheet sets what the type changes under it,
// hyphens included, undoing what the document's style sets and it does not.

const resources: Resource[] = [
  {
    id: 'f1', typeId: 'figure', kind: 'bitmap', caption: 'A square.', note: 'Drawn for the test.', altText: 'A red square',
    createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f1.png', format: 'png', width: 400, height: 300 },
  },
  {
    id: 't1', typeId: 'table', kind: 'table', caption: 'Sizes.', note: 'Measured twice.', createdAt: 0, updatedAt: 0,
    table: { model: { headerRowCount: 1, rows: [[{ content: 'Size' }, { content: 'Width' }], [{ content: 'Small' }, { content: '10' }]] } },
  },
];

const config = (extra: PostextConfig): PostextConfig => ({ ...baseConfig, ...extra });
const doc = (c: PostextConfig) => layOut('See :ref{id=f1} and :ref{id=t1}.', config(c), resources);
const rulesOf = (c: PostextConfig): CssRule[] => bookStylesheet(doc(c).config, '', { vertical: false }).rules;
const decls = (rules: CssRule[], selector: string): readonly string[] | undefined => rules.find((r) => r.selector === selector)?.decls;

async function chapter(c: PostextConfig): Promise<string> {
  const pub = await buildReflowablePublication([doc(c)], {
    layout: 'reflowable',
    metadata: { title: 'Sample book', language: 'en-US', modified: new Date(Date.UTC(2026, 10, 13)) },
    resourceBytes: (fileId) => (fileId === 'f1.png' ? { bytes: PNG, mediaType: 'image/png' } : undefined),
  });
  return pub.items.filter((i) => i.mediaType === 'application/xhtml+xml').map((i) => i.data as string).join('\n');
}

describe('caption styles per resource type in the reflowable book', () => {
  it('writes no class and no rule when no type sets its own', async () => {
    const rules = rulesOf({});
    expect(rules.some((r) => r.selector.includes('pt-type-'))).toBe(false);
    const all = await chapter({});
    expect(all).not.toContain('pt-type-');
    expect(all).toContain('<div class="pt-table">');
  });

  it('writes no class for a type whose style is the document\'s', async () => {
    const rules = rulesOf({ resourceTypes: [{ id: 'table', name: 'Table', shortLabel: 'Tab.', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionPrefix: 'Table', captionStyle: { hyphenation: false } }] });
    expect(rules.some((r) => r.selector.includes('pt-type-'))).toBe(false);
  });

  it('sets a table\'s captions apart from the figures\', hyphens included', async () => {
    const c: PostextConfig = {
      captionStyle: { descriptionItalic: true },
      resourceTypes: [
        { id: 'figure', name: 'Figure', shortLabel: 'Fig.', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionPrefix: 'Figure' },
        {
          id: 'table', name: 'Table', shortLabel: 'Tab.', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionPrefix: 'Table',
          captionStyle: { hyphenation: true, descriptionItalic: false, fontSize: pt(7), position: 'above', labelBold: false, note: { hyphenation: true, italic: true } },
        },
      ],
    };
    const rules = rulesOf(c);
    // The document's caption keeps its words whole and slants.
    expect(decls(rules, 'figcaption, caption')).toEqual(expect.arrayContaining(['hyphens: manual', 'font-style: italic']));
    // The table's: the body's hyphens, upright (the italic undone), its
    // own size; nothing it shares with the document's style is repeated.
    const cap = decls(rules, '.pt-type-table figcaption, .pt-type-table caption')!;
    expect(cap).toEqual(expect.arrayContaining(['hyphens: auto', 'font-style: normal']));
    expect(cap.some((d) => d.startsWith('font-size'))).toBe(true);
    expect(cap.some((d) => d.startsWith('text-align') || d.startsWith('font-family'))).toBe(false);
    expect(decls(rules, '.pt-type-table .pt-label')).toEqual(['font-weight: inherit']);
    expect(decls(rules, '.pt-type-table .pt-note')).toEqual(expect.arrayContaining(['font-style: italic', 'hyphens: auto']));
    // The figure type sets nothing of its own: no rules for it.
    expect(rules.some((r) => r.selector.includes('pt-type-figure'))).toBe(false);

    const all = await chapter(c);
    // The table's box carries the class; its caption stands above it, as
    // the type says, though the document's captions stand below.
    expect(all).toMatch(/<div class="pt-table pt-type-table"><table id="res-t1">\n<caption>[^]*Sizes\.<\/caption>/);
    expect(all).toMatch(/<\/table>\n<p class="pt-note">.*Measured twice\..*<\/p><\/div>/);
    expect(all).toMatch(/<figure id="res-f1">/);
  });

  it('keeps a hyphenating type\'s note whole when its own note says so', () => {
    const rules = rulesOf({
      captionStyle: { hyphenation: true },
      resourceTypes: [{ id: 'figure', name: 'Figure', shortLabel: 'Fig.', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionPrefix: 'Figure', captionStyle: { hyphenation: false, note: { hyphenation: false } } }],
    });
    expect(decls(rules, 'figcaption, caption')).toContain('hyphens: auto');
    expect(decls(rules, '.pt-note')).toContain('hyphens: manual');
    expect(decls(rules, '.pt-type-figure figcaption, .pt-type-figure caption')).toEqual(['hyphens: manual']);
    expect(decls(rules, '.pt-type-figure .pt-note')).toBeUndefined();
  });
});

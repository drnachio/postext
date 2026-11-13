import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { baseConfig, layOut } from '../__tests__/vdt.js';
import { bookStylesheet, type CssRule } from '../css.js';

// `hyphenation` and `lineHeight` of captions, notes and tables (#1528) in
// the reflowable stylesheet: hyphens as the body's when on, the leading as
// a ratio of the text's own size.

const rulesOf = (config: PostextConfig): CssRule[] => bookStylesheet(layOut('Text.', { ...baseConfig, ...config }).config, '', { vertical: false }).rules;
const decls = (rules: CssRule[], selector: string): readonly string[] => rules.find((r) => r.selector === selector)?.decls ?? [];

describe('captions, notes and tables in the reflowable stylesheet', () => {
  it('keeps their hyphens manual and their leading the body by default', () => {
    const rules = rulesOf({});
    expect(decls(rules, 'figcaption, caption')).toContain('hyphens: manual');
    expect(decls(rules, 'table')).toContain('hyphens: manual');
    expect(decls(rules, 'figcaption, caption').some((d) => d.startsWith('line-height'))).toBe(false);
    expect(decls(rules, '.pt-note').some((d) => d.startsWith('line-height'))).toBe(false);
    // Stated (#1550): a note set after the picture, out of the caption,
    // would take the body's hyphens.
    expect(decls(rules, '.pt-note')).toContain('hyphens: manual');
  });

  it('takes the body hyphens and their own leading when set', () => {
    const rules = rulesOf({
      captionStyle: { hyphenation: true, lineHeight: { value: 1.2, unit: 'em' }, note: { hyphenation: false, lineHeight: { value: 1.1, unit: 'em' } } },
      tableStyle: { hyphenation: true },
      tableStyles: [{ id: 'plain', hyphenation: false }],
    });
    expect(decls(rules, 'figcaption, caption')).toContain('hyphens: auto');
    expect(decls(rules, 'figcaption, caption')).toContain('line-height: 1.2');
    expect(decls(rules, '.pt-note')).toEqual(expect.arrayContaining(['line-height: 1.1', 'hyphens: manual']));
    expect(decls(rules, 'table')).not.toContain('hyphens: manual');
    expect(decls(rules, 'table.pt-table-plain')).toContain('hyphens: manual');
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_LABELS } from '../../../../types/defaultLabels.js';
import { groupsText, kindText, listText, suggestionText, usageText } from './text.js';

describe('the words of the frame-style library', () => {
  it('names the settings a suggestion differs in as the panel names them', () => {
    expect(suggestionText({ keep: 'a', merge: ['b', 'c'], fields: ['padding.left'], groups: ['padding'], moves: 0 }, DEFAULT_LABELS)).toBe('These 3 styles differ only in padding: merge?');
    expect(suggestionText({ keep: 'a', merge: ['b'], fields: [], groups: [], moves: 0 }, DEFAULT_LABELS)).toBe('These 2 styles look the same: merge?');
    expect(groupsText(['padding', 'label', 'fixed', 'marginTop'], DEFAULT_LABELS)).toBe('padding, label tab and where the box stands');
  });

  it('keeps the capitals of German nouns', () => {
    const de = { ...DEFAULT_LABELS, calloutStylePaddingGroup: 'Innenabstand', frameStylesAnd: ' und ' };
    expect(groupsText(['padding'], de, 'de')).toBe('Innenabstand');
  });

  it('joins with the language’s separator', () => {
    expect(listText(['甲', '乙', '丙'], '和', '、')).toBe('甲、乙和丙');
  });

  it('says where a style is used', () => {
    expect(usageText(undefined, DEFAULT_LABELS)).toBe('Not used');
    expect(usageText({ id: 'a', fences: [], fenceCount: 3, frames: [{ templateId: 't', frame: 'f', scope: 'base' }], templates: ['t'], pages: [], pageCount: 2 }, DEFAULT_LABELS))
      .toBe('1 template frame · 2 composed pages · 3 boxes in the text');
  });

  it('says how many variants a kind of box has and what they differ in (#976)', () => {
    const variant = (id: string, groups: string[]) => ({ id, extendsBase: false, fields: groups, groups });
    expect(kindText({ base: 'caja', variants: [variant('a', ['background']), variant('b', ['background', 'border'])] }, 'Box', DEFAULT_LABELS))
      .toBe('Box and 2 variants: differ in background and border');
    expect(kindText({ base: 'caja', variants: [variant('a', ['background'])] }, 'Box', DEFAULT_LABELS)).toBe('Box and 1 variant: differs in background');
  });
});

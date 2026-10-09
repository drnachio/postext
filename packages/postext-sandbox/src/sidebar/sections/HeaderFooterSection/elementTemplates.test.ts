import { describe, expect, it } from 'vitest';
import { resolveDesignSlot, type ResolvedDesignTextElement } from 'postext';
import { newTextElement } from './elementTemplates';

// #628: "Add text" leaves `overflow` unset, so the slot's default applies.
describe('newTextElement', () => {
  it('sets no overflow: an opener or part text wraps, a running head ends in an ellipsis', () => {
    const el = newTextElement('text1', 'heading');
    expect(el.overflow).toBeUndefined();
    const overflow = (kind: Parameters<typeof resolveDesignSlot>[1]) =>
      (resolveDesignSlot({ elements: [el] }, kind).elements[0] as ResolvedDesignTextElement).overflow;
    expect(overflow('heading')).toBe('wrap');
    expect(overflow('part')).toBe('wrap');
    expect(overflow('header')).toBe('ellipsis-end');
    expect(newTextElement('text2', 'header')).toMatchObject({ id: 'text2', content: '' });
  });
});

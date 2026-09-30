// A menu with a filter field (the chapter menu of a long book): a menu may
// own menu items only, so the field sits beside the list, in a dialog, and
// the list alone is the menu (#199).
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MenuBody, menuPopupRole } from './menu';

const items = [h('div', { key: 1, role: 'menuitem' }, 'Chapter one'), h('div', { key: 2, role: 'menuitem' }, 'Chapter two')];

describe('Menu', () => {
  it('keeps a header out of the menu: the list alone is the menu, named', () => {
    const html = renderToString(h(MenuBody, { header: h('input', { type: 'search', 'aria-label': 'Find a chapter' }), label: 'Chapters', children: items }));
    expect(menuPopupRole(true)).toEqual({ role: 'dialog' });
    const at = html.indexOf('role="menu"');
    expect(at).toBeGreaterThan(html.indexOf('<input'));
    expect(html.slice(at)).not.toContain('<input');
    expect(html.slice(at)).toContain('aria-label="Chapters"');
    expect(html.slice(at).match(/role="menuitem"/g)).toHaveLength(2);
  });

  it('leaves a plain menu to the popup, which is the menu itself', () => {
    const html = renderToString(h(MenuBody, { label: 'Chapters', children: items }));
    expect(menuPopupRole(false)).toEqual({});
    expect(html).not.toContain('role="menu"');
    expect(html.match(/role="menuitem"/g)).toHaveLength(2);
  });
});

import type { CSSProperties } from 'react';

/** Shared look of every floating surface (popovers, menus, tooltips). Popups
 *  portal to `document.body`, outside the sandbox root, so font and colour
 *  are set explicitly instead of inherited. */
export const POPUP_SURFACE: CSSProperties = {
  backgroundColor: 'var(--surface)',
  color: 'var(--foreground)',
  border: '1px solid var(--rule)',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
  fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
  fontSize: 12,
  lineHeight: '16px',
  boxSizing: 'border-box',
  outline: 'none',
};

/** Stacking: popovers/menus above the sidebar and viewport toolbars,
 *  tooltips above popovers. */
export const POPUP_Z_INDEX = 50;
export const TOOLTIP_Z_INDEX = 60;

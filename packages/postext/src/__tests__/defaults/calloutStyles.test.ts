import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CALLOUT_STYLES,
  DEFAULT_CALLOUT_STYLE_STATIC,
  resolveCalloutStylesConfig,
  stripCalloutStylesDefaults,
} from '../../defaults/calloutStyles';
import { resolveBodyTextConfig } from '../../defaults/bodyText';
import { resolveHeadingsConfig } from '../../defaults/headings';
import { resolveUnorderedListsConfig } from '../../defaults/unorderedLists';
import { stripConfigDefaults, applyPaletteToConfig, DEFAULT_MAIN_COLOR_HEX } from '../../defaults';
import { resolveAllConfig } from '../../pipeline/config';
import type { CalloutStyleConfig, PostextConfig } from '../../types';

const body = resolveBodyTextConfig({
  fontFamily: 'Literata',
  fontSize: { value: 9, unit: 'pt' },
  lineHeight: { value: 1.4, unit: 'em' },
  textAlign: 'left',
  hyphenation: { enabled: false },
  firstLineIndent: { value: 1, unit: 'em' },
});
const headings = resolveHeadingsConfig({ fontFamily: 'Inter' });
const lists = resolveUnorderedListsConfig({ bulletChar: '–' }, body);

const resolve = (styles: CalloutStyleConfig[] | undefined) =>
  resolveCalloutStylesConfig(styles, body, headings, lists);

describe('callout style defaults', () => {
  it('ships one neutral `note` style by default', () => {
    expect(DEFAULT_CALLOUT_STYLES).toEqual([{ id: 'note', name: 'Note' }]);
    const [r] = resolve(undefined);
    expect(r!.id).toBe('note');
    expect(r!.name).toBe('Note');
    expect(r!.title).toBe('');
    expect(r!.backgroundEnabled).toBe(true);
    expect(r!.background.hex).toBe('#f4f4f4');
    expect(r!.border.enabled).toBe(false);
    expect(r!.stripe.enabled).toBe(false);
    expect(r!.icon.kind).toBe('none');
    expect(r!.keepTogether).toBe(true);
    expect(resolveAllConfig().calloutStyles.map((s) => s.id)).toEqual(['note']);
  });

  it('resolve inherits typography from headings, body text and lists', () => {
    const [r] = resolve([{ id: 'x' }]);
    expect(r!.name).toBe('x');
    expect(r!.titleStyle).toEqual({
      fontFamily: 'Inter',
      fontSize: { value: 9, unit: 'pt' },
      fontWeight: 700,
      italic: false,
      color: DEFAULT_CALLOUT_STYLE_STATIC.titleStyle.color,
      textTransform: 'none',
      gap: { value: 0.5, unit: 'em' },
    });
    expect(r!.icon.fontFamily).toBe('Inter');
    expect(r!.body).toEqual({
      fontFamily: 'Literata',
      fontSize: { value: 9, unit: 'pt' },
      lineHeight: { value: 1.4, unit: 'em' },
      color: body.color,
      textAlign: 'left',
      hyphenation: false,
      paragraphSpacing: body.paragraphSpacing,
      firstLineIndent: { value: 1, unit: 'em' },
    });
    expect(r!.lists).toEqual({
      bulletChar: '–',
      color: lists.color,
      indent: lists.indent,
      gap: lists.gap,
      itemSpacing: lists.itemSpacing,
    });
    expect(r!.padding).toEqual(DEFAULT_CALLOUT_STYLE_STATIC.padding);
    expect(r!.marginTop).toEqual({ value: 0.75, unit: 'em' });
    expect(r!.marginBottom).toEqual({ value: 0.75, unit: 'em' });
  });

  it('explicit fields win over the inherited ones', () => {
    const style: CalloutStyleConfig = {
      id: 'objectives',
      name: 'Objectives',
      title: 'Objectives',
      span: 'page',
      placement: 'top',
      width: 'auto',
      backgroundEnabled: false,
      border: { enabled: true, color: { hex: '#123456', model: 'hex' }, width: { value: 1, unit: 'pt' } },
      borderRadius: { value: 2, unit: 'mm' },
      padding: { top: { value: 1, unit: 'em' } },
      stripe: { enabled: true, side: 'top', width: { value: 2, unit: 'mm' } },
      icon: { kind: 'glyph', glyph: '!', size: { value: 2, unit: 'em' }, align: 'center' },
      titleStyle: { fontFamily: 'Merriweather', textTransform: 'uppercase', italic: true },
      body: { fontSize: { value: 7, unit: 'pt' }, textAlign: 'justify', hyphenation: true },
      lists: { bulletChar: '▸', itemSpacing: { value: 0.25, unit: 'em' } },
      marginTop: { value: 1, unit: 'em' },
      marginBottom: { value: 2, unit: 'em' },
      keepTogether: false,
    };
    const [r] = resolve([style]);
    expect(r!.span).toBe('page');
    expect(r!.placement).toBe('top');
    expect(r!.width).toBe('auto');
    expect(r!.border).toEqual({ enabled: true, color: { hex: '#123456', model: 'hex' }, width: { value: 1, unit: 'pt' } });
    expect(r!.padding.top).toEqual({ value: 1, unit: 'em' });
    expect(r!.padding.left).toEqual({ value: 0.75, unit: 'em' });
    expect(r!.stripe.side).toBe('top');
    expect(r!.icon.kind).toBe('glyph');
    expect(r!.icon.align).toBe('center');
    expect(r!.titleStyle.fontFamily).toBe('Merriweather');
    expect(r!.titleStyle.textTransform).toBe('uppercase');
    expect(r!.titleStyle.italic).toBe(true);
    expect(r!.body.fontSize).toEqual({ value: 7, unit: 'pt' });
    expect(r!.body.textAlign).toBe('justify');
    expect(r!.body.fontFamily).toBe('Literata');
    expect(r!.lists.bulletChar).toBe('▸');
    expect(r!.lists.gap).toEqual(lists.gap);
    // v1: always kept together, regardless of the requested value.
    expect(r!.keepTogether).toBe(true);
  });

  it('strip drops static defaults and keeps explicit / inherited fields', () => {
    const stripped = stripCalloutStylesDefaults([{
      id: 'tip',
      name: 'tip',
      title: '',
      span: 'column',
      backgroundEnabled: true,
      background: { hex: '#f4f4f4', model: 'hex' },
      border: { enabled: false, width: { value: 0.5, unit: 'pt' } },
      padding: { top: { value: 0.75, unit: 'em' }, left: { value: 1, unit: 'em' } },
      stripe: { enabled: true },
      icon: { kind: 'none', fontFamily: 'Inter' },
      titleStyle: { fontWeight: 700, fontSize: { value: 9, unit: 'pt' } },
      body: { fontFamily: 'Literata' },
      lists: {},
      marginTop: { value: 0.75, unit: 'em' },
      marginBottom: { value: 1, unit: 'em' },
      keepTogether: true,
    }]);
    expect(stripped).toEqual([{
      id: 'tip',
      padding: { left: { value: 1, unit: 'em' } },
      stripe: { enabled: true },
      icon: { fontFamily: 'Inter' },
      titleStyle: { fontSize: { value: 9, unit: 'pt' } },
      body: { fontFamily: 'Literata' },
      marginBottom: { value: 1, unit: 'em' },
    }]);
    expect(stripCalloutStylesDefaults(undefined)).toBeUndefined();
    expect(stripCalloutStylesDefaults([])).toBeUndefined();
    // The built-in default needs no persisting.
    expect(stripCalloutStylesDefaults([{ id: 'note' }])).toBeUndefined();
    expect(stripCalloutStylesDefaults([{ id: 'note', name: 'Note' }])).toBeUndefined();
    expect(stripCalloutStylesDefaults([{ id: 'note', name: 'Nota' }])).toEqual([{ id: 'note', name: 'Nota' }]);
  });

  it('strip round-trips through resolve', () => {
    const styles: CalloutStyleConfig[] = [
      { id: 'a', name: 'a', border: { enabled: false }, padding: {} },
      {
        id: 'b',
        name: 'B',
        title: 'Warning',
        stripe: { enabled: true, color: { hex: '#aa0000', model: 'hex' } },
        icon: { kind: 'glyph', glyph: '!' },
        body: { fontSize: { value: 7, unit: 'pt' } },
        lists: { bulletChar: '▸' },
      },
    ];
    const stripped = stripCalloutStylesDefaults(styles)!;
    expect(resolve(stripped)).toEqual(resolve(styles));
  });

  it('stripConfigDefaults removes an empty or default calloutStyles list', () => {
    expect(stripConfigDefaults({ calloutStyles: [] }).calloutStyles).toBeUndefined();
    expect(stripConfigDefaults({ calloutStyles: [{ id: 'note', name: 'Note' }] }).calloutStyles).toBeUndefined();
    const kept: PostextConfig = { calloutStyles: [{ id: 'x', title: 'X' }] };
    expect(stripConfigDefaults(kept).calloutStyles).toEqual(kept.calloutStyles);
  });

  it('palette-linked colours resolve through the palette', () => {
    const accent = { hex: '#000000', model: 'hex' as const, paletteId: 'accent' };
    const config: PostextConfig = {
      colorPalette: [{ id: 'accent', name: 'Accent', value: { hex: '#AA0000', model: 'hex' } }],
      calloutStyles: [{
        id: 'x',
        background: accent,
        border: { color: accent },
        stripe: { color: accent },
        icon: { color: accent },
        titleStyle: { color: accent },
        body: { color: accent },
        lists: { color: accent },
      }],
    };
    const applied = applyPaletteToConfig(config)!.calloutStyles![0]!;
    expect(applied.background).toEqual({ hex: '#AA0000', model: 'hex' });
    expect(applied.border!.color).toEqual({ hex: '#AA0000', model: 'hex' });
    expect(applied.lists!.color).toEqual({ hex: '#AA0000', model: 'hex' });
    const [r] = resolveAllConfig(config).calloutStyles;
    for (const c of [r!.background, r!.border.color, r!.stripe.color, r!.icon.color, r!.titleStyle.color, r!.body.color, r!.lists.color]) {
      expect(c.hex).toBe('#AA0000');
    }
    // The default main-colour links (stripe / icon / title) follow a
    // re-coloured main palette entry.
    const recoloured: PostextConfig = {
      colorPalette: [{ id: 'main-color', name: 'Main', value: { hex: '#00AA00', model: 'hex' } }],
    };
    const [d] = resolveAllConfig(recoloured).calloutStyles;
    expect(d!.stripe.color.hex).toBe('#00AA00');
    expect(d!.titleStyle.color.hex).toBe('#00AA00');
    expect(resolveAllConfig().calloutStyles[0]!.stripe.color.hex).toBe(DEFAULT_MAIN_COLOR_HEX);
  });
});

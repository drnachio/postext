import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PARAGRAPH_STYLES,
  resolveParagraphStylesConfig,
  stripParagraphStylesDefaults,
} from '../../defaults/paragraphStyles';
import { resolveBodyTextConfig } from '../../defaults/bodyText';
import { stripConfigDefaults, applyPaletteToConfig } from '../../defaults';
import { resolveAllConfig } from '../../pipeline/config';
import type { ParagraphStyleConfig, PostextConfig } from '../../types';

const body = resolveBodyTextConfig({
  fontFamily: 'Literata',
  fontSize: { value: 9, unit: 'pt' },
  lineHeight: { value: 1.4, unit: 'em' },
  textAlign: 'left',
  hyphenation: { enabled: false },
  firstLineIndent: { value: 1, unit: 'em' },
});

describe('paragraph style defaults', () => {
  it('ships no styles by default', () => {
    expect(DEFAULT_PARAGRAPH_STYLES).toEqual([]);
    expect(resolveParagraphStylesConfig(undefined, body)).toEqual([]);
    expect(resolveAllConfig().paragraphStyles).toEqual([]);
  });

  it('resolve inherits every unset field from the body text', () => {
    const [r] = resolveParagraphStylesConfig([{ id: 'bib' }], body);
    expect(r).toEqual({
      id: 'bib',
      name: 'bib',
      fontFamily: 'Literata',
      fontSize: { value: 9, unit: 'pt' },
      lineHeight: { value: 1.4, unit: 'em' },
      color: body.color,
      textAlign: 'left',
      hyphenation: false,
      firstLineIndent: { value: 1, unit: 'em' },
      hangingIndent: { value: 0, unit: 'em' },
      spaceBetween: { value: 0, unit: 'em' },
      marginTop: { value: 0, unit: 'em' },
      marginBottom: { value: 0, unit: 'em' },
    });
  });

  it('explicit fields win over the inherited ones', () => {
    const style: ParagraphStyleConfig = {
      id: 'note',
      name: 'Notes',
      fontFamily: 'Inter',
      fontSize: { value: 7, unit: 'pt' },
      lineHeight: { value: 10, unit: 'pt' },
      color: { hex: '#333333', model: 'hex' },
      textAlign: 'justify',
      hyphenation: true,
      hangingIndent: { value: 2, unit: 'em' },
      spaceBetween: { value: 0.5, unit: 'em' },
      marginTop: { value: 1, unit: 'em' },
      marginBottom: { value: 1, unit: 'em' },
    };
    const [r] = resolveParagraphStylesConfig([style], body);
    expect(r).toMatchObject(style);
    expect(r!.firstLineIndent).toEqual(body.firstLineIndent);
  });

  it('strip drops static defaults and keeps explicit fields', () => {
    const stripped = stripParagraphStylesDefaults([{
      id: 'bib',
      name: 'bib',
      fontSize: { value: 7, unit: 'pt' },
      hangingIndent: { value: 0, unit: 'em' },
      spaceBetween: { value: 0, unit: 'pt' },
      marginTop: { value: 1, unit: 'em' },
    }]);
    expect(stripped).toEqual([{ id: 'bib', fontSize: { value: 7, unit: 'pt' }, marginTop: { value: 1, unit: 'em' } }]);
    expect(stripParagraphStylesDefaults(undefined)).toBeUndefined();
    expect(stripParagraphStylesDefaults([])).toBeUndefined();
  });

  it('strip round-trips through resolve', () => {
    const styles: ParagraphStyleConfig[] = [
      { id: 'a', name: 'a', hangingIndent: { value: 0, unit: 'em' } },
      { id: 'b', name: 'B', fontSize: { value: 7, unit: 'pt' }, spaceBetween: { value: 0.5, unit: 'em' } },
    ];
    const stripped = stripParagraphStylesDefaults(styles)!;
    expect(resolveParagraphStylesConfig(stripped, body)).toEqual(resolveParagraphStylesConfig(styles, body));
  });

  it('stripConfigDefaults removes an empty paragraphStyles list', () => {
    const config: PostextConfig = { paragraphStyles: [] };
    expect(stripConfigDefaults(config).paragraphStyles).toBeUndefined();
    const kept: PostextConfig = { paragraphStyles: [{ id: 'x', fontSize: { value: 7, unit: 'pt' } }] };
    expect(stripConfigDefaults(kept).paragraphStyles).toEqual(kept.paragraphStyles);
  });

  it('palette-linked colours resolve through the palette', () => {
    const config: PostextConfig = {
      colorPalette: [{ id: 'accent', name: 'Accent', value: { hex: '#AA0000', model: 'hex' } }],
      paragraphStyles: [{ id: 'x', color: { hex: '#000000', model: 'hex', paletteId: 'accent' } }],
    };
    expect(applyPaletteToConfig(config)!.paragraphStyles![0]!.color).toEqual({ hex: '#AA0000', model: 'hex' });
    expect(resolveAllConfig(config).paragraphStyles[0]!.color.hex).toBe('#AA0000');
  });
});

import { describe, it, expect } from 'vitest';
import {
  mergeCaptionStyle,
  resolveCaptionStyleConfig,
  stripCaptionStyleDefaults,
} from '../../defaults/captionStyle';
import { resolveBodyTextConfig } from '../../defaults/bodyText';
import { DEFAULT_MAIN_COLOR_HEX, DEFAULT_MAIN_COLOR_ID } from '../../defaults/shared';
import type { CaptionStyleConfig, ColorPaletteEntry } from '../../types';

const bodyText = resolveBodyTextConfig(undefined);

describe('caption style defaults — position / bar / note', () => {
  it('resolves the new fields to their documented defaults', () => {
    const r = resolveCaptionStyleConfig(undefined, bodyText);
    expect(r.position).toBe('below');
    expect(r.backgroundEnabled).toBe(false);
    expect(r.background.paletteId).toBe(DEFAULT_MAIN_COLOR_ID);
    expect(r.padding).toEqual({ value: 0.35, unit: 'em' });
    // Note: 0.85 × caption size, caption colour, upright, 0.35em gap, left.
    expect(r.note.fontSize).toEqual({ value: r.fontSize.value * 0.85, unit: r.fontSize.unit });
    expect(r.note.color).toEqual(r.color);
    expect(r.note.italic).toBe(false);
    expect(r.note.gap).toEqual({ value: 0.35, unit: 'em' });
    expect(r.note.align).toBe('left');
  });

  it('strips defaults and keeps explicit overrides (round trip)', () => {
    const explicit: CaptionStyleConfig = {
      position: 'above',
      backgroundEnabled: true,
      background: { hex: '#123456', model: 'hex' },
      padding: { value: 0.5, unit: 'em' },
      note: {
        fontSize: { value: 8, unit: 'pt' },
        color: { hex: '#654321', model: 'hex' },
        italic: true,
        gap: { value: 0.5, unit: 'em' },
        align: 'center',
      },
    };
    expect(stripCaptionStyleDefaults(explicit)).toEqual(explicit);

    const allDefaults: CaptionStyleConfig = {
      position: 'below',
      backgroundEnabled: false,
      background: { hex: DEFAULT_MAIN_COLOR_HEX, model: 'hex', paletteId: DEFAULT_MAIN_COLOR_ID },
      padding: { value: 0.35, unit: 'em' },
      note: { italic: false, gap: { value: 0.35, unit: 'em' }, align: 'left' },
    };
    expect(stripCaptionStyleDefaults(allDefaults)).toBeUndefined();

    // Resolving the stripped form reproduces the explicit values.
    const r = resolveCaptionStyleConfig(stripCaptionStyleDefaults(explicit), bodyText);
    expect(r.position).toBe('above');
    expect(r.backgroundEnabled).toBe(true);
    expect(r.background.hex).toBe('#123456');
    expect(r.padding).toEqual({ value: 0.5, unit: 'em' });
    expect(r.note).toEqual(explicit.note);
  });
});

describe('mergeCaptionStyle', () => {
  const base = resolveCaptionStyleConfig({ fontSize: { value: 10, unit: 'pt' } }, bodyText);

  it('returns the base untouched when there is no override', () => {
    expect(mergeCaptionStyle(base, undefined)).toBe(base);
  });

  it('replaces only the keys defined in the override', () => {
    const merged = mergeCaptionStyle(base, { position: 'above', labelBold: false });
    expect(merged.position).toBe('above');
    expect(merged.labelBold).toBe(false);
    expect(merged.fontSize).toEqual(base.fontSize);
    expect(merged.align).toBe(base.align);
    expect(merged.note).toEqual(base.note);
  });

  it('lets an overridden colour drive the label and note colours unless set explicitly', () => {
    const red = { hex: '#ff0000', model: 'hex' as const };
    const merged = mergeCaptionStyle(base, { color: red });
    expect(merged.labelColor).toEqual(red);
    expect(merged.note.color).toEqual(red);

    const blue = { hex: '#0000ff', model: 'hex' as const };
    const explicit = mergeCaptionStyle(base, { color: red, labelColor: blue, note: { color: blue } });
    expect(explicit.labelColor).toEqual(blue);
    expect(explicit.note.color).toEqual(blue);
  });

  it('rescales the default note size when the caption size is overridden', () => {
    const merged = mergeCaptionStyle(base, { fontSize: { value: 20, unit: 'pt' } });
    expect(merged.note.fontSize).toEqual({ value: 17, unit: 'pt' });
    const pinned = mergeCaptionStyle(base, { fontSize: { value: 20, unit: 'pt' }, note: { fontSize: { value: 6, unit: 'pt' } } });
    expect(pinned.note.fontSize).toEqual({ value: 6, unit: 'pt' });
  });

  it('resolves palette references inside the override', () => {
    const palette: ColorPaletteEntry[] = [{ id: 'accent', name: 'Accent', value: { hex: '#abcdef', model: 'hex' } }];
    const merged = mergeCaptionStyle(base, { background: { hex: '#000000', model: 'hex', paletteId: 'accent' } }, palette);
    expect(merged.background.hex).toBe('#abcdef');
  });
});

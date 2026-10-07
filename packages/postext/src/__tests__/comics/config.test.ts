import { describe, it, expect } from 'vitest';
import { defaultComicFont, defaultComicSfxFont, resolveComicsConfig, resolvedComics, stripComicsDefaults, pickBalloonStyle, pickPanelStyle, DEFAULT_BALLOON_STYLE_IDS } from '../../defaults/comics';
import { stripConfigDefaults } from '../../defaults';
import { resolveAllConfig } from '../../pipeline/config';
import { collectConfigWarnings } from '../../configWarnings';
import type { ComicsConfig, PostextConfig } from '../../types';

describe('comics config', () => {
  it('resolves the defaults: gutters, panel, lettering, the nine balloon styles', () => {
    const c = resolveComicsConfig(undefined, 'en');
    expect(c.gutter).toEqual({ horizontal: { value: 4, unit: 'mm' }, vertical: { value: 2, unit: 'mm' } });
    expect(c.readingDirection).toBe('auto');
    expect(c.artDirection).toBe('ltr');
    expect(c.runningHeads).toBe(false);
    expect(c.panel).toMatchObject({ borderStyle: 'solid', fit: 'cover', bleed: false });
    expect(c.lettering).toMatchObject({ fontFamily: 'Comic Neue', fontSize: { value: 7.5, unit: 'pt' }, writingMode: 'auto' });
    expect(c.balloonStyles.map((s) => s.id)).toEqual(['speech', 'thought', 'whisper', 'shout', 'radio', 'caption', 'inner', 'note', 'sfx']);
    expect(DEFAULT_BALLOON_STYLE_IDS).toHaveLength(9);
    expect(pickBalloonStyle(c, 'thought')).toMatchObject({ shape: 'cloud', tail: 'bubbles', target: 'head' });
    expect(pickBalloonStyle(c, 'whisper')).toMatchObject({ dash: true, fontScale: 0.9 });
    expect(pickBalloonStyle(c, 'sfx')).toMatchObject({ shape: 'none', fontFamily: 'Bangers' });
    expect(pickBalloonStyle(c, 'nope')).toBeUndefined();
  });

  it('picks the lettering face of the document language', () => {
    expect(defaultComicFont('en')).toBe('Comic Neue');
    expect(defaultComicFont('ja')).toBe('Zen Antique');
    expect(defaultComicFont('zh')).toBe('Noto Sans SC');
    expect(defaultComicFont('zh-TW')).toBe('LXGW WenKai TC');
    expect(defaultComicFont('ar')).toBe('Playpen Sans Arabic');
    expect(defaultComicSfxFont('es')).toBe('Bangers');
    expect(defaultComicSfxFont('ja')).toBe('Dela Gothic One');
    expect(resolvedComics(resolveAllConfig({ locale: 'ja' })).lettering.fontFamily).toBe('Zen Antique');
  });

  it('lays a config style over the built-in one of the same id, and adds new ones', () => {
    const c = resolveComicsConfig({
      balloonStyles: [{ id: 'whisper', fontScale: 0.8 }, { id: 'writing', shape: 'none', tail: 'none' }],
      panelStyles: [{ id: 'rounded', borderRadius: { value: 3, unit: 'mm' } }],
      panel: { borderWidth: { value: 2, unit: 'pt' } },
    });
    expect(pickBalloonStyle(c, 'whisper')).toMatchObject({ dash: true, fontScale: 0.8 });
    expect(pickBalloonStyle(c, 'writing')).toMatchObject({ shape: 'none', tail: 'none', fill: { hex: '#ffffff' } });
    // A named panel style follows the default panel for what it leaves unset.
    expect(pickPanelStyle(c, 'rounded')).toMatchObject({ borderRadius: { value: 3, unit: 'mm' }, borderWidth: { value: 2, unit: 'pt' } });
    expect(pickPanelStyle(c, 'unknown')).toBe(c.panel);
  });

  it('is absent from a resolved config that does not set it', () => {
    expect(resolveAllConfig({}).comics).toBeUndefined();
    expect(resolveAllConfig({ comics: { mirrorArt: true } }).comics?.mirrorArt).toBe(true);
  });

  it('reads palette colours, keeping the link', () => {
    const config: PostextConfig = {
      colorPalette: [{ id: 'ink', name: 'Ink', value: { hex: '#123456', model: 'hex' } }],
      comics: { panel: { borderColor: { hex: '#000000', model: 'hex', paletteId: 'ink' } } },
    };
    expect(resolveAllConfig(config).comics!.panel.borderColor).toMatchObject({ hex: '#123456', paletteId: 'ink' });
  });

  it('strips the defaults', () => {
    const config: ComicsConfig = {
      readingDirection: 'auto',
      gutter: { horizontal: { value: 4, unit: 'mm' }, vertical: { value: 3, unit: 'mm' } },
      lettering: { fontFamily: 'Comic Neue', fontSize: { value: 8, unit: 'pt' } },
      balloonStyles: [{ id: 'speech' }, { id: 'whisper', dash: true, fontScale: 0.85 }],
      panel: { fit: 'cover', borderStyle: 'rough' },
    };
    expect(stripComicsDefaults(config, 'en')).toEqual({
      gutter: { vertical: { value: 3, unit: 'mm' } },
      lettering: { fontSize: { value: 8, unit: 'pt' } },
      balloonStyles: [{ id: 'whisper', fontScale: 0.85 }],
      panel: { borderStyle: 'rough' },
    });
    // The Japanese default face is a default in a Japanese document only.
    expect(stripComicsDefaults({ lettering: { fontFamily: 'Zen Antique' } }, 'ja')).toBeUndefined();
    expect(stripComicsDefaults({ lettering: { fontFamily: 'Zen Antique' } }, 'en')).toEqual({ lettering: { fontFamily: 'Zen Antique' } });
    expect(stripConfigDefaults({ comics: { runningHeads: false } })).toEqual({});
    expect(stripConfigDefaults({ comics: { runningHeads: true } })).toEqual({ comics: { runningHeads: true } });
  });

  it('reports unknown keys in the comics tables', () => {
    const config = {
      comics: {
        mirorArt: true,
        lettering: { fontSze: { value: 8, unit: 'pt' } },
        balloonStyles: [{ id: 'speech', tial: 'none' }],
        panelStyles: [{ id: 'x', borderWidht: { value: 1, unit: 'pt' } }],
        cast: [{ id: 'ana', colour: { hex: '#f00', model: 'hex' } }],
        gutter: { horizontl: { value: 1, unit: 'mm' } },
      },
    } as unknown as PostextConfig;
    const unknown = collectConfigWarnings(config).filter((w) => w.kind === 'unknownConfigKey');
    expect(unknown.map((w) => [w.path, w.suggestion])).toEqual([
      ['comics.mirorArt', 'mirrorArt'],
      ['comics.gutter.horizontl', 'horizontal'],
      ['comics.panelStyles[0].borderWidht', 'borderWidth'],
      ['comics.lettering.fontSze', 'fontSize'],
      ['comics.balloonStyles[0].tial', 'tail'],
      ['comics.cast[0].colour', 'color'],
    ]);
  });

  describe('values outside their choices (#590)', () => {
    const config = {
      comics: {
        readingDirection: 'rlt',
        artDirection: 'left',
        panel: { borderStyle: 'Rough', fit: 'fill' },
        panelStyles: [{ id: 'clean', borderStyle: 'dashed', fit: 'contian' }],
        lettering: { writingMode: 'vertcal', textTransform: 'upper', dropFinalStop: 'yes', joinSameSpeaker: 'conector' },
        balloonStyles: [
          { id: 'thought', shape: 'clod', tail: 'bubles', target: 'face', position: 'top-left', align: 'centre', textTransform: 'caps' },
          { id: 'mine', shape: 'triangle' },
        ],
      },
    } as unknown as PostextConfig;

    it('reports each, with what the engine used and the closest word', () => {
      const values = collectConfigWarnings(config).filter((w) => w.kind === 'unknownConfigValue');
      expect(values.map((w) => [w.path, w.value, w.used, w.suggestion])).toEqual([
        ['comics.readingDirection', 'rlt', 'auto', 'rtl'],
        ['comics.artDirection', 'left', 'ltr', undefined],
        ['comics.panel.borderStyle', 'Rough', 'solid', 'rough'],
        ['comics.panel.fit', 'fill', 'cover', undefined],
        // A named style falls back to the default panel style.
        ['comics.panelStyles[0].borderStyle', 'dashed', 'solid', undefined],
        ['comics.panelStyles[0].fit', 'contian', 'cover', 'contain'],
        ['comics.lettering.writingMode', 'vertcal', 'auto', 'vertical'],
        ['comics.lettering.textTransform', 'upper', 'none', undefined],
        ['comics.lettering.dropFinalStop', 'yes', 'auto', undefined],
        ['comics.lettering.joinSameSpeaker', 'conector', 'butt', 'connector'],
        // A built-in style keeps its own value.
        ['comics.balloonStyles[0].shape', 'clod', 'cloud', 'cloud'],
        ['comics.balloonStyles[0].tail', 'bubles', 'bubbles', 'bubbles'],
        ['comics.balloonStyles[0].target', 'face', 'head', undefined],
        ['comics.balloonStyles[0].position', 'top-left', 'auto', undefined],
        ['comics.balloonStyles[0].align', 'centre', 'center', 'center'],
        ['comics.balloonStyles[0].textTransform', 'caps', 'none', undefined],
        // A new style falls back to the speech balloon.
        ['comics.balloonStyles[1].shape', 'triangle', 'oval', undefined],
      ]);
    });

    it('resolves them to those values', () => {
      const c = resolveComicsConfig(config.comics, 'en');
      expect([c.readingDirection, c.artDirection, c.panel.borderStyle, c.panel.fit]).toEqual(['auto', 'ltr', 'solid', 'cover']);
      expect([c.panelStyles[0]!.borderStyle, c.panelStyles[0]!.fit]).toEqual(['solid', 'cover']);
      const l = c.lettering;
      expect([l.writingMode, l.textTransform, l.dropFinalStop, l.joinSameSpeaker]).toEqual(['auto', 'none', 'auto', 'butt']);
      const thought = pickBalloonStyle(c, 'thought')!;
      expect([thought.shape, thought.tail, thought.target, thought.position, thought.align, thought.textTransform]).toEqual(['cloud', 'bubbles', 'head', 'auto', 'center', undefined]);
      expect(pickBalloonStyle(c, 'mine')!.shape).toBe('oval');
    });

    it('takes every listed word and the booleans of dropFinalStop', () => {
      const ok = {
        comics: {
          readingDirection: 'rtl', artDirection: 'rtl', panel: { borderStyle: 'rough', fit: 'contain' },
          lettering: { writingMode: 'vertical', textTransform: 'uppercase', dropFinalStop: false, joinSameSpeaker: 'none' },
          balloonStyles: [{ id: 'x', shape: 'electric', tail: 'zigzag', target: 'head', position: 'bottom-end', align: 'start', textTransform: 'none' }],
        },
      } as unknown as PostextConfig;
      expect(collectConfigWarnings(ok).filter((w) => w.kind === 'unknownConfigValue')).toEqual([]);
      expect(collectConfigWarnings({ comics: { lettering: { dropFinalStop: 'true' } } } as unknown as PostextConfig).map((w) => w.path))
        .toEqual(['comics.lettering.dropFinalStop']);
    });
  });
});

// Reference balloon styles (SPEC D4 defaults: speech, thought, whisper,
// shout, radio, caption, inner, note, sfx) resolved to px for one
// lettering size. The page layout builds its `LetteringStyle`s from the
// book's configuration; these are what an unset configuration amounts to,
// and what the tests and the dev harness letter with.

import { languageOf } from '../../locale';
import type { LetteringStyle } from './types';

/** Inputs of {@link presetLetteringStyles}. */
export interface PresetInputs {
  /** The book's lettering size, px. */
  fontSizePx: number;
  locale: string;
  /** Dialogue, caption and sound-effect families (defaults: generic). */
  fontFamily?: string;
  sfxFontFamily?: string;
  /** Leading (default 1.15; 1.5 for vertical CJK columns). */
  lineHeight?: number;
}

/** The nine default balloon styles, by id. */
export function presetLetteringStyles(inp: PresetInputs): Record<string, LetteringStyle> {
  const em = inp.fontSizePx;
  const lang = languageOf(inp.locale);
  const cjk = lang === 'ja' || lang === 'zh' || lang === 'ko';
  const cased = !cjk && lang !== 'ar' && lang !== 'he' && lang !== 'fa';
  const family = inp.fontFamily ?? 'Comic Neue';
  const lineHeight = inp.lineHeight ?? (cjk ? 1.5 : lang === 'ar' ? 1.45 : 1.15);
  const stroke = Math.max(0.75, em * 0.085);
  const base: LetteringStyle = {
    id: 'speech',
    shape: 'oval',
    fill: '#ffffff',
    stroke: '#111111',
    strokeWidth: stroke,
    roundness: 2.2,
    padding: 0.8 * em,
    tail: 'curved',
    tailWidth: 1.0 * em,
    tailReach: 0.55,
    target: 'mouth',
    fontFamily: family,
    fontSizePx: em,
    lineHeight,
    fontWeight: 400,
    color: '#111111',
    textTransform: cased ? 'uppercase' : 'none',
    align: 'center',
    emphasis: 'bold-italic',
    writingMode: 'auto',
    maxColumnChars: lang === 'zh' ? 9 : 8,
  };
  return {
    speech: base,
    thought: { ...base, id: 'thought', shape: 'cloud', tail: 'bubbles', target: 'head', italic: cased },
    whisper: { ...base, id: 'whisper', dash: true, color: '#555555', fontSizePx: em * 0.92 },
    shout: { ...base, id: 'shout', shape: 'burst', tail: 'wedge', strokeWidth: stroke * 1.5, fontWeight: 700, fontSizePx: em * 1.15, tailWidth: 1.3 * em, padding: 0.7 * em },
    radio: { ...base, id: 'radio', shape: 'electric', tail: 'zigzag', italic: cased },
    inner: { ...base, id: 'inner', shape: 'rectangle', tail: 'none', fill: '#fff6d6', italic: cased, align: 'start', aspect: 3 },
    caption: {
      ...base, id: 'caption', shape: 'rectangle', tail: 'none', fill: '#fff3c4', position: 'top-start', butt: true,
      aspect: 3.2, align: 'start', padding: 0.55 * em, writingMode: 'auto',
    },
    note: {
      ...base, id: 'note', shape: 'rectangle', tail: 'none', fill: '#fff3c4', position: 'bottom-end', butt: true,
      aspect: 4, align: 'start', italic: cased, fontSizePx: em * 0.85, padding: 0.45 * em,
    },
    sfx: {
      ...base, id: 'sfx', shape: 'none', tail: 'none', fontFamily: inp.sfxFontFamily ?? 'Bangers', fontSizePx: em * 3,
      fontWeight: 700, color: '#d23c1e', halo: 0.12 * em * 3, haloColor: '#ffffff', textTransform: cased ? 'uppercase' : 'none',
      padding: 0, lineHeight: 1, rotate: -8, writingMode: 'auto', maxColumnChars: 5,
    },
  };
}

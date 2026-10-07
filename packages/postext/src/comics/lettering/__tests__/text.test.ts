import { describe, it, expect } from 'vitest';
import { breakPoints, markupOf, prepareText, readLetteringText } from '../text';
import { presetLetteringStyles } from '../presets';
import { parseRichDesignText } from '../../../design/richText';
import type { InlineSpan } from '../../../parse/types';

const styleFor = (locale: string, id = 'speech') => presetLetteringStyles({ fontSizePx: 12, locale })[id]!;
const prep = (text: string | InlineSpan[], locale: string, extra: Record<string, unknown> = {}, map?: number[]) =>
  prepareText(readLetteringText(text, map), { ...styleFor(locale), ...extra }, { locale, vertical: false });
const span = (text: string, bold = false, italic = false, more: Partial<InlineSpan> = {}): InlineSpan => ({ text, bold, italic, ...more });

describe('lettering text: house rules (SPEC D3.1)', () => {
  it('stands ASCII ! and ? upright in Japanese columns (a pair left to the one-cell rule), not in rows', () => {
    const v = (t: string) => prepareText(readLetteringText(t, [...t].map((_, i) => 100 + i)), styleFor('ja'), { locale: 'ja', vertical: true });
    const col = v('キャロット!? 本当!');
    // The pair stays ASCII: the vertical layout sets it in one cell with
    // the face's own glyphs (comic faces lack ⁉ ‼).
    expect(col.text).toBe('キャロット!? 本当！');
    expect(col.source[5]).toBe(105);
    expect(col.source[6]).toBe(106);
    expect(v('メン!!!').text).toBe('メン！！！');
    // Chinese columns set every mark full width.
    expect(prepareText(readLetteringText('真的!?', undefined), styleFor('ja'), { locale: 'zh', vertical: true }).text).toBe('真的！？');
    expect(prepareText(readLetteringText('本当!', undefined), styleFor('ja'), { locale: 'ja', vertical: false }).text).toBe('本当!');
    expect(prepareText(readLetteringText('Really!?', undefined), styleFor('en'), { locale: 'en', vertical: true }).text).toBe('REALLY!?');
  });
  it('sets cased scripts in capitals, keeps Arabic and CJK as they are', () => {
    expect(prep('Did you hear that?', 'en').text).toBe('DID YOU HEAR THAT?');
    expect(prep('¿Has oído eso?', 'es').text).toBe('¿HAS OÍDO ESO?');
    expect(prep('هل سمعت ذلك؟', 'ar').text).toBe('هل سمعت ذلك؟');
    expect(prep('いまの音、聞こえた？', 'ja').text).toBe('いまの音、聞こえた？');
  });

  it('upper-cases in the locale rules and keeps a source offset per character', () => {
    const p = prep('straße', 'de', {}, [10, 11, 12, 13, 14, 15]);
    expect(p.text).toBe('STRASSE');
    expect(p.source).toEqual([10, 11, 12, 13, 14, 14, 15]);
    expect(prep('iki', 'tr').text).toBe('İKİ');
  });

  it('normalises ellipses, double dashes and the final stop', () => {
    expect(prep('Well... maybe', 'en', { textTransform: 'none' }).text).toBe('Well… maybe');
    expect(prep('Wait—what?', 'en', { textTransform: 'none', doubleDash: true }).text).toBe('Wait--what?');
    expect(prep('Wait—what?', 'en', { textTransform: 'none' }).text).toBe('Wait—what?');
    expect(prep('なんでもない。もう寝なさい。', 'ja').text).toBe('なんでもない。もう寝なさい');
    expect(prep('沒什麼。', 'zh-Hant').text).toBe('沒什麼');
    expect(prep('沒什麼。', 'zh-Hant', { dropFinalStop: false }).text).toBe('沒什麼。');
    expect(prep('他說…', 'zh-Hant').text).toBe('他說……');
    expect(prep('C’est fini.', 'fr', { textTransform: 'none' }).text).toBe('C’est fini.');
  });

  it('prints emphasis bold italic, bold only in scripts without italics', () => {
    const en = prep([span('I said '), span('now', false, true), span('!')], 'en');
    const i = en.text.indexOf('NOW');
    expect(en.style[i]).toMatchObject({ bold: true, italic: true });
    expect(en.style[0]).toMatchObject({ bold: false, italic: false });
    const ar = prep([span('قلت '), span('الآن', true)], 'ar');
    expect(ar.style[ar.text.length - 1]).toMatchObject({ bold: true, italic: false });
  });

  it('collapses white space and reads forced breaks', () => {
    expect(prep('one   two \n three', 'en', { textTransform: 'none' }).text).toBe('one two\nthree');
    expect(prep('one\u2028two', 'en', { textTransform: 'none' }).text).toBe('one\ntwo');
  });
});

describe('lettering text: legal breaks', () => {
  it('breaks Latin text at spaces only, cheaper after a sentence end', () => {
    const p = prep('Hi there. Go on', 'en', { textTransform: 'none' });
    const pts = breakPoints(p, 'gb', false);
    expect(pts.map((b) => p.text.slice(0, b.end))).toEqual(['Hi', 'Hi there.', 'Hi there. Go', 'Hi there. Go on']);
    const after = (s: string) => pts.find((b) => p.text.slice(0, b.end) === s)!.penalty;
    expect(after('Hi there.')).toBeLessThan(after('Hi'));
  });

  it('keeps Japanese kinsoku: no column opens with a closing mark or a small kana', () => {
    const p = prep('ちょっと待って、ね', 'ja');
    const pts = breakPoints(p, 'ja-very-strict', true).filter((b) => !b.forced);
    for (const b of pts) {
      expect('、ょっ').not.toContain(p.text[b.next]!);
    }
  });

  it('never breaks inside a tate-chu-yoko run', () => {
    const p = prepareText(readLetteringText([span('あと'), span('12', false, false, { combineUpright: true }), span('分')], undefined), styleFor('ja'), { locale: 'ja', vertical: true });
    const pts = breakPoints(p, 'ja-strict', true);
    const at = p.text.indexOf('12');
    expect(pts.some((b) => b.end === at + 1)).toBe(false);
  });

  it('writes markup that reads back to the same text', () => {
    const p = prep([span('Look '), span('out*_', true), span(' x^2^ now')], 'en', { textTransform: 'none' });
    const markup = markupOf(p, 0, p.text.length);
    const rt = parseRichDesignText(markup, { family: 'X', sizePx: 12, weight: 400, italic: false });
    expect(rt.text).toBe(p.text);
  });
});

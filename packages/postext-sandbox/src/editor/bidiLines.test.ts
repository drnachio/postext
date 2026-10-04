import { describe, expect, it } from 'vitest';
import { bidiLine } from './bidiLines';

const islands = (text: string) => bidiLine(text).isolates.map((r) => text.slice(r.from, r.to));

describe('right-to-left lines in the source editor (#381)', () => {
  it('reads the direction from the first letter past the markup', () => {
    expect(bidiLine('# الفصل الأول').dir).toBe('rtl');
    expect(bidiLine('١. قائمة مرقمة').dir).toBe('rtl');
    expect(bidiLine('- **مهم** first word Latin').dir).toBe('rtl');
    expect(bidiLine('Chapter one عن الليالي').dir).toBe('ltr');
    expect(bidiLine('[^note1]: هامش في أسفل الصفحة').dir).toBe('rtl');
    expect(bidiLine(':ref[fig-1] يبين الشكل').dir).toBe('rtl');
    expect(bidiLine('{dir=rtl} نص').dir).toBe('rtl');
    expect(bidiLine('$x^2$ معادلة').dir).toBe('rtl');
    expect(bidiLine('2024 — ...').dir).toBeNull();
    expect(bidiLine('').dir).toBeNull();
  });

  it('keeps fences and front matter keys left to right', () => {
    expect(bidiLine(':::callout{title="تنبيه"}').dir).toBe('ltr');
    expect(bidiLine(':::').dir).toBe('ltr');
    expect(bidiLine('---').dir).toBe('ltr');
    expect(bidiLine('title: ألف ليلة وليلة').dir).toBe('ltr');
  });

  it('sets the markup of a right-to-left line apart, left to right', () => {
    expect(islands('# الفصل الأول {#ch1 .opener}')).toEqual(['{#ch1 .opener}']);
    expect(islands('كما في :ref[fig-1] وفي الجدول :ref[tab-2]{style=number}')).toEqual([':ref[fig-1]', ':ref[tab-2]', '{style=number}']);
    // A directive around Arabic text isolates only its name.
    expect(islands('قال :rtl[نص عربي] ثم :smallcaps[كلمة]')).toEqual([':rtl', ':smallcaps']);
    expect(islands('النص[^n1] و$E=mc^2$ و`code` و[رابط](https://example.org/a)')).toEqual(['[^n1]', '$E=mc^2$', '`code`', '](https://example.org/a)']);
    // Escaped brackets inside an identifier.
    expect(islands('انظر :ref[a\\]b] هنا')).toEqual([':ref[a\\]b]']);
  });

  it('leaves left-to-right lines alone', () => {
    expect(bidiLine('See :ref[fig-1] and {style=number} عربي').isolates).toEqual([]);
  });

  it('keeps the islands in order and apart', () => {
    const text = '{a} :ref[x]{b} [^c] `d` نص';
    const r = bidiLine(text).isolates;
    expect(r.length).toBe(5);
    for (let i = 1; i < r.length; i++) expect(r[i]!.from).toBeGreaterThanOrEqual(r[i - 1]!.to);
  });
});

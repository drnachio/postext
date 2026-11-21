import { describe, expect, it } from 'vitest';
import { resolveBindingMeasures, softcoverSheet } from 'postext';
import { coverFields, defaultTextBoxes, expandFields, fieldsIn, newTextBox, readTextBoxes, styledBoxText, textBoxRect } from './coverTexts.js';

const trim = { width: 150, height: 230 };
const sheet = softcoverSheet(trim, 20, resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim), false);

describe('cover texts', () => {
  it('split a front cover’s old text into its title, subtitle and author, or keep it', () => {
    expect(coverFields({ front: '# El oficio\n\nUna guía\n\nReyes', spine: 'S' })).toEqual({ title: 'El oficio', subtitle: 'Una guía', author: 'Reyes', spine: 'S' });
    expect(coverFields({ front: '# El oficio\n\nReyes' })).toEqual({ title: 'El oficio', author: 'Reyes' });
    // Not written so: kept as it was.
    const free = { front: 'Sin título\n\nY más\n\nY más\n\nY más' };
    expect(coverFields(free)).toBe(free);
  });

  it('put the general texts in a box’s Markdown, a block left empty gone', () => {
    const text = '# {{title}}\n\n{{subtitle}}\n\n{{author}}';
    expect(expandFields(text, { title: 'El oficio', author: 'Reyes' })).toBe('# El oficio\n\nReyes');
    expect(fieldsIn(text)).toEqual(['title', 'subtitle', 'author']);
    expect(styledBoxText('# T\n\n## S\n\nA\n\nB', 'b1')).toBe(
      [':::paragraphs{style="cover-box-b1-h1"}', 'T', ':::', ':::paragraphs{style="cover-box-b1-h2"}', 'S', ':::', ':::paragraphs{style="cover-box-b1-text"}', 'A', 'B', ':::'].join('\n\n'),
    );
  });

  it('give a design without boxes one over each zone’s safe area, as its type was', () => {
    const boxes = defaultTextBoxes(sheet, { zoneStyles: { front: { title: { fontSize: 30 }, vertical: 'bottom' } } }, { title: 'T' });
    expect(boxes.map((b) => b.id)).toEqual(['text-back', 'text-spine', 'text-front']);
    const front = boxes.find((b) => b.id === 'text-front')!;
    expect(textBoxRect(sheet, front)).toEqual(sheet.zones.find((z) => z.name === 'front')!.safe);
    expect(front.styles).toEqual({ h1: { fontSize: 30 } });
    expect(front.vertical).toBe('bottom');
    expect(boxes.find((b) => b.id === 'text-spine')!.rotate).toBe(-90);
  });

  it('make a new box of a field, and read stored ones', () => {
    const b = newTextBox(sheet, 'author')!;
    expect(b.text).toBe('{{author}}');
    expect(b.zone).toBe('front');
    const back = readTextBoxes([b, { id: 'bad' }], (r) => r as never);
    expect(back).toEqual([b]);
  });
});

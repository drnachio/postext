import { describe, expect, it } from 'vitest';
import { composedLineRanges } from './composedSyntax.js';

/** The ranges of a line as `[kind, text]` pairs. */
function marks(text: string) {
  return composedLineRanges(text).map((r) => [r.kind, text.slice(r.from, r.to)]);
}

describe('composed page highlighting (#854)', () => {
  it('marks the page fence, its attributes and its closing fence', () => {
    expect(marks('::::page{template="tema-cajas" spread fondo=azul}')).toEqual([
      ['fence', '::::page'],
      ['brace', '{'],
      ['attrKey', 'template'],
      ['attrValue', '"tema-cajas"'],
      ['attrKey', 'spread'],
      ['attrKey', 'fondo'],
      ['attrValue', 'azul'],
      ['brace', '}'],
    ]);
    expect(marks('::::')).toEqual([['fence', '::::']]);
    expect(marks(':::::page')).toEqual([['fence', ':::::page']]);
  });

  it('marks frame and figure fences with their slot', () => {
    expect(marks(':::frame{slot="dinero" label="El dinero"}')).toEqual([
      ['fence', ':::frame'],
      ['brace', '{'],
      ['slotKey', 'slot'],
      ['slotValue', '"dinero"'],
      ['attrKey', 'label'],
      ['attrValue', '"El dinero"'],
      ['brace', '}'],
    ]);
    expect(marks(':::figure{resource="mapa" slot=mapa}').slice(0, 4)).toEqual([
      ['fence', ':::figure'],
      ['brace', '{'],
      ['attrKey', 'resource'],
      ['attrValue', '"mapa"'],
    ]);
  });

  it('marks a label line: name, brackets and attributes', () => {
    expect(marks('::label[Mar :chip[Negro]{style="x"}]{at="62% 48%" style="mar"}')).toEqual([
      ['label', '::label'],
      ['bracket', '['],
      ['bracket', ']'],
      ['brace', '{'],
      ['attrKey', 'at'],
      ['attrValue', '"62% 48%"'],
      ['attrKey', 'style'],
      ['attrValue', '"mar"'],
      ['brace', '}'],
    ]);
  });

  it('marks slot= on headings, resources, code fences and other fences only', () => {
    expect(marks('## Retos {slot="titulo"}')).toEqual([['slotKey', 'slot'], ['slotValue', '"titulo"']]);
    expect(marks('::resource{id="x" slot=foto}')).toEqual([['slotKey', 'slot'], ['slotValue', 'foto']]);
    expect(marks('```js slot=codigo')).toEqual([['slotKey', 'slot'], ['slotValue', 'codigo']]);
    expect(marks(':::callout{type="nota" slot="aside"}')).toEqual([['slotKey', 'slot'], ['slotValue', '"aside"']]);
    // Prose that says slot= is not an attribute.
    expect(marks('The slot=value pair goes in braces.')).toEqual([]);
    // A comic page keeps its own highlighter.
    expect(marks(':::page{split="50%|*"}')).toEqual([]);
  });
});

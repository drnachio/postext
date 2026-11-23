import { describe, expect, it } from 'vitest';
import { buildDocument, collectConfigWarnings, configDesignSlots, designTextLiteral, formatWarning, stripConfigDefaults } from '../index.js';
import type { ConfigWarning, DesignElement, PostextConfig } from '../index.js';
import { fontPx } from './fontPx.js';

// A measurer for the build: every character half an em wide.
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return {
      font: '',
      letterSpacing: '0px',
      measureText(this: { font: string }, s: string) {
        const m = fontPx(this.font);
        return { width: s.length * (m ? parseFloat(m[1]!) : 16) / 2 };
      },
    };
  }
};

const text = (id: string, content: string): DesignElement => ({
  kind: 'text',
  id,
  content,
  fontSize: { value: 9, unit: 'pt' },
  placement: { anchor: { to: 'container', edge: 'top-left' } },
});
const rule = (id: string): DesignElement => ({
  kind: 'rule', id, direction: 'horizontal', color: { hex: '#000000', model: 'hex' }, thickness: { value: 0.5, unit: 'pt' },
  placement: { anchor: { to: 'container', edge: 'bottom' } },
});

const content = (config: PostextConfig): ConfigWarning[] => collectConfigWarnings(config).filter((w) => w.kind === 'contentInConfig');

// The 1.33 port of a school textbook: each lesson a heading style whose
// running head carries the lesson's own sentences, set as dozens of design
// texts, beside a rule and a clean folio.
const SENTENCES = [
  'Observa la imagen y responde a las preguntas.',
  'Los detectives buscan pistas en el parque.',
  'Escribe tres palabras que empiecen por «p».',
  'Lee el texto con tu compañero.',
  '¿Qué ha pasado en la biblioteca?',
];
const lesson = (n: number, count: number) => ({
  id: `lesson-${n}`,
  header: {
    elements: [
      rule('band'),
      text('folio', '{pageNumber}'),
      ...Array.from({ length: count }, (_, i) => text(`t${i}`, SENTENCES[i % SENTENCES.length]!)),
    ],
  },
  advancedDesign: { enabled: true, slot: { elements: [text('title', 'Unidad {number} · {titleText}')] } },
});
const TEXTBOOK: PostextConfig = {
  header: { elements: [text('run', '{chapterTitle}'), text('folio', '{pageNumber}')] },
  headingStyles: [lesson(1, 30), lesson(2, 3)],
};

describe('contentInConfig (#849)', () => {
  it('reports every heading style whose design texts hold sentences, once per style', () => {
    const found = content(TEXTBOOK);
    expect(found.map((w) => w.path)).toEqual(['headingStyles[0]', 'headingStyles[1]']);
    const [first, second] = found;
    expect(first!.ownerId).toBe('lesson-1');
    expect(first!.count).toBe(30);
    // The paths are capped at 20, the count is not.
    expect(first!.elements).toHaveLength(20);
    expect(first!.elements![0]).toBe('headingStyles[0].header.elements[2]');
    expect(first!.value).toBe('Observa la imagen y responde a las preg…');
    expect(Array.from(first!.value).length).toBeLessThanOrEqual(40);
    expect(first!.used).toBe('');
    expect(second!.count).toBe(3);
    expect(second!.elements).toEqual([
      'headingStyles[1].header.elements[2]',
      'headingStyles[1].header.elements[3]',
      'headingStyles[1].header.elements[4]',
    ]);
    const letters = (s: string) => s.match(/[\p{L}\p{N}]/gu)!.length;
    expect(second!.chars).toBe(letters(SENTENCES[0]!) + letters(SENTENCES[1]!) + letters(SENTENCES[2]!));
  });

  it('describes the fix in formatWarning', () => {
    const [w] = content(TEXTBOOK);
    expect(formatWarning(w!)).toMatch(/^headingStyles\[0\] \(lesson-1\): 30 design texts hold \d+ characters of content \("Observa/);
    expect(formatWarning(w!)).toContain('move the text into the Markdown');
  });

  it('lands on the document a build returns', () => {
    const doc = buildDocument({ markdown: '# Uno {style="lesson-1"}\n\nTexto.' }, TEXTBOOK);
    expect(doc.configWarnings?.filter((w) => w.kind === 'contentInConfig').map((w) => w.path)).toEqual(['headingStyles[0]', 'headingStyles[1]']);
  });

  it('leaves placeholders and short running heads alone', () => {
    const clean: PostextConfig = {
      header: { elements: [text('run', '{chapterTitle}'), text('label', 'Índice'), text('chap', 'Capítulo {chapterNumber}'), rule('r')] },
      footer: { elements: [text('folio', '— {pageNumber} —'), text('of', '{pageNumber} / {totalPages}'), text('brand', 'Postext · postext.dev')] },
      headingStyles: [{
        id: 'opener',
        advancedDesign: { enabled: true, slot: { elements: [text('n', 'Chapter {numberWords}'), text('t', '{titleText}'), text('a', '{attr.kicker}')] } },
      }],
      parts: { design: { elements: [text('p', 'Part {numberRoman}'), text('t', '{titleText}')] } },
      toc: { parts: { design: { elements: [text('p', '{number}. {titleText}'), text('pg', '{pageNumber}')] } } },
      headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements: [text('t', '{{{titleText}}}')] } } }] },
    };
    expect(content(clean)).toEqual([]);
  });

  it('finds design texts in every slot', () => {
    const long = 'The whole first paragraph of the chapter sits in the design';
    const config: PostextConfig = {
      header: { elements: [text('h', long)] },
      footer: { elements: [text('f', long)] },
      parts: { design: { elements: [text('d', long)] }, versoDesign: { elements: [text('v', long)] } },
      toc: { parts: { design: { elements: [text('r', long)] } } },
      headings: { levels: [{ level: 2, advancedDesign: { enabled: true, slot: { elements: [text('l', long)] } } }] },
      headingStyles: [{ id: 's', footer: { elements: [text('sf', long)] } }],
      htmlViewer: { overrides: { header: { elements: [text('o', long)] } } },
    };
    expect(content(config).map((w) => [w.path, w.elements]).sort()).toEqual([
      ['headings.levels[0]', ['headings.levels[0].advancedDesign.slot.elements[0]']],
      ['parts.design', ['parts.design.elements[0]']],
      ['parts.versoDesign', ['parts.versoDesign.elements[0]']],
      ['headingStyles[0]', ['headingStyles[0].footer.elements[0]']],
      ['toc.parts.design', ['toc.parts.design.elements[0]']],
      ['header', ['header.elements[0]']],
      ['footer', ['footer.elements[0]']],
      ['htmlViewer.overrides.header', ['htmlViewer.overrides.header.elements[0]']],
    ].sort());
  });

  it('takes the allowed phrases out before counting', () => {
    const config: PostextConfig = {
      header: { elements: [text('t', '{pageNumber} · Los detectives del tercer piso'), text('p', 'Editorial Cometa, Colección Lupa')] },
      checks: { contentInConfig: { allow: ['los detectives del  TERCER piso', 'Editorial Cometa', 'Colección Lupa'] } },
    };
    expect(content(config)).toEqual([]);
    // What is left beside an allowed phrase is still counted.
    const more: PostextConfig = {
      ...config,
      footer: { elements: [text('f', 'Editorial Cometa publica libros para lectores jóvenes')] },
    };
    expect(content(more).map((w) => w.path)).toEqual(['footer']);
  });

  it('finds an allowed phrase inside unspaced text', () => {
    const config: PostextConfig = {
      header: { elements: [text('t', '红楼梦第{numberHan}回题解与人物关系总览以及版本说明汇编和后记')] },
    };
    expect(content(config).map((w) => w.path)).toEqual(['header']);
    expect(content({ ...config, checks: { contentInConfig: { allow: ['红楼梦', '回题解与人物关系总览以及版本说明汇编和后记'] } } })).toEqual([]);
  });

  it('weighs the characters of unspaced scripts against maxChars', () => {
    // A title and an author in a Japanese running head pass, a sentence does not.
    expect(content({ header: { elements: [text('t', 'こころ'), text('a', '夏目漱石'), text('c', '第{chapterNumber}章')] } })).toEqual([]);
    expect(content({ header: { elements: [text('s', '先生と私は鎌倉の海で会った')] } }).map((w) => w.chars)).toEqual([13]);
  });

  it('allows the title, subtitle, author and publisher of the metadata', () => {
    const config: PostextConfig = { header: { elements: [text('t', 'Los detectives del tercer piso · {chapterTitle}'), text('a', 'Ana María Machado Fernández')] } };
    expect(content(config).map((w) => w.count)).toEqual([2]);
    const metadata = { title: 'Los detectives del tercer piso', author: 'Ana María Machado Fernández' };
    expect(collectConfigWarnings(config, { metadata }).filter((w) => w.kind === 'contentInConfig')).toEqual([]);
    const doc = buildDocument({ markdown: `---\ntitle: ${metadata.title}\nauthor: ${metadata.author}\n---\n\nTexto.` }, config);
    expect(doc.configWarnings?.filter((w) => w.kind === 'contentInConfig') ?? []).toEqual([]);
  });

  it('follows maxWords and maxChars', () => {
    const config: PostextConfig = { header: { elements: [text('t', 'Unidad didáctica {chapterNumber}'), text('u', 'Tercero')] } };
    expect(content(config)).toEqual([]);
    expect(content({ ...config, checks: { contentInConfig: { maxWords: 1 } } }).map((w) => w.count)).toEqual([1]);
    expect(content({ ...config, checks: { contentInConfig: { maxChars: 6 } } }).map((w) => w.count)).toEqual([2]);
    expect(content({ header: { elements: [text('t', 'Supercalifragilisticexpialidocious')] } }).map((w) => w.count)).toEqual([1]);
  });

  it('is off when disabled', () => {
    expect(content({ ...TEXTBOOK, checks: { contentInConfig: { enabled: false } } })).toEqual([]);
  });

  it('reports the settings of the check it cannot read', () => {
    const warnings = collectConfigWarnings({ checks: { contentInConfig: { maxWords: -1, maxChars: 2.5, allwo: ['x'] } as never } });
    expect(warnings).toEqual(expect.arrayContaining([
      { kind: 'unknownConfigValue', path: 'checks.contentInConfig.maxWords', value: '-1', used: '2' },
      { kind: 'unknownConfigValue', path: 'checks.contentInConfig.maxChars', value: '2.5', used: '24' },
      { kind: 'unknownConfigKey', path: 'checks.contentInConfig.allwo', value: 'allwo', used: '', suggestion: 'allow' },
    ]));
  });

  it('strips the defaults of the check', () => {
    expect(stripConfigDefaults({ checks: { contentInConfig: { enabled: true, maxWords: 2, maxChars: 24, allow: [] } } }).checks).toBeUndefined();
    expect(stripConfigDefaults({ checks: { contentInConfig: { maxWords: 3, allow: ['Cometa'] } } }).checks).toEqual({ contentInConfig: { maxWords: 3, allow: ['Cometa'] } });
  });

  it('lists every design slot of a config', () => {
    const slot = { elements: [] };
    const slots = configDesignSlots({
      header: slot, footer: slot, parts: { design: slot, versoDesign: slot }, toc: { parts: { design: slot } },
      headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot } }] },
      headingStyles: [{ id: 'x', header: slot, footer: slot, advancedDesign: { enabled: true, slot } }],
      htmlViewer: { overrides: { footer: slot } },
    });
    expect(slots.map((s) => [s.path, s.kind, s.owner, s.ownerId])).toEqual([
      ['header', 'header', 'header', undefined],
      ['footer', 'footer', 'footer', undefined],
      ['headings.levels[0].advancedDesign.slot', 'heading', 'headings.levels[0]', undefined],
      ['headingStyles[0].advancedDesign.slot', 'heading', 'headingStyles[0]', 'x'],
      ['headingStyles[0].header', 'header', 'headingStyles[0]', 'x'],
      ['headingStyles[0].footer', 'footer', 'headingStyles[0]', 'x'],
      ['parts.design', 'part', 'parts.design', undefined],
      ['parts.versoDesign', 'part', 'parts.versoDesign', undefined],
      ['toc.parts.design', 'tocRow', 'toc.parts.design', undefined],
      ['htmlViewer.overrides.footer', 'footer', 'htmlViewer.overrides.footer', undefined],
    ]);
  });

  it('reads the literal of a template the way the design prints it', () => {
    expect(designTextLiteral('{{x}} Chapter {chapterNumber}\\n{attr.kicker} {firstMark.word}')).toBe('{x} Chapter');
    expect(designTextLiteral('{not a placeholder}')).toBe('{not a placeholder}');
  });
});

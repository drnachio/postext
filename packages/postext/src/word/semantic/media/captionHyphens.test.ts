// Captions and notes in the semantic .docx keep their words whole unless
// their style hyphenates (#1550): Word hyphenates the document when the
// body does (`w:autoHyphenation`), so a caption paragraph style that keeps
// words whole says `w:suppressAutoHyphens`, and a type's style or a note
// that hyphenates over one that does not says `w:val="0"`.

import { describe, expect, it } from 'vitest';
import type { PostextConfig } from '../../../types.js';
import { exportDocx, exportProblems, type Exported } from '../fixtures/harness.js';

const cfg = (c: Record<string, unknown>): PostextConfig => c as unknown as PostextConfig;

/** The `w:p` that holds `text`. */
const paraOf = (xml: string, text: string): string => {
  const at = xml.indexOf(text);
  const start = xml.lastIndexOf('<w:p>', at);
  return xml.slice(start, xml.indexOf('</w:p>', at) + 6);
};

/** The `w:style` element of a style id. */
const styleOf = (e: Exported, id: string): string => {
  const xml = e.part('word/styles.xml');
  const at = xml.indexOf(`w:styleId="${id}"`);
  return at < 0 ? '' : xml.slice(at, xml.indexOf('</w:style>', at));
};

/** The paragraph style a paragraph holding `text` names. */
const styleIdOf = (e: Exported, text: string): string => /<w:pStyle w:val="([^"]+)"\/>/.exec(paraOf(e.doc, text))?.[1] ?? '';

const md = '::resource{id="t1"}\n\nAfter.\n\n::resource{id="f1"}\n\nMore.\n';
const table = { id: 't1', typeId: 'table', kind: 'table' as const, caption: 'Table cap', note: 'Table note', createdAt: 0, updatedAt: 0, table: { model: { rows: [[{ content: 'a' }, { content: 'b' }]] } } };
const figure = { id: 'f1', typeId: 'figure', kind: 'table' as const, caption: 'Figure cap', note: 'Figure note', createdAt: 0, updatedAt: 0, table: { model: { rows: [[{ content: 'x' }]] } } };
const resources = [table, figure];

describe('semantic docx: caption and note hyphenation (#1550)', () => {
  it('keeps captions and notes whole by default, in a hyphenated document', async () => {
    const e = await exportDocx(md, { resources });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.part('word/settings.xml')).toContain('<w:autoHyphenation w:val="true"/>');
    expect(styleOf(e, 'Caption')).toContain('<w:suppressAutoHyphens/>');
    // The note's style is based on Caption: it inherits the setting.
    const note = styleOf(e, styleIdOf(e, 'Figure note'));
    expect(note).toContain('<w:basedOn w:val="Caption"/>');
    expect(note).not.toContain('suppressAutoHyphens');
  });

  it('hyphenates captions and notes whose style says so', async () => {
    const e = await exportDocx(md, { resources, config: cfg({ captionStyle: { hyphenation: true, note: { hyphenation: false } } }) });
    expect(styleOf(e, 'Caption')).not.toContain('suppressAutoHyphens');
    expect(styleOf(e, styleIdOf(e, 'Figure note'))).toContain('<w:suppressAutoHyphens/>');
  });

  it('sets a type whose captions hyphenate apart from the document’s, its note too', async () => {
    const config = cfg({ resourceTypes: [{ id: 'table', name: 'Table', captionStyle: { hyphenation: true, note: { hyphenation: true } } }] });
    const e = await exportDocx(md, { resources, config });
    expect(exportProblems(e, [md])).toEqual([]);
    // The table's caption: a style of its own (only the hyphenation
    // differs), based on Caption, that turns its suppression off.
    expect(styleIdOf(e, 'Table cap')).toBe('PostextCaptiontable');
    const own = styleOf(e, 'PostextCaptiontable');
    expect(own).toContain('<w:basedOn w:val="Caption"/>');
    expect(own).toContain('<w:suppressAutoHyphens w:val="0"/>');
    // Its note hyphenates as its caption does: nothing to say.
    const tableNote = styleOf(e, styleIdOf(e, 'Table note'));
    expect(tableNote).toContain('<w:basedOn w:val="PostextCaptiontable"/>');
    expect(tableNote).not.toContain('suppressAutoHyphens');
    // The figure keeps Word's Caption and its words whole.
    expect(styleIdOf(e, 'Figure cap')).toBe('Caption');
    expect(styleOf(e, 'Caption')).toContain('<w:suppressAutoHyphens/>');
  });

  it('keeps a type’s note whole under a caption that hyphenates', async () => {
    const config = cfg({ resourceTypes: [{ id: 'table', name: 'Table', captionStyle: { hyphenation: true } }] });
    const e = await exportDocx(md, { resources, config });
    const tableNote = styleOf(e, styleIdOf(e, 'Table note'));
    expect(tableNote).toContain('<w:basedOn w:val="PostextCaptiontable"/>');
    expect(tableNote).toContain('<w:suppressAutoHyphens/>');
  });
});

// Display-list content of the formatted Word export round-trips (#1406):
// chips cut into runs in their own faces, inline code, link-note QR codes,
// video frames and overlays (turned or not), chips in table cells and a
// strip's caption; an
// unedited export reads back with no edit and a valid package, and an
// edit to a strip's generated caption is reported as rejected.

import { describe, it, expect } from 'vitest';
import type { PostextConfig, Resource } from '../../index.js';
import { validateDocxPackage } from '../ooxml/validate.js';
import { xmlProblems } from '../ooxml/wellFormed.js';
import { applyDocxEdits } from '../roundtrip/index.js';
import { editDocx } from '../roundtrip/fixture.test-helper.js';
import { typeOver } from '../integration/wordEdit.test-helper.js';
import { formattedDocx } from './index.js';
import { hasFragment, isImportable } from './fragments.js';
import { build, config, documentXml, LOREM, mm, unzip } from './formatted.test-helper.js';

const pt = (value: number) => ({ value, unit: 'pt' as const });

async function roundTrip(md: string, cfg: PostextConfig, resources?: Resource[]): Promise<string> {
  const doc = build(md, cfg, resources);
  const bytes = await formattedDocx({ docs: [doc], chapters: [{ id: 'c', markdown: md }], ...(resources ? { resources } : {}), date: '2026-11-04T00:00:00Z', exportId: 'x' });
  const files = unzip(bytes);
  const xml = documentXml(files);
  expect(validateDocxPackage(files)).toEqual([]);
  expect(xmlProblems(xml)).toEqual([]);
  const r = applyDocxEdits(bytes, { chapters: [{ id: 'c', markdown: md }] });
  expect(r.edits).toEqual([]);
  expect(r.chapters[0]!.markdown).toBe(md);
  return xml;
}

const video = (placement: Resource['placement']): Resource => ({
  id: 'talk', typeId: 'video', kind: 'video', caption: 'The talk.', createdAt: 0, updatedAt: 0,
  video: { source: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  placement,
} as Resource);

describe('display-list content round-trips through the formatted export (#1406)', () => {
  it('chips in a bold style and inline code', async () => {
    const cfg = config({ chipStyles: [{ id: 'k', fontFamily: 'Test Mono', bold: true, paddingX: pt(2), background: { hex: '#eeeeee', model: 'hex' } }] } as Partial<PostextConfig>);
    const md = `Press :chip[Enter **now**]{style=k} and run \`npm test\` before you go. ${LOREM}\n`;
    const xml = await roundTrip(md, cfg);
    // The style's bold is the face (a character style), not direct w:b.
    const enter = xml.match(/<w:r>(<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)<w:t xml:space="preserve">Ente/);
    expect(enter).not.toBeNull();
    expect(enter![1]).not.toContain('<w:b/>');
    // Its box, a plain shape (#1444), and the room before its words.
    expect(xml).toMatch(/<wps:cNvSpPr\/><wps:spPr>(?:(?!<\/wps:spPr>).)*EEEEEE/);
    expect(xml).toMatch(/<w:spacing w:val="\d+"\/>(?:(?!<\/w:r>).)*<w:t xml:space="preserve"> <\/w:t><\/w:r><w:r><w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr><w:t xml:space="preserve">Ente/);
  });

  it('an empty chip (an end mark) as a no-break space over its box (#1444)', async () => {
    const cfg = config({ chipStyles: [{ id: 'end', paddingX: pt(4), background: { hex: '#1d5470', model: 'hex' } }] } as Partial<PostextConfig>);
    const md = `${LOREM} :chip[ ]{style="end"}\n`;
    const xml = await roundTrip(md, cfg);
    // The engine's private-use stand-in never reaches a run.
    expect(xml).not.toContain('\ue1a0');
    expect(xml).toContain('1D5470');
  });

  it('a word retyped in a chip stays inside its brackets', async () => {
    const cfg = config({ chipStyles: [{ id: 'w', paddingX: pt(2) }] } as Partial<PostextConfig>);
    const md = `:::paragraphs\n:chip[GOGGLES]{style="w"} :chip[TOWEL]{style="w"} :chip[BALL]{style="w"}\n:::\n`;
    await roundTrip(md, cfg);
    const bytes = await formattedDocx({ docs: [build(md, cfg)], chapters: [{ id: 'c', markdown: md }], date: '2026-11-04T00:00:00Z', exportId: 'x' });
    const r = applyDocxEdits(editDocx(bytes, (x) => typeOver(x, 'TOWEL', 'harbour')), { chapters: [{ id: 'c', markdown: md }] });
    expect(r.chapters[0]!.markdown).toBe(md.replace('TOWEL', 'harbour'));
  });

  it('a link note’s QR code', async () => {
    const cfg = config({ links: { print: 'notes', show: 'both', qr: { size: mm(15) } } } as Partial<PostextConfig>);
    const xml = await roundTrip('You can reach [the official page](https://example.com/docs/start) for more.\n', cfg);
    expect(xml).toContain('<a:custGeom>');
  });

  it('a video, upright and turned', async () => {
    await roundTrip('Intro.\n\n::resource{id="talk"}\n', config(), [video({ position: 'here' })]);
    await roundTrip('See the talk :ref{id="talk"}.\n\nMore text.\n', config(), [video({ rotate: 'ccw' })]);
  });

  it('a chip in a table cell', async () => {
    const res = {
      id: 't1', typeId: 'table', kind: 'table', caption: 'Keys.', createdAt: 0, updatedAt: 0,
      table: { model: { headerRowCount: 1, rows: [[{ content: 'Key', isHeader: true }], [{ content: 'Press `Esc`' }]] } },
      placement: { position: 'here' },
    } as Resource;
    const xml = await roundTrip('Intro.\n\n::resource{id="t1"}\n', config(), [res]);
    expect(xml).toContain('Esc');
  });

  it('a strip’s caption', async () => {
    const md = 'Text.\n\n:::strip{width=60% caption="A *quiet* morning." type=figure id=daily}\n::panel\n::panel\n:::\n\nAfter.\n';
    const xml = await roundTrip(md, config());
    expect(xml).toMatch(/Figure(?:(?!<\/w:p>).)*quiet(?:(?!<\/w:p>).)*morning/);
  });

  it('reports an edit to a strip’s caption as rejected, not dropped', async () => {
    const md = 'Text.\n\n:::strip{width=60% caption="A *quiet* morning." type=figure id=daily}\n::panel\n::panel\n:::\n\nAfter.\n';
    const doc = build(md, config());
    const bytes = await formattedDocx({ docs: [doc], chapters: [{ id: 'c', markdown: md }], date: '2026-11-04T00:00:00Z', exportId: 'x' });
    const edited = editDocx(bytes, (x) => x.replace('quiet', 'loud').replace('After.', 'Later.'));
    const r = applyDocxEdits(edited, { chapters: [{ id: 'c', markdown: md }] });
    expect(r.chapters[0]!.markdown).toBe(md.replace('After.', 'Later.'));
    expect(r.edits).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'rejected', reason: 'generated', before: expect.stringContaining('quiet'), after: expect.stringContaining('loud') }),
      expect.objectContaining({ status: 'applied', before: 'After', after: 'Later' }),
    ]));
  });

  it('wraps generated text in a fragment only when its edits are reported', () => {
    const item = (source: object) => ({ kind: 'text', role: 'caption', bbox: { x: 0, y: 0, width: 1, height: 1 }, lines: [], source }) as Parameters<typeof hasFragment>[0];
    const repeated = item({ blockKey: 'r', map: [-1, -1], generated: true, reportEdits: true, resource: { resourceId: 't', field: 'caption' } });
    expect(isImportable(repeated)).toBe(false);
    expect(hasFragment(repeated)).toBe(true);
    expect(hasFragment(item({ blockKey: 'h', map: [-1], generated: true }))).toBe(false);
    expect(hasFragment(item({ blockKey: 'b', map: [0] }))).toBe(true);
  });
});

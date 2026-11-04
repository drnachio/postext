// Display-list content of the formatted Word export round-trips (#1406):
// chips cut into runs in their own faces, inline code, link-note QR codes,
// video frames and overlays (turned or not), chips in table cells and a
// strip's caption; an
// unedited export reads back with no edit and a valid package.

import { describe, it, expect } from 'vitest';
import type { PostextConfig, Resource } from '../../index.js';
import { validateDocxPackage } from '../ooxml/validate.js';
import { xmlProblems } from '../ooxml/wellFormed.js';
import { applyDocxEdits } from '../roundtrip/index.js';
import { formattedDocx } from './index.js';
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
    // Its box, an empty text box, and the room before its words.
    expect(xml).toMatch(/txBox="1"\/><wps:spPr>(?:(?!<\/wps:spPr>).)*EEEEEE/);
    expect(xml).toMatch(/<w:spacing w:val="\d+"\/>(?:(?!<\/w:r>).)*<w:t xml:space="preserve"> <\/w:t><\/w:r><w:r><w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr><w:t xml:space="preserve">Ente/);
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
});

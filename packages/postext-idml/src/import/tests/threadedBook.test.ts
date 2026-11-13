// A flowing book exported with its running text threaded (#1559) and read
// back: the importer finds one story through frames the size of the
// columns, picks a flowing book, and reads the paragraphs, the boxes and
// the captions as they were written.

import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import type { PostextConfig, Resource } from 'postext';
import { idmlDocument, type IdmlOptions } from '../../export/index.js';
import { build, config, LOREM, mm } from '../../testing/kit.test-helper.js';
import { rejoinParagraphs } from '../fidelity/keptThread.js';
import { idmlToPostext } from '../index.js';
import type { IdmlParagraph } from '../../model/document.js';

// A 4 × 3 PNG, the shape of the figure's frame.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEklEQVR4nGP4z8DwHwyBDAYGAAPiAf83VfZ9AAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0));
const LONG = `${LOREM} ${LOREM}`;
const MD = `# The river\n\n${LONG}\n\n${LOREM}\n\n:::callout\nThe walk starts at the old bridge and ends at the harbour.\n:::\n\n${LONG}\n\n## The harbour\n\n${LONG}\n\n${LOREM}\n\n${LONG}`;
const twoColumns = (over: Partial<PostextConfig> = {}): PostextConfig => config({ layout: { layoutType: 'double', gutterWidth: mm(5) }, ...over } as unknown as Partial<PostextConfig>);

const exported = (md: string, cfg: PostextConfig, options: Partial<IdmlOptions> = {}, resources?: Resource[]) =>
  idmlDocument({ docs: [build(md, cfg, resources)], resourceBytes: () => PNG, ...options }).bytes;
const roundTrip = (md: string, cfg: PostextConfig, options: Partial<IdmlOptions> = {}, resources?: Resource[]) => idmlToPostext(exported(md, cfg, options, resources), { layout: 'auto', linkBytes: () => PNG });
const text = (r: ReturnType<typeof roundTrip>) => r.chapters.map((c) => c.markdown).join('\n');
const ids = (r: ReturnType<typeof roundTrip>) => r.report.findings.map((f) => f.id);

describe('a flowing book exported to IDML', () => {
  it('runs its text through one story threaded through a frame per column', () => {
    const files = unzipSync(exported(MD, twoColumns()));
    const stories = Object.keys(files).filter((k) => k.startsWith('Stories/'));
    const spreads = Object.keys(files).filter((k) => k.startsWith('Spreads/')).map((k) => strFromU8(files[k]!));
    const threaded = spreads.flatMap((x) => [...x.matchAll(/<TextFrame [^>]*NextTextFrame="(u[0-9a-f]+)"/g)]);
    expect(threaded.length).toBeGreaterThan(0);
    // The body story, the box's and nothing else.
    expect(stories.length).toBeLessThanOrEqual(3);
    expect(spreads.join('')).toMatch(/<MarginPreference ColumnCount="2"/);
  });

  it('comes back as a flowing book, faithful, its paragraphs whole', () => {
    const r = roundTrip(MD, twoColumns());
    expect(r.layout).toBe('flow');
    expect(r.report.verdict).toBe('faithful');
    const md = text(r);
    expect(md).not.toMatch(/\\\n/);
    expect(md).not.toContain(':::columnbreak');
    expect(md).toContain(LONG);
    expect(md).toMatch(/^# The river/m);
    expect(md).toMatch(/^## The harbour/m);
    // The box stands after the paragraph it followed.
    const box = md.indexOf(':::callout');
    expect(box).toBeGreaterThan(md.indexOf(LOREM, md.indexOf(LONG) + LONG.length));
    expect(md.slice(box)).toContain('The walk starts at the old bridge and ends at the harbour.');
    expect(ids(r)).not.toContain('pageArtInFlow');
  });

  it('comes back as a flowing book with its lines left to InDesign too', () => {
    const r = roundTrip(MD, twoColumns(), { lineBreaks: 'reflow' });
    expect(r.report.verdict).toBe('faithful');
    expect(text(r)).toContain(LONG);
  });

  it('gives a figure its caption, the label Postext numbered it with gone', () => {
    const resources = [{ id: 'pic', typeId: 'figure', kind: 'bitmap', caption: 'The old bridge at dawn.', bitmap: { fileId: 'f-pic', format: 'png', width: 400, height: 300 }, createdAt: 0, updatedAt: 0 }] as unknown as Resource[];
    const r = roundTrip(`# The river\n\n${LONG}\n\n::resource{id="pic"}\n\n${LONG}`, twoColumns(), {}, resources);
    expect(r.resources.find((x) => x.kind === 'bitmap')?.caption).toBe('The old bridge at dawn.');
    expect(text(r)).toMatch(/::resource\{id="[^"]+"\}/);
  });

  it('comes back as the column-and-a-half book it was, its text in the main column', () => {
    const base = config();
    const half = config({ page: { ...base.page, margins: { ...base.page!.margins, mirror: true } }, layout: { layoutType: 'oneAndHalf', gutterWidth: mm(6), sideColumnPercent: 26, sideColumnRole: 'floats', sideColumnSide: 'outer' } } as unknown as Partial<PostextConfig>);
    const files = unzipSync(exported(MD, half));
    const spreads = Object.keys(files).filter((k) => k.startsWith('Spreads/')).map((k) => strFromU8(files[k]!)).join('');
    expect(spreads).toMatch(/<MarginPreference ColumnCount="2"/);
    const r = roundTrip(MD, half);
    expect(r.layout).toBe('flow');
    expect(r.report.verdict).toBe('faithful');
    const layout = r.config.layout as { layoutType?: string; sideColumnPercent?: number; sideColumnSide?: string };
    expect(layout.layoutType).toBe('oneAndHalf');
    expect(layout.sideColumnPercent).toBeCloseTo(26, 0);
    expect(layout.sideColumnSide).toBe('outer');
    expect(text(r)).toContain(LONG);
  });

  it('leaves the running heads and page numbers drawn on its pages out of the text', () => {
    const el = (id: string, edge: 'top' | 'bottom', y: number, content: string) => ({ kind: 'text', id, placement: { anchor: { to: 'page', edge }, offset: { x: mm(0), y: mm(y) }, size: { width: mm(60), height: 'auto' } }, content, fontSize: { value: 9, unit: 'pt' }, align: 'center', overflow: 'ellipsis-end' });
    const page = { ...config().page, margins: { top: mm(22), bottom: mm(22), left: mm(10), right: mm(10) } };
    const r = roundTrip(MD, twoColumns({ page, header: { elements: [el('head', 'top', 8, 'A walk by the river')] }, footer: { elements: [el('folio', 'bottom', -8, '{pageNumber}')] } } as unknown as Partial<PostextConfig>));
    expect(r.layout).toBe('flow');
    expect(text(r)).not.toContain('A walk by the river');
    expect(r.report.findings.find((f) => f.id === 'runningHeadsOnPages')?.severity).toBe('loss');
    expect(text(r)).toContain(LONG);
  });

  it('keeps a block per paragraph with `text: frames`, as composed pages', () => {
    const r = roundTrip(MD, twoColumns(), { text: 'frames' });
    expect(text(r)).toContain(':::frame');
  });
});

describe('the label of a thread', () => {
  const para = (...content: IdmlParagraph['runs'][number]['content']): IdmlParagraph => ({ attrs: {}, properties: {}, runs: [{ attrs: { NoBreak: 'true' }, properties: {}, content, conditions: [], tags: [] }] });
  const t = (text: string) => ({ kind: 'text' as const, text });
  const br = { kind: 'special' as const, char: 'forcedLineBreak' as const };

  it('joins lines at a space, inside a word and on a hyphen Postext added', () => {
    const out = rejoinParagraphs([para(t('Type'), br, t('setting is the com-'), br, t('position of'), br, t('text.'))], true, 'nhs')!;
    expect(out).toHaveLength(1);
    expect(out[0]!.runs.flatMap((r) => r.content).map((i) => (i.kind === 'text' ? i.text : '|')).join('')).toBe('Typesetting is the composition of text.');
    expect(out[0]!.runs[0]!.attrs.NoBreak).toBeUndefined();
  });

  it('joins a paragraph a column split, keeps a paragraph end and a column the author broke', () => {
    const a = { ...para(t('One and')), breakAfter: 'NextFrame' };
    const b = { ...para(t('two.')), breakAfter: 'NextFrame' };
    const c = para(t('Three.'));
    const out = rejoinParagraphs([a, b, c, para(t('Four.'))], true, 'scp')!;
    expect(out).toHaveLength(3);
    expect(out[0]!.breakAfter).toBe('NextColumn');
    expect(out[1]!.breakAfter).toBeUndefined();
  });

  it('keeps a line the author broke', () => {
    const out = rejoinParagraphs([para(t('A line'), br, t('and the next.'))], true, 'b')!;
    expect(out[0]!.runs[0]!.content.some((i) => i.kind === 'special')).toBe(true);
  });

  it('is left alone when the story no longer matches it', () => {
    expect(rejoinParagraphs([para(t('A'), br, t('B'))], true, 'ss')).toBeUndefined();
  });
});

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

/** The text of a story's Content elements, runs joined by a space and white space collapsed. */
const contentText = (xml: string): string => [...xml.matchAll(/<Content>([^<]*)<\/Content>/g)].map((m) => m[1]).join(' ').replace(/[\s\u2028]+/g, ' ');

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

  it('keeps a block per paragraph with `text: frames`, as composed pages', () => {
    const r = roundTrip(MD, twoColumns(), { text: 'frames' });
    expect(text(r)).toContain(':::frame');
  });
});

// Running heads and folios go on master spreads (#1585): the page number
// as InDesign's own, the chapter title as a running-header variable.
describe('the running heads of a flowing book exported to IDML', () => {
  const el = (id: string, edge: 'top' | 'bottom', y: number, content: string, more: Record<string, unknown> = {}) => ({ kind: 'text', id, placement: { anchor: { to: 'page', edge }, offset: { x: mm(0), y: mm(y) }, size: { width: mm(60), height: 'auto' } }, content, fontSize: { value: 9, unit: 'pt' }, align: 'center', overflow: 'ellipsis-end', ...more });
  const page = { ...config().page, margins: { top: mm(22), bottom: mm(22), left: mm(10), right: mm(10), mirror: true } };
  const withHeads = (header: unknown[], footer: unknown[], over: Record<string, unknown> = {}) => twoColumns({ page, header: { elements: header }, footer: { elements: footer }, ...over } as unknown as Partial<PostextConfig>);
  const book = withHeads([el('author', 'top', 8, 'A walk by the river', { parity: 'even' }), el('title', 'top', 8, '{chapterTitle}', { parity: 'odd' })], [el('folio', 'bottom', -8, '{pageNumber}')]);
  const masters = (files: Record<string, Uint8Array>) => Object.keys(files).filter((k) => k.startsWith('MasterSpreads/')).map((k) => strFromU8(files[k]!));

  it('are drawn on a master spread, not on the pages', () => {
    const files = unzipSync(exported(MD, book));
    const [master, ...rest] = masters(files);
    expect(rest).toHaveLength(0);
    expect(master).toMatch(/<MasterSpread [^>]*PageCount="2"/);
    const stories = Object.keys(files).filter((k) => k.startsWith('Stories/')).map((k) => strFromU8(files[k]!)).join('');
    expect(stories).toContain('<?ACE 18?>');
    expect(stories).toMatch(/<TextVariableInstance [^>]*AssociatedTextVariable="dTextVariablenChapter Title"/);
    expect(contentText(stories)).toContain('A walk by the river');
    const design = strFromU8(files['designmap.xml']!);
    expect(design).toMatch(/<TextVariable [^>]*VariableType="MatchParagraphStyleType"><MatchParagraphStylePreference AppliedParagraphStyle="ParagraphStyle\/Heading 1" SearchStrategy="LastOnPage"/);
    const spreads = Object.keys(files).filter((k) => k.startsWith('Spreads/')).map((k) => strFromU8(files[k]!)).join('');
    const self = /<MasterSpread Self="([^"]+)"/.exec(master!)![1];
    expect([...spreads.matchAll(/<Page [^>]*AppliedMaster="([^"]+)"/g)].every((m) => m[1] === self)).toBe(true);
  });

  it('come back as the book\'s header and footer, the text whole', () => {
    const r = roundTrip(MD, book);
    expect(r.layout).toBe('flow');
    expect(r.report.verdict).toBe('faithful');
    expect(ids(r)).not.toContain('runningHeadsOnPages');
    const md = text(r);
    expect(md).toContain(LONG);
    expect(md).not.toMatch(/^A walk by the river$/m);
    const header = r.config.header?.elements ?? [];
    const title = header.find((e) => e.kind === 'text' && e.content === '{chapterTitle}') as { parity?: string; align?: string } | undefined;
    expect(title?.parity).toBe('odd');
    expect(title?.align).toBe('center');
    // The words the even pages show travel with the chapter's heading.
    const author = header.find((e) => e.kind === 'text' && /^\{attr\.\w+\}$/.test(String(e.content))) as { content: string; parity?: string } | undefined;
    expect(author?.parity).toBe('even');
    expect(md).toContain(`${author!.content.slice(6, -1)}="A walk by the river"`);
    const folios = (r.config.footer?.elements ?? []).filter((e) => e.kind === 'text' && e.content === '{pageNumber}');
    expect(folios.map((e) => (e as { parity?: string }).parity).sort()).toEqual(['even', 'odd']);
  });

  it('give chapter openers a master of their own', () => {
    const chapter = (title: string) => `# ${title}\n\n${[LONG, LOREM, LONG, LONG, LONG, LONG, LONG].join('\n\n')}`;
    const cfg = withHeads([el('title', 'top', 8, '{chapterTitle}', { pages: 'body' })], [el('folio', 'bottom', -8, '{pageNumber}', { pages: 'body' }), el('openerFolio', 'bottom', -8, '{pageNumber}', { pages: 'opener' })], { headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] } });
    const md = [chapter('The river'), chapter('The harbour'), chapter('The bridge')].join('\n\n');
    expect(masters(unzipSync(exported(md, cfg))).map((m) => /BaseName="(\w+)"/.exec(m)![1]).sort()).toEqual(['Body', 'Opener']);
    const r = roundTrip(md, cfg);
    expect(r.report.verdict).toBe('faithful');
    expect(ids(r)).toContain('openerMaster');
    const folios = (r.config.footer?.elements ?? []) as { content?: string; pages?: string }[];
    expect(folios.filter((e) => e.pages === 'opener').map((e) => e.content)).toEqual(['{pageNumber}']);
    expect(folios.filter((e) => e.pages === 'body').length).toBeGreaterThan(0);
  });

  it('keep on its page a head InDesign cannot say', () => {
    const cfg = withHeads([el('place', 'top', 8, '{attr.place}')], [el('folio', 'bottom', -8, '{pageNumber}')]);
    const r = roundTrip(MD.replace('# The river', '# The river {place="Riverside"}'), cfg);
    expect(r.layout).toBe('flow');
    expect(r.report.findings.find((f) => f.id === 'runningHeadsOnPages')?.severity).toBe('loss');
    expect((r.config.footer?.elements ?? []).some((e) => e.kind === 'text' && e.content === '{pageNumber}')).toBe(true);
  });

  it('stay on the pages with `text: frames`', () => {
    const files = unzipSync(exported(MD, book, { text: 'frames' }));
    const [master, ...rest] = masters(files);
    expect(rest).toHaveLength(0);
    expect(master).not.toContain('<TextFrame');
    expect(strFromU8(files['designmap.xml']!)).not.toContain('<TextVariable ');
  });
});

// The boxes floated into the side column of a column-and-a-half book
// (glosses) are anchored in the thread at a custom position (#1585).
describe('the glosses of a column-and-a-half book exported to IDML', () => {
  const base = config();
  const half = config({
    page: { ...base.page, margins: { ...base.page!.margins, mirror: true } },
    layout: { layoutType: 'oneAndHalf', gutterWidth: mm(6), sideColumnPercent: 26, sideColumnRole: 'floats', sideColumnSide: 'outer' },
    calloutStyles: [{ id: 'gloss', name: 'Gloss', span: 'side', placement: 'here', backgroundEnabled: false, border: { enabled: false }, stripe: { enabled: true, side: 'top', width: { value: 0.5, unit: 'pt' }, color: { hex: '#a59a8b', model: 'hex' } } }],
  } as unknown as Partial<PostextConfig>);
  const GLOSSED = `# The river\n\n${LOREM}\n\n:::callout{type="gloss" title="Old bridge"}\nThe walk starts at the old bridge.\n:::\n\nThe path follows the water. ${LONG}\n\n${LOREM}\n\n:::callout{type="gloss"}\nThe harbour was rebuilt in 1850.\n:::\n\nAt the harbour the boats wait. ${LONG}\n\n${LONG}`;

  it('are anchored in the running text, where Postext set them', () => {
    const files = unzipSync(exported(GLOSSED, half));
    const stories = Object.keys(files).filter((k) => k.startsWith('Stories/')).map((k) => strFromU8(files[k]!));
    const plain = contentText;
    const thread = stories.find((x) => plain(x).includes('The path follows'))!;
    const settings = [...thread.matchAll(/<AnchoredObjectSetting [^>]*AnchoredPosition="Anchored"[^>]*>/g)].map((m) => m[0]);
    expect(settings).toHaveLength(2);
    for (const x of settings) expect(x).toMatch(/HorizontalReferencePoint="ColumnEdge"[^>]*VerticalReferencePoint="LineBaseline"/);
    expect(stories.some((x) => x !== thread && /The walk starts at\s+the old bridge\./.test(plain(x)))).toBe(true);
  });

  it('come back as floats of the side column, before the text they face', () => {
    const r = roundTrip(GLOSSED, half);
    expect(r.layout).toBe('flow');
    expect(ids(r)).not.toContain('sideStories');
    expect(r.report.findings.find((f) => f.id === 'sideColumnFloats')?.count).toBe(2);
    const md = text(r);
    const first = md.indexOf('span="side"');
    expect(md.slice(md.lastIndexOf(':::callout', first), first)).toContain('title="Old bridge"');
    expect(first).toBeGreaterThan(md.indexOf(LOREM));
    expect(first).toBeLessThan(md.indexOf('The path follows'));
    const second = md.indexOf('span="side"', first + 1);
    expect(md.slice(second, md.indexOf('At the harbour'))).toContain('The harbour was rebuilt in 1850.');
    expect(second).toBeGreaterThan(md.indexOf('The path follows'));
    expect(md).not.toContain('wrap=');
  });

  it('lay out where they stood when the book is built again', () => {
    const r = roundTrip(GLOSSED, half);
    const again = build(text(r), { ...half, calloutStyles: [...(half.calloutStyles ?? []), ...(r.config.calloutStyles ?? [])], paragraphStyles: r.config.paragraphStyles } as PostextConfig);
    const at = (doc: ReturnType<typeof build>) => doc.pages.flatMap((p, n) => (p.floats ?? []).filter((f) => f.type === 'callout').map((f) => ({ n, x: Math.round(f.bbox.x), y: Math.round(f.bbox.y) })));
    expect(at(again)).toEqual(at(build(GLOSSED, half)));
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

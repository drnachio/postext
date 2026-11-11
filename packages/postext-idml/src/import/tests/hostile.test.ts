// Packages that are wrong or built to hurt: the importer answers with a
// book and findings, in bounded time, and never with an error of its own.

import { describe, expect, it } from 'vitest';
import { frameXml, mini, referenceFiles, pack, storyXml } from '../../read/fixture.test-helper.js';
import { strFromU8, strToU8 } from 'fflate';
import { IdmlError } from '../../package/errors.js';
import { readIdml } from '../../read/index.js';
import { idmlToPostext } from '../index.js';
import { finding, markdownOf, para, plain, run } from './kit.test-helper.js';

const BOUND = process.env.CI ? 120_000 : 20_000;
const both = (bytes: Uint8Array) => (['pages', 'flow'] as const).map((layout) => idmlToPostext(bytes, { layout }));

describe('references to what is not there', () => {
  it('reads text in styles, swatches and fonts the document lacks', () => {
    const body = `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Gone"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/Gone" FillColor="Color/Gone"><Content>Orphaned text.</Content><Br/></CharacterStyleRange></ParagraphStyleRange>`;
    for (const r of both(mini({ stories: { s1: storyXml('s1', body) }, items: frameXml('f1', 's1', [36, 36, 576, 756]) }))) {
      expect(markdownOf(r)).toContain('Orphaned text.');
      expect(finding(r, 'missingSwatch')).toBeDefined();
    }
  });

  it('counts a frame whose story is missing, and a picture whose file is', () => {
    const rect = `<Rectangle Self="r1" ItemTransform="1 0 0 1 0 0"><Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray><PathPointType Anchor="50 50" LeftDirection="50 50" RightDirection="50 50"/><PathPointType Anchor="50 150" LeftDirection="50 150" RightDirection="50 150"/><PathPointType Anchor="250 150" LeftDirection="250 150" RightDirection="250 150"/><PathPointType Anchor="250 50" LeftDirection="250 50" RightDirection="250 50"/></PathPointArray></GeometryPathType></PathGeometry></Properties><Image Self="i1" ItemTransform="1 0 0 1 50 50"><Properties><GraphicBounds Left="0" Top="0" Right="200" Bottom="100"/></Properties><Link Self="l1" LinkResourceURI="file:/Volumes/Work/gone.tif"/></Image></Rectangle>`;
    for (const r of both(mini({ stories: { s1: storyXml('s1', plain('Here.')) }, items: frameXml('f1', 's1', [36, 300, 576, 756]) + frameXml('f2', 'nowhere', [36, 200, 300, 280]) + rect }))) {
      expect(markdownOf(r)).toContain('Here.');
      expect(r.missingLinks).toEqual([{ name: 'gone.tif', uri: 'file:/Volumes/Work/gone.tif', uses: 1 }]);
      expect(r.resources.find((x) => x.kind === 'svg')?.svg).toMatchObject({ width: 200, height: 100 });
    }
  });

  it('says a placed file in a format Postext does not draw', () => {
    const rect = `<Rectangle Self="r1" ItemTransform="1 0 0 1 0 0"><Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray><PathPointType Anchor="50 50" LeftDirection="50 50" RightDirection="50 50"/><PathPointType Anchor="50 150" LeftDirection="50 150" RightDirection="50 150"/><PathPointType Anchor="250 150" LeftDirection="250 150" RightDirection="250 150"/><PathPointType Anchor="250 50" LeftDirection="250 50" RightDirection="250 50"/></PathPointArray></GeometryPathType></PathGeometry></Properties><PDF Self="i1" ItemTransform="1 0 0 1 50 50"><Properties><GraphicBounds Left="0" Top="0" Right="200" Bottom="100"/></Properties><Link Self="l1" LinkResourceURI="file:/Volumes/Work/plan.pdf"/></PDF></Rectangle>`;
    const r = idmlToPostext(mini({ items: rect }), { layout: 'pages', linkBytes: () => strToU8('%PDF-1.7\n') });
    expect(finding(r, 'unsupportedPictureFormat')?.examples[0]).toContain('plan.pdf (PDF)');
    expect(r.missingLinks).toEqual([]);
  });
});

describe('structures that loop or have no size', () => {
  it('ends on styles based on each other', () => {
    const styles = `<?xml version="1.0"?><idPkg:Styles xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="21.5"><RootParagraphStyleGroup Self="rp"><ParagraphStyle Self="ParagraphStyle/A" Name="A" PointSize="11"><Properties><BasedOn type="object">ParagraphStyle/B</BasedOn></Properties></ParagraphStyle><ParagraphStyle Self="ParagraphStyle/B" Name="B" FontStyle="Bold"><Properties><BasedOn type="object">ParagraphStyle/A</BasedOn></Properties></ParagraphStyle></RootParagraphStyleGroup></idPkg:Styles>`;
    const body = `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/A"><CharacterStyleRange><Content>Looped.</Content><Br/></CharacterStyleRange></ParagraphStyleRange>`;
    const bytes = mini({ stories: { s1: storyXml('s1', body) }, items: frameXml('f1', 's1', [36, 36, 576, 756]), designmap: '<idPkg:Styles src="Resources/Styles.xml"/>', files: { 'Resources/Styles.xml': styles } });
    for (const r of both(bytes)) expect(markdownOf(r)).toContain('Looped.');
  });

  it('ends on frames threaded in a ring, and writes the story once', () => {
    const frames = frameXml('f1', 's1', [36, 36, 300, 400], 'NextTextFrame="f2" PreviousTextFrame="f3"') + frameXml('f2', 's1', [310, 36, 576, 400], 'NextTextFrame="f3" PreviousTextFrame="f1"') + frameXml('f3', 's1', [36, 410, 576, 756], 'NextTextFrame="f1" PreviousTextFrame="f2"');
    for (const r of both(mini({ stories: { s1: storyXml('s1', plain('Round and round.')) }, items: frames }))) expect(markdownOf(r).match(/Round and round\./g)).toHaveLength(1);
  });

  it('takes a frame of no size and a transform that is no number', () => {
    const items = frameXml('f0', 's0', [100, 100, 100, 100]) + frameXml('f1', 's1', [36, 36, 576, 756]) + frameXml('f2', 's2', [36, 36, 300, 300]).replace('ItemTransform="1 0 0 1 0 0"', 'ItemTransform="NaN 0 0 Infinity 0 x"');
    const bytes = mini({ stories: { s0: storyXml('s0', plain('In a frame of no size.')), s1: storyXml('s1', plain('Sound.')), s2: storyXml('s2', plain('Under a broken transform.')) }, items });
    for (const r of both(bytes)) {
      expect(markdownOf(r)).toContain('Sound.');
      expect(JSON.stringify(r.config)).not.toMatch(/NaN|Infinity|null/);
      // Nothing of the text is dropped without a finding.
      for (const t of ['In a frame of no size.', 'Under a broken transform.']) expect(markdownOf(r).includes(t) || r.report.findings.some((f) => f.examples.some((e) => e.includes(t.slice(0, 20))) || f.id === 'emptyFrameSize' || f.id === 'noGeometry'), t).toBe(true);
    }
  });

  it('ends on frames anchored in each other', () => {
    const inner = (self: string, story: string): string => `<TextFrame Self="${self}" ParentStory="${story}" ItemTransform="1 0 0 1 0 0"><Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray><PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0"/><PathPointType Anchor="0 50" LeftDirection="0 50" RightDirection="0 50"/><PathPointType Anchor="90 50" LeftDirection="90 50" RightDirection="90 50"/><PathPointType Anchor="90 0" LeftDirection="90 0" RightDirection="90 0"/></PathPointArray></GeometryPathType></PathGeometry></Properties></TextFrame>`;
    const story = (text: string, anchored: string): string => para(`<CharacterStyleRange><Content>${text}</Content>${anchored}</CharacterStyleRange>`);
    const bytes = mini({ stories: { s1: storyXml('s1', story('Host.', inner('a1', 's2'))), s2: storyXml('s2', story('Guest.', inner('a2', 's2'))) }, items: frameXml('f1', 's1', [36, 36, 576, 756]) });
    for (const r of both(bytes)) {
      expect(markdownOf(r)).toContain('Host.');
      expect(finding(r, 'deepAnchoring')).toBeDefined();
    }
  });
});

describe('size', () => {
  it('imports 50 000 paragraphs in bounded time', () => {
    const one = plain('A paragraph of the long story that ends in a full stop.');
    const title = para(run('Chapter', 'PointSize="20" FontStyle="Bold"'));
    let body = '';
    for (let n = 0; n < 50; n++) body += title + one.repeat(999);
    const bytes = mini({ stories: { s1: storyXml('s1', body) }, items: frameXml('f1', 's1', [36, 36, 576, 756]) });
    const doc = readIdml(bytes);
    const t = Date.now();
    const flow = idmlToPostext(doc, { layout: 'flow' });
    const pages = idmlToPostext(doc, { layout: 'pages' });
    expect(Date.now() - t).toBeLessThan(BOUND);
    expect(flow.report.counts.paragraphs).toBe(50_000);
    expect(flow.chapters).toHaveLength(50);
    expect(pages.report.counts.paragraphs).toBe(50_000);
  }, BOUND * 2);
});

describe('what is no IDML', () => {
  it('throws the reader\'s typed error and nothing else', () => {
    expect(() => idmlToPostext(strToU8('not a zip'))).toThrow(IdmlError);
    expect(() => idmlToPostext(pack({ 'designmap.xml': '<Document' }))).toThrow(IdmlError);
  });

  it('still gives a book when parts of the reference are missing or broken', () => {
    const files = referenceFiles();
    for (const name of Object.keys(files)) {
      if (/^Resources\/(Styles|Graphic|Fonts|Preferences)\.xml$/.test(name)) delete files[name];
      else if (/^Stories\//.test(name) && strFromU8(files[name]!).length % 3 === 0) delete files[name];
    }
    for (const r of both(pack(files))) {
      expect(r.chapters.length).toBeGreaterThan(0);
      expect(r.report.findings.some((f) => f.id.startsWith('reader.'))).toBe(true);
    }
  });
});

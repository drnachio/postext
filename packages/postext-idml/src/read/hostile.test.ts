// Input that is not what it says, broken, or built to hurt: the reader
// answers with a typed error or a document with warnings, in bounded
// time, and never with an error of the runtime's own.

import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { IdmlError } from '../package/errors.js';
import { inspectIdml } from '../resolve/inspect.js';
import { readingOrder } from '../resolve/order.js';
import { computeStyle } from '../resolve/styles.js';
import { frameXml, mini, pack, paragraph, referenceBytes, referenceFiles, storyXml } from './fixture.test-helper.js';
import { readIdml } from './index.js';
import { plainText } from './story.js';

/** The code of the typed error `run` throws; fails on any other throw. */
function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (e) {
    if (e instanceof IdmlError) return e.code;
    throw e;
  }
  return undefined;
}

function errorOf(run: () => unknown): IdmlError {
  try {
    run();
  } catch (e) {
    if (e instanceof IdmlError) return e;
    throw e;
  }
  throw new Error('nothing was thrown');
}

// A workstation reads each of these in well under a second; a busy one
// or a small CI runner is many times slower. The bound is there to catch
// a reader that stopped being linear (which would take minutes), not to
// time it.
const BOUND = process.env.CI ? 60_000 : 10_000;

describe('what is not an IDML package', () => {
  it('names bytes that are no zip', () => {
    expect(codeOf(() => readIdml(strToU8('this is a text file, not an archive at all')))).toBe('notZip');
    expect(codeOf(() => readIdml(new Uint8Array(0)))).toBe('notZip');
    expect(codeOf(() => readIdml(new Uint8Array(4096)))).toBe('notZip');
    expect(codeOf(() => readIdml(new ArrayBuffer(8)))).toBe('notZip');
  });

  it('names an InDesign document by its signature', () => {
    const indd = new Uint8Array(4096);
    indd.set([0x06, 0x06, 0xed, 0xf5, 0xd8, 0x1d, 0x46, 0xe5, 0xbd, 0x31, 0xef, 0xe7, 0xfe, 0x74, 0xb7, 0x1d]);
    const e = errorOf(() => readIdml(indd));
    expect(e.code).toBe('indd');
    expect(e.message).toMatch(/IDML/);
  });

  it('names a zip without a designmap, and other packages by what they are', () => {
    expect(codeOf(() => readIdml(zipSync({ 'readme.txt': strToU8('hello') })))).toBe('notIdml');
    expect(codeOf(() => readIdml(zipSync({ 'word/document.xml': strToU8('<w:document/>') })))).toBe('notIdml');
    expect(codeOf(() => readIdml(pack({ 'designmap.xml': '<Document/>' }, 'application/epub+zip')))).toBe('notIdml');
  });

  it('answers a truncated package with a typed error, wherever it is cut', () => {
    const whole = referenceBytes();
    for (const keep of [23, 100, 1000, Math.floor(whole.length / 2), whole.length - 100, whole.length - 23, whole.length - 1]) {
      const code = codeOf(() => readIdml(whole.slice(0, keep)));
      expect(['notZip', 'notIdml', 'malformed']).toContain(code);
    }
  });

  it('reads a package zipped again by hand, without its mimetype', () => {
    const files = referenceFiles();
    delete files.mimetype;
    const doc = readIdml(zipSync(files));
    expect(doc.stories.size).toBe(18);
  });
});

describe('parts that are missing or leave the package', () => {
  it('reads on when the designmap names stories the package lacks', () => {
    const doc = readIdml(mini({ stories: { ua: storyXml('ua', paragraph('Here.')) }, alsoNamed: ['Stories/Story_gone.xml', 'Stories/Story_gone2.xml'] }));
    expect(doc.stories.size).toBe(1);
    const missing = doc.warnings.filter((w) => w.code === 'missingPart');
    expect(missing.map((w) => w.part)).toEqual(['Stories/Story_gone.xml', 'Stories/Story_gone2.xml']);
    expect(() => readingOrder(doc)).not.toThrow();
  });

  it('uses defaults, and says so, when a resource part is missing', () => {
    const doc = readIdml(mini({ designmap: '<idPkg:Styles src="Resources/Styles.xml"/>' }));
    expect(doc.warnings.filter((w) => w.code === 'missingResource')).toHaveLength(4);
    expect(doc.warnings.find((w) => w.part === 'Resources/Styles.xml')).toBeDefined();
    expect(doc.styles.paragraph.size).toBe(0);
    expect(doc.swatches.size).toBe(0);
    expect(doc.preferences).toMatchObject({ pageWidth: 612, pageHeight: 792, facingPages: false });
    expect(doc.spreads[0]!.pages[0]!.side).toBe('single');
    expect(() => computeStyle(doc, 'paragraph', 'ParagraphStyle/None')).not.toThrow();
  });

  it('warns of one missing spread and fails when none of them is there', () => {
    const files = referenceFiles();
    delete files['Spreads/Spread_ucf.xml'];
    const doc = readIdml(zipSync(files));
    expect(doc.spreads).toHaveLength(2);
    expect(doc.warnings.map((w) => [w.code, w.part])).toContainEqual(['missingPart', 'Spreads/Spread_ucf.xml']);
    // The story that started on the lost spread is still there.
    expect(readingOrder(doc).find((e) => e.story.self === 'u17e')!.frames.map((f) => f.item.self)).toEqual(['u1a8', 'u1bf']);
    for (const name of Object.keys(files)) if (name.startsWith('Spreads/')) delete files[name];
    const e = errorOf(() => readIdml(zipSync(files)));
    expect(e.code).toBe('missingPart');
    expect(e.part).toBe('Spreads/Spread_ucf.xml');
  });

  it('refuses a part named outside the package', () => {
    const e = errorOf(() => readIdml(mini({ designmap: '<idPkg:Story src="../../etc/passwd"/>' })));
    expect(e.code).toBe('unsafePath');
    expect(codeOf(() => readIdml(mini({ designmap: '<idPkg:Graphic src="/etc/hosts"/>' })))).toBe('unsafePath');
    expect(codeOf(() => readIdml(mini({ designmap: '<idPkg:Spread src="C:\\x.xml"/>' })))).toBe('unsafePath');
  });

  it('does not take an entry named ../../x for a file of the package', () => {
    const doc = readIdml(mini({ files: { '../../x': 'escape', '/abs.bin': 'abs', 'Links/pic.png': new Uint8Array([1, 2, 3]), 'Links/../../y.bin': 'escape' } }));
    expect([...doc.files.keys()]).toEqual(['Links/pic.png']);
    expect(doc.files.get('Links/pic.png')).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('XML that is broken', () => {
  it('names a designmap that is no XML, or no document', () => {
    for (const designmap of ['', 'not xml at all', '<<<>>>', '<NotADocument/>', '\u0000\u0001\u0002']) {
      const e = errorOf(() => readIdml(pack({ 'designmap.xml': designmap })));
      expect(e.code).toBe('malformed');
      expect(e.part).toBe('designmap.xml');
    }
  });

  it('reads what it can of a story with unclosed tags', () => {
    const broken = '<?xml version="1.0"?><idPkg:Story><Story Self="ua"><ParagraphStyleRange><CharacterStyleRange><Content>Kept text</Content><Br/><Content>cut he';
    const doc = readIdml(mini({ stories: { ua: broken }, items: frameXml('f1', 'ua', [36, 36, 300, 300]) }));
    expect(plainText(doc.stories.get('ua')!.paragraphs)).toBe('Kept text\ncut he');
    // Tags closed in the wrong order, attributes without an end.
    for (const body of ['<Story Self="ub"><ParagraphStyleRange><Content>a</CharacterStyleRange></Story>', '<Story Self="ub" Broken="><ParagraphStyleRange/>', '<Story Self="ub"><Content>a</Content></Story></Story></x>']) {
      expect(codeOf(() => inspectIdml(readIdml(mini({ stories: { ub: `<idPkg:Story>${body}</idPkg:Story>` } }))))).toBeUndefined();
    }
  });

  it('says so of a story part that holds no story', () => {
    const doc = readIdml(mini({ stories: { ua: '<idPkg:Story><Nothing/></idPkg:Story>' } }));
    expect(doc.stories.size).toBe(0);
    expect(doc.warnings.map((w) => [w.code, w.part])).toContainEqual(['emptyPart', 'Stories/Story_ua.xml']);
    expect(codeOf(() => readIdml(mini({ stories: { ua: 'plain words' } })))).toBe('malformed');
  });

  it('answers ten thousand nested elements with a typed error, not a stack overflow', () => {
    const deep = `<idPkg:Story><Story Self="ua">${'<XMLElement Self="x" MarkupTag="XMLTag/a">'.repeat(10_000)}<Content>deep</Content>${'</XMLElement>'.repeat(10_000)}</Story></idPkg:Story>`;
    const e = errorOf(() => readIdml(mini({ stories: { ua: deep } })));
    expect(e.code).toBe('malformed');
    expect(e.part).toBe('Stories/Story_ua.xml');
    // The same in a spread (groups in groups) and in the designmap.
    const groups = `<idPkg:Spread><Spread Self="us">${'<Group Self="g">'.repeat(10_000)}${'</Group>'.repeat(10_000)}</Spread></idPkg:Spread>`;
    expect(errorOf(() => readIdml(mini({ files: { 'Spreads/Spread_us.xml': groups } }))).part).toBe('Spreads/Spread_us.xml');
    const marks = `<Document Self="d">${'<Bookmark Name="b">'.repeat(10_000)}${'</Bookmark>'.repeat(10_000)}</Document>`;
    expect(errorOf(() => readIdml(pack({ 'designmap.xml': marks }))).part).toBe('designmap.xml');
  });

  it('reads nesting within the limit, and takes a limit of its own', () => {
    const nested = (n: number) => `<idPkg:Story><Story Self="ua"><ParagraphStyleRange><CharacterStyleRange>${'<XMLElement Self="x" MarkupTag="XMLTag/a">'.repeat(n)}<Content>deep</Content>${'</XMLElement>'.repeat(n)}</CharacterStyleRange></ParagraphStyleRange></Story></idPkg:Story>`;
    const doc = readIdml(mini({ stories: { ua: nested(200) } }));
    expect(doc.stories.get('ua')!.paragraphs[0]!.runs[0]!.tags).toHaveLength(200);
    expect(codeOf(() => readIdml(mini({ stories: { ua: nested(200) } }), { maxDepth: 50 }))).toBe('malformed');
  });

  it('reads a huge attribute in linear time', () => {
    const huge = 'x'.repeat(5 * 1024 * 1024);
    const start = performance.now();
    const doc = readIdml(mini({ stories: { ua: storyXml('ua', `<ParagraphStyleRange Label="${huge}"><CharacterStyleRange><Content>ok</Content></CharacterStyleRange></ParagraphStyleRange>`) } }));
    expect(performance.now() - start).toBeLessThan(BOUND);
    expect(doc.stories.get('ua')!.paragraphs[0]!.attrs.Label).toHaveLength(huge.length);
    // An attribute that never ends is not an element: the text after it
    // is not read as one either.
    const open = readIdml(mini({ stories: { ua: storyXml('ua', `<ParagraphStyleRange Label="${huge}`) } }));
    expect(open.stories.get('ua')!.paragraphs).toEqual([]);
  });

  it('does not expand entities a DOCTYPE declares', () => {
    const bomb =
      '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol1 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;"><!ENTITY lol2 "&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;&lol1;">' +
      '<!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;"><!ENTITY xxe SYSTEM "file:///etc/passwd">]>' +
      `<idPkg:Story><Story Self="ua"><ParagraphStyleRange><CharacterStyleRange><Content>${'&lol3;'.repeat(1000)}&xxe;&amp;&#65;&#x42;&#0;&#xD800;&#99999999;</Content></CharacterStyleRange></ParagraphStyleRange></Story></idPkg:Story>`;
    const start = performance.now();
    const doc = readIdml(mini({ stories: { ua: bomb } }));
    expect(performance.now() - start).toBeLessThan(BOUND);
    const text = plainText(doc.stories.get('ua')!.paragraphs);
    // Unknown entities stay as written; the five of XML and character
    // references are read; nothing grows.
    expect(text.length).toBeLessThan(7000);
    expect(text).toContain('&lol3;');
    expect(text).toContain('&xxe;&AB');
    expect(text).not.toMatch(/lollol|root:/);
  });

  it('stays linear on a million unmatched angle brackets', () => {
    const start = performance.now();
    for (const junk of ['<'.repeat(1_000_000), '<a '.repeat(300_000), '<!--'.repeat(250_000), '<![CDATA['.repeat(100_000), '<?'.repeat(500_000), '</x>'.repeat(250_000), '&'.repeat(1_000_000), '<a b="'.repeat(150_000)]) {
      const code = codeOf(() => readIdml(mini({ stories: { ua: `<idPkg:Story><Story Self="ua"><Content>${junk}` } })));
      expect([undefined, 'malformed']).toContain(code);
    }
    expect(performance.now() - start).toBeLessThan(BOUND * 2);
  });
});

describe('documents that are large or contradict themselves', () => {
  it('reads a 5 MB story of repeated Content in bounded time', () => {
    const piece = '<Content>Lorem ipsum dolor sit amet, </Content>';
    const count = Math.ceil((5 * 1024 * 1024) / piece.length);
    // One paragraph every hundred pieces.
    const block = `${piece.repeat(100)}<Br/>`;
    const body = `<ParagraphStyleRange><CharacterStyleRange>${block.repeat(Math.ceil(count / 100))}</CharacterStyleRange></ParagraphStyleRange>`;
    expect(body.length).toBeGreaterThan(5 * 1024 * 1024);
    const bytes = mini({ stories: { ua: storyXml('ua', body) }, items: frameXml('f1', 'ua', [36, 36, 576, 756]) });
    const start = performance.now();
    const doc = readIdml(bytes);
    const summary = inspectIdml(doc);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(BOUND);
    const story = doc.stories.get('ua')!;
    expect(story.paragraphs).toHaveLength(Math.ceil(count / 100));
    // Adjacent pieces of a run are one text.
    expect(story.paragraphs[0]!.runs).toHaveLength(1);
    expect(story.paragraphs[0]!.runs[0]!.content).toHaveLength(1);
    expect(summary.characters).toBe(Math.ceil(count / 100) * 100 * 'Lorem ipsum dolor sit amet, '.length);
    expect(summary.mainStory?.self).toBe('ua');
  });

  it('keeps the first of two stories with one Self, and says so', () => {
    const doc = readIdml(
      mini({
        stories: { ua: storyXml('ua', paragraph('First.')) },
        alsoNamed: ['Stories/Story_twin.xml'],
        files: { 'Stories/Story_twin.xml': storyXml('ua', paragraph('Second.')) },
      }),
    );
    expect(doc.stories.size).toBe(1);
    expect(plainText(doc.stories.get('ua')!.paragraphs)).toBe('First.');
    expect(doc.warnings.map((w) => [w.code, w.part])).toEqual([['missingResource', undefined], ['missingResource', undefined], ['missingResource', undefined], ['missingResource', undefined], ['duplicateId', 'Stories/Story_twin.xml']]);
  });

  it('reads items, swatches and styles whose Self is written twice', () => {
    const graphic = '<idPkg:Graphic><Color Self="Color/A" Name="A" Model="Process" Space="RGB" ColorValue="1 2 3"/><Color Self="Color/A" Name="A" Model="Process" Space="RGB" ColorValue="9 9 9"/></idPkg:Graphic>';
    const styles = '<idPkg:Styles><RootParagraphStyleGroup Self="r"><ParagraphStyle Self="ParagraphStyle/A" Name="A" PointSize="9"/><ParagraphStyle Self="ParagraphStyle/A" Name="A" PointSize="30"/></RootParagraphStyleGroup></idPkg:Styles>';
    const doc = readIdml(
      mini({
        designmap: '<idPkg:Graphic src="Resources/Graphic.xml"/><idPkg:Styles src="Resources/Styles.xml"/>',
        files: { 'Resources/Graphic.xml': graphic, 'Resources/Styles.xml': styles },
        stories: { ua: storyXml('ua', paragraph('A.')), ub: storyXml('ub', paragraph('B.')) },
        items: frameXml('same', 'ua', [36, 36, 300, 100]) + frameXml('same', 'ub', [36, 200, 300, 300]),
      }),
    );
    expect(doc.warnings.filter((w) => w.code === 'duplicateId').map((w) => w.part)).toEqual(['Resources/Graphic.xml', 'Resources/Styles.xml']);
    expect(doc.swatches.get('Color/A')).toMatchObject({ value: [1, 2, 3] });
    expect(doc.styles.paragraph.get('ParagraphStyle/A')!.attrs.PointSize).toBe('9');
    // Both frames are on the spread; both stories are in the order.
    expect(doc.spreads[0]!.items).toHaveLength(2);
    expect(readingOrder(doc).map((e) => [e.story.self, e.flags.unplaced])).toEqual([['ua', false], ['ub', true]]);
  });

  it('ends on text frames threaded in a ring', () => {
    const ring = (self: string, prev: string, next: string, top: number) => frameXml(self, 'ua', [36, top, 300, top + 80], `PreviousTextFrame="${prev}" NextTextFrame="${next}"`);
    const doc = readIdml(
      mini({
        stories: { ua: storyXml('ua', paragraph('Round and round.')), ub: storyXml('ub', paragraph('Itself.')) },
        items: ring('f1', 'f3', 'f2', 36) + ring('f2', 'f1', 'f3', 136) + ring('f3', 'f2', 'f1', 236) + frameXml('g1', 'ub', [36, 400, 300, 450], 'PreviousTextFrame="g1" NextTextFrame="g1"'),
      }),
    );
    const order = readingOrder(doc);
    expect(order.map((e) => [e.story.self, e.frames.map((f) => f.item.self)])).toEqual([['ua', ['f1', 'f2', 'f3']], ['ub', ['g1']]]);
    expect(inspectIdml(doc).mainStory).toMatchObject({ self: 'ua', frames: 3 });
  });

  it('follows a thread that names frames that are not there', () => {
    const doc = readIdml(
      mini({
        stories: { ua: storyXml('ua', paragraph('Text.')) },
        items: frameXml('f2', 'ua', [36, 300, 300, 400], 'PreviousTextFrame="f1" NextTextFrame="ghost"') + frameXml('f1', 'ua', [36, 36, 300, 136], 'PreviousTextFrame="phantom" NextTextFrame="f2"'),
      }),
    );
    expect(readingOrder(doc)[0]!.frames.map((f) => f.item.self)).toEqual(['f1', 'f2']);
  });

  it('ends on styles based on each other, and on swatches that are tints of each other', () => {
    const styles =
      '<idPkg:Styles><RootParagraphStyleGroup Self="r">' +
      '<ParagraphStyle Self="ParagraphStyle/A" Name="A" PointSize="9"><Properties><BasedOn type="object">ParagraphStyle/B</BasedOn></Properties></ParagraphStyle>' +
      '<ParagraphStyle Self="ParagraphStyle/B" Name="B" FontStyle="Bold"><Properties><BasedOn type="object">ParagraphStyle/A</BasedOn></Properties></ParagraphStyle>' +
      '<ParagraphStyle Self="ParagraphStyle/C" Name="C"><Properties><BasedOn type="object">ParagraphStyle/C</BasedOn></Properties></ParagraphStyle>' +
      '</RootParagraphStyleGroup></idPkg:Styles>';
    const graphic = '<idPkg:Graphic><Tint Self="Tint/A" Name="A" BaseColor="Tint/B" TintValue="50"/><Tint Self="Tint/B" Name="B" BaseColor="Tint/A" TintValue="50"/><Gradient Self="Gradient/G" Name="G" Type="Linear"><GradientStop StopColor="Gradient/G" Location="0"/></Gradient></idPkg:Graphic>';
    const doc = readIdml(mini({ designmap: '<idPkg:Graphic src="Resources/Graphic.xml"/><idPkg:Styles src="Resources/Styles.xml"/>', files: { 'Resources/Graphic.xml': graphic, 'Resources/Styles.xml': styles } }));
    expect(computeStyle(doc, 'paragraph', 'ParagraphStyle/A').attrs).toMatchObject({ PointSize: '9', FontStyle: 'Bold' });
    expect(doc.styles.paragraph.get('ParagraphStyle/C')!.basedOn).toBeUndefined();
    expect(codeOf(() => inspectIdml(doc))).toBeUndefined();
  });

  it('ends on stories anchored in each other', () => {
    const anchoring = (self: string, other: string) => storyXml(self, `<ParagraphStyleRange><CharacterStyleRange><Content>${self}</Content>${frameXml(`f${self}`, other, [0, 0, 50, 50])}</CharacterStyleRange></ParagraphStyleRange>`);
    const doc = readIdml(mini({ stories: { ua: anchoring('ua', 'ub'), ub: anchoring('ub', 'ua'), uc: anchoring('uc', 'uc') } }));
    const order = readingOrder(doc);
    const seen = new Set<string>();
    const stack = [...order];
    while (stack.length) {
      const e = stack.pop()!;
      if (seen.has(e.story.self)) continue;
      seen.add(e.story.self);
      for (const a of e.anchored) stack.push(a.entry);
    }
    expect([...seen].sort()).toEqual(['ua', 'ub', 'uc']);
    expect(inspectIdml(doc).stories).toBe(3);
  });

  it('never lets an untyped error out, whatever is done to the parts', () => {
    // The reference package with one part damaged at a time: cut short,
    // a stretch removed, a stretch doubled, bytes replaced. Seeded, so a
    // failure can be found again.
    let seed = 0x2f6e2b1;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const files = referenceFiles();
    const names = Object.keys(files).filter((n) => n.endsWith('.xml'));
    const outcomes = new Set<string>();
    for (let round = 0; round < 40; round++) {
      const name = names[Math.floor(random() * names.length)]!;
      const original = files[name]!;
      const at = Math.floor(random() * original.length);
      const span = 1 + Math.floor(random() * Math.min(2000, original.length - at));
      let damaged: Uint8Array;
      switch (round % 4) {
        case 0: damaged = original.slice(0, at); break;
        case 1: damaged = new Uint8Array([...original.slice(0, at), ...original.slice(at + span)]); break;
        case 2: damaged = new Uint8Array([...original.slice(0, at + span), ...original.slice(at)]); break;
        default: {
          damaged = original.slice();
          for (let i = 0; i < Math.min(span, 40); i++) damaged[at + i] = '<>"&/= \u0000'.charCodeAt(Math.floor(random() * 9));
        }
      }
      const code = codeOf(() => {
        const doc = readIdml(zipSync({ ...files, [name]: damaged }, { level: 0 }));
        readingOrder(doc);
        inspectIdml(doc);
      });
      outcomes.add(code ?? 'read');
    }
    for (const o of outcomes) expect(['read', 'malformed', 'missingPart', 'unsafePath']).toContain(o);
  }, 120_000);
});

import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline/index.js';
import { resolveAllConfig } from '../pipeline/config.js';
import { parseTocLevelsAttr, tocKeepOf } from '../pipeline/contents/toc.js';
import { resolveTocConfig, stripTocDefaults } from '../defaults/toc.js';
import { resolveBodyTextConfig } from '../defaults/bodyText.js';
import { collectConfigWarnings } from '../configWarnings.js';
import { formatWarning } from '../pipeline/contentWarnings.js';
import type { PostextConfig } from '../types.js';
import type { VDTDocument } from '../vdt.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });

const base: PostextConfig = {
  page: {
    width: pt(360),
    height: pt(260),
    margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) },
  },
  layout: { layoutType: 'single' },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
  headingStyles: [{ id: 'front', numbered: false }],
};

const withToc = (toc: PostextConfig['toc'], extra: PostextConfig = {}): PostextConfig => ({ ...base, ...extra, toc });

const part = (n: string, title: string, chapters: number, sections = 0) => `:::part{number="${n}" title="${title}"}
:::

${Array.from({ length: chapters }, (_, i) => `# ${title} chapter ${i + 1}\n\nText.${Array.from({ length: sections }, (_, j) => `\n\n## ${title} ${i + 1}.${j + 1}\n\nText.`).join('')}`).join('\n\n')}`;

type Parts = [string, string, number, number?][];
const SHORT: Parts = [['I', 'Alpha', 3], ['II', 'Beta', 5], ['III', 'Gamma', 4]];
const TALL: Parts = [['I', 'Alpha', 3], ['II', 'Beta', 30], ['III', 'Gamma', 2]];

const book = (toc = ':::toc', parts: Parts = SHORT) => `# Contents {style="front" toc="false"}

${toc}

${parts.map(([n, t, c, s]) => part(n, t, c, s)).join('\n\n')}`;

/** The contents rows of `doc`, as `page:text` (`P` marks a part row). */
const rows = (doc: VDTDocument): string[] => {
  const out: string[] = [];
  for (const page of doc.pages) {
    for (const c of page.columns) {
      for (const b of c.blocks) {
        if (b.tocPart) out.push(`${page.index}:P ${b.tocPart.title}`);
        else if (b.tocEntry) out.push(`${page.index}:${b.lines.map((l) => l.text).join(' ')}`);
      }
    }
  }
  return out;
};
const pageOf = (r: string[], text: string): number => Number(r.find((x) => x.endsWith(text) || x.includes(`${text} `))!.split(':')[0]);
const splits = (d: VDTDocument) => (d.contentWarnings ?? []).filter((w) => w.kind === 'tocGroupSplit');

describe('toc.groups (#850)', () => {
  it('changes nothing when the blocks are not kept together', () => {
    const plain = buildDocument({ markdown: book() }, base);
    const off = buildDocument({ markdown: book() }, withToc({ groups: { keepTogether: false, head: 1, minEntriesAfterHead: 5 } }));
    expect(rows(off)).toEqual(rows(plain));
    // The plain contents cuts Gamma between its two pages.
    expect(pageOf(rows(plain), 'P Gamma')).toBe(0);
    expect(pageOf(rows(plain), 'Gamma chapter 4')).toBe(1);
    expect(splits(plain)).toEqual([]);
  });

  it('moves a block that does not fit to the next page whole, with its head row', () => {
    for (const doc of [
      buildDocument({ markdown: book(':::toc{keep="part"}') }, base),
      buildDocument({ markdown: book() }, withToc({ groups: { keepTogether: true } })),
    ]) {
      const r = rows(doc);
      expect(pageOf(r, 'P Beta')).toBe(0);
      expect(pageOf(r, 'Beta chapter 5')).toBe(0);
      expect(pageOf(r, 'P Gamma')).toBe(1);
      for (let i = 1; i <= 4; i++) expect(pageOf(r, `Gamma chapter ${i}`)).toBe(1);
      expect(r.some((x) => x.includes('(cont.)'))).toBe(false);
      expect(splits(doc)).toEqual([]);
    }
  });

  it('moves a block to the next column of the page', () => {
    const two: PostextConfig = { ...base, page: { ...base.page!, width: pt(520) }, layout: { layoutType: 'double' } };
    const colOf = (doc: VDTDocument, text: string): string => {
      for (const page of doc.pages) for (const c of page.columns) for (const b of c.blocks) {
        const t = b.tocPart ? `P ${b.tocPart.title}` : b.lines.map((l) => l.text).join(' ');
        if (b.contentIndex !== undefined && (b.tocPart || b.tocEntry) && t.startsWith(text)) return `${page.index}:${c.index}`;
      }
      return '';
    };
    const parts: Parts = [['I', 'Alpha', 8], ['II', 'Beta', 8], ['III', 'Gamma', 8]];
    const plain = buildDocument({ markdown: book(':::toc', parts) }, two);
    const kept = buildDocument({ markdown: book(':::toc{keep="part"}', parts) }, two);
    const cut = ['Alpha', 'Beta', 'Gamma'].find((t) => colOf(plain, `P ${t}`) !== colOf(plain, `${t} chapter 8`));
    expect(cut).toBeDefined();
    for (const t of ['Alpha', 'Beta', 'Gamma']) {
      for (let i = 1; i <= 8; i++) expect(colOf(kept, `${t} chapter ${i}`), `${t} ${i}`).toBe(colOf(kept, `P ${t}`));
    }
    expect(splits(kept)).toEqual([]);
  });

  it('cuts a block taller than a page, repeating its head row with the mark on every page it goes on to', () => {
    const doc = buildDocument({ markdown: book(':::toc{keep="part"}', TALL) }, base);
    const r = rows(doc);
    // Beta starts under Alpha: a tall block keeps its head with two
    // entries, and the head with two entries fits there.
    expect(pageOf(r, 'P Beta')).toBe(0);
    const cont = r.filter((x) => x.includes('Beta (cont.)'));
    expect(cont.length).toBe(2);
    // Each repeat opens its page, and the entries go on under it in order.
    for (const c of cont) {
      const page = c.split(':')[0];
      expect(r.find((x) => x.startsWith(`${page}:`))).toBe(c);
    }
    expect(r.filter((x) => /Beta chapter \d+ /.test(x)).length).toBe(30);
    const w = splits(doc);
    expect(w).toEqual([expect.objectContaining({ kind: 'tocGroupSplit', title: 'Beta', columns: 3, pageIndex: 0 })]);
    expect(formatWarning(w[0]!)).toContain('"Beta"');
    // EPUB and the other readings leave the repeats out.
    const continued = doc.blocks.filter((b) => b.tocPart?.continued);
    expect(continued.length).toBe(2);
    expect(continued.every((b) => b.tocPart!.pageLabel === '')).toBe(true);
  });

  it('keeps minEntriesAfterHead entries with the head of a cut block', () => {
    const doc = buildDocument({ markdown: book(':::toc{keep="part"}', TALL) }, withToc({ groups: { minEntriesAfterHead: 12 } }));
    const r = rows(doc);
    // Head and twelve entries do not fit under Alpha: the head moves on.
    expect(pageOf(r, 'P Beta')).toBe(1);
    expect(r.find((x) => x.startsWith('1:'))).toBe('1:P Beta');
  });

  it('sets the continuation mark from the config or the language, or no repeat at all', () => {
    const fr = rows(buildDocument({ markdown: book(':::toc{keep="part"}', TALL) }, { ...base, locale: 'fr' }));
    expect(fr.some((x) => x.endsWith('Beta (suite)'))).toBe(true);
    const own = rows(buildDocument({ markdown: book(':::toc{keep="part"}', TALL) }, withToc({ groups: { continuation: { mark: '— continued' } } })));
    expect(own.some((x) => x.endsWith('Beta — continued'))).toBe(true);
    const none = buildDocument({ markdown: book(':::toc{keep="part"}', TALL) }, withToc({ groups: { continuation: { enabled: false } } }));
    expect(rows(none).some((x) => x.includes('Beta ('))).toBe(false);
    expect(rows(none).filter((x) => x.includes('P Beta')).length).toBe(1);
    expect(splits(none).length).toBe(1);
  });

  it('lets the directive override the config: keep="none", keep="1" with levels="1-2"', () => {
    const plain = rows(buildDocument({ markdown: book() }, base));
    const none = rows(buildDocument({ markdown: book(':::toc{keep="none"}') }, withToc({ groups: { keepTogether: true } })));
    expect(none).toEqual(plain);

    const parts: Parts = [['I', 'Alpha', 2, 2], ['II', 'Beta', 3, 2]];
    const flat = rows(buildDocument({ markdown: book(':::toc{levels="1-2"}', parts) }, base));
    expect(flat.some((x) => x.includes('Alpha 1.2'))).toBe(true);
    const kept = rows(buildDocument({ markdown: book(':::toc{keep="1" levels="1-2"}', parts) }, base));
    // Every chapter stands on the page of its sections.
    for (const [, t, c] of parts) {
      for (let i = 1; i <= c; i++) {
        const page = pageOf(kept, `${t} chapter ${i}`);
        expect(pageOf(kept, `${t} ${i}.1`), `${t} ${i}`).toBe(page);
        expect(pageOf(kept, `${t} ${i}.2`), `${t} ${i}`).toBe(page);
      }
    }
    // A part row right above a chapter goes with the chapter's block.
    expect(pageOf(kept, 'P Beta')).toBe(pageOf(kept, 'Beta chapter 1'));
  });

  it('reads levels="…" as a range, a level or a list', () => {
    expect([...parseTocLevelsAttr('1-2')!]).toEqual([1, 2]);
    expect([...parseTocLevelsAttr('2')!]).toEqual([2]);
    expect([...parseTocLevelsAttr('1,3')!]).toEqual([1, 3]);
    expect(parseTocLevelsAttr('x')).toBeUndefined();
    expect(parseTocLevelsAttr(undefined)).toBeUndefined();
    const parts: Parts = [['I', 'Alpha', 2, 1]];
    const only2 = rows(buildDocument({ markdown: book(':::toc{levels="2"}', parts) }, base));
    expect(only2.filter((x) => !x.includes(':P ')).map((x) => x.replace(/ \d+$/, '').split(':')[1])).toEqual(['Alpha 1.1', 'Alpha 2.1']);
    const resolved = resolveAllConfig(withToc({ groups: { keepTogether: true, head: 2 } }));
    expect(tocKeepOf(undefined, resolved)).toBe(2);
    expect(tocKeepOf({ keep: 'part' }, resolved)).toBe('part');
    expect(tocKeepOf({ keep: 'none' }, resolved)).toBeUndefined();
    expect(tocKeepOf({ keep: '3' }, resolveAllConfig(base))).toBe(3);
    expect(tocKeepOf(undefined, resolveAllConfig(base))).toBeUndefined();
  });

  it('prints the pages the headings land on once the contents settles', () => {
    const doc = buildDocument({ markdown: book(':::toc{keep="part"}', TALL) }, base);
    const landed = new Map<string, string>();
    for (const page of doc.pages) {
      for (const c of page.columns) {
        for (const b of c.blocks) {
          if (b.type === 'heading' && !b.tocEntry) landed.set(b.lines.map((l) => l.text).join(' '), page.pageLabel);
        }
      }
    }
    for (const r of rows(doc)) {
      const m = /^\d+:(.+ chapter \d+) (\S+)$/.exec(r);
      if (m) expect(m[2], m[1]).toBe(landed.get(m[1]!));
    }
  });

  it('resolves, strips and checks the groups config', () => {
    const body = resolveBodyTextConfig({});
    expect(resolveTocConfig(undefined, body).groups).toEqual({
      keepTogether: false, head: 'part', minEntriesAfterHead: 2, continuation: { enabled: true, mark: '(cont.)' },
    });
    expect(resolveTocConfig(undefined, body, 'ja').groups.continuation.mark).toBe('（続き）');
    expect(resolveTocConfig({ groups: { head: '3' as unknown as 3 } }, body).groups.head).toBe(3);
    expect(stripTocDefaults({ groups: { keepTogether: false, head: 'part', minEntriesAfterHead: 2, continuation: { enabled: true } } })).toBeUndefined();
    expect(stripTocDefaults({ groups: { keepTogether: true, head: 1, continuation: { mark: '(suite)' } } })).toEqual({
      groups: { keepTogether: true, head: 1, continuation: { mark: '(suite)' } },
    });
    expect(collectConfigWarnings(withToc({ groups: { head: 'chapter' as unknown as 1 } }))).toContainEqual(
      expect.objectContaining({ kind: 'unknownConfigValue', path: 'toc.groups.head', used: 'part' }),
    );
  });
});

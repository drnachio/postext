// The corpus: documents made in InDesign itself by the generators in
// `corpus/` (one per family of features), scrubbed by
// `scripts/scrub-corpus.mjs`. Each is imported both ways; what the
// importer finds in it is pinned, so a change in how a feature is read
// shows here.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { idmlToPostext, readIdml } from '../../index.js';
import '../../testing/kit.test-helper.js';
import { parse } from './kit.test-helper.js';

const DIR = new URL('../../__fixtures__/corpus/', import.meta.url);
const NAMES = readdirSync(DIR).filter((f) => f.endsWith('.idml')).map((f) => f.replace(/\.idml$/, '')).sort();
const bytes = (name: string): Uint8Array => new Uint8Array(readFileSync(new URL(`${name}.idml`, DIR)));
/** The two pictures the documents link to, by file name. */
const PICTURES = new URL('../../../corpus/pictures/', import.meta.url);
const linkBytes = (link: { name: string }): Uint8Array | undefined => (existsSync(new URL(basename(link.name), PICTURES)) ? new Uint8Array(readFileSync(new URL(basename(link.name), PICTURES))) : undefined);

/** What an import holds, as one line a reader can check. */
function summary(name: string, layout: 'pages' | 'flow'): string {
  const r = idmlToPostext(bytes(name), { layout, linkBytes });
  const c = r.report.counts;
  const by = (severity: string): string => r.report.findings.filter((f) => f.severity === severity).map((f) => (f.count > 1 ? `${f.id}×${f.count}` : f.id)).sort().join(' ') || '-';
  return `${r.report.verdict} | pages ${c.pages} stories ${c.stories} paragraphs ${c.paragraphs} pictures ${c.pictures} tables ${c.tables} notes ${c.footnotes} links ${c.hyperlinks} | chapters ${r.chapters.length} | loss: ${by('loss')} | warning: ${by('warning')}`;
}

describe('the corpus of InDesign documents', () => {
  it('holds the seven documents', () => {
    expect(NAMES).toEqual(['anchored', 'book-flow', 'cjk-rtl', 'links-notes', 'magazine-pages', 'styles', 'tables']);
  });

  it.each(NAMES)('%s names no machine and no person', (name) => {
    expect(readIdml(bytes(name)).warnings).toEqual([]);
    const parts = unzipSync(bytes(name));
    for (const [path, data] of Object.entries(parts)) {
      if (!/\.xml$/i.test(path)) continue;
      const text = strFromU8(data);
      expect(text, path).not.toMatch(/\/Users\/|\/private\/|\/home\/|[A-Za-z]:\\Users/);
      for (const uri of text.match(/file:[^"'<>\s]+/g) ?? []) expect(uri, path).toMatch(/^file:\/Volumes\/Work\/corpus\//);
    }
  });

  it.each(NAMES)('%s: the book it gives lays out, both ways', (name) => {
    for (const layout of ['pages', 'flow'] as const) {
      const r = idmlToPostext(bytes(name), { layout, linkBytes });
      expect(r.chapters.length).toBeGreaterThan(0);
      for (const c of r.chapters) expect(() => parse(c.markdown)).not.toThrow();
      const doc = buildDocument({ markdown: r.chapters.map((c) => c.markdown).join('\n\n'), resources: r.resources }, r.config as PostextConfig);
      expect(doc.pages.length).toBeGreaterThan(0);
    }
  });

  it('reads each document as pinned (composed pages)', () => {
    expect(Object.fromEntries(NAMES.map((n) => [n, summary(n, 'pages')]))).toMatchInlineSnapshot(`
      {
        "anchored": "approximate | pages 2 stories 4 paragraphs 20 pictures 2 tables 1 notes 0 links 0 | chapters 1 | loss: - | warning: anchoredObjectFrameEstimated inlinePicture pictureCrop",
        "book-flow": "approximate | pages 15 stories 4 paragraphs 112 pictures 2 tables 1 notes 3 links 5 | chapters 1 | loss: - | warning: pageLinkTarget×4",
        "cjk-rtl": "lossy | pages 2 stories 3 paragraphs 9 pictures 0 tables 0 notes 0 links 0 | chapters 1 | loss: inlineFontFamily×7 | warning: -",
        "links-notes": "approximate | pages 3 stories 2 paragraphs 12 pictures 0 tables 0 notes 2 links 6 | chapters 1 | loss: - | warning: endnotesAsFootnotes",
        "magazine-pages": "approximate | pages 4 stories 9 paragraphs 41 pictures 2 tables 0 notes 0 links 0 | chapters 1 | loss: - | warning: gradient",
        "styles": "lossy | pages 1 stories 1 paragraphs 12 pictures 0 tables 0 notes 0 links 0 | chapters 1 | loss: grepStyles lineStyles | warning: -",
        "tables": "lossy | pages 1 stories 1 paragraphs 32 pictures 1 tables 3 notes 1 links 0 | chapters 1 | loss: diagonalCellLines rotatedCell | warning: nestedTable noteInTable tableFooterRows",
      }
    `);
  });

  it('reads each document as pinned (flowing book)', () => {
    expect(Object.fromEntries(NAMES.map((n) => [n, summary(n, 'flow')]))).toMatchInlineSnapshot(`
      {
        "anchored": "lossy | pages 2 stories 4 paragraphs 20 pictures 2 tables 1 notes 0 links 0 | chapters 1 | loss: pageArtInFlow×2 | warning: anchoredObjectBeside inlinePicture pictureCrop",
        "book-flow": "approximate | pages 15 stories 4 paragraphs 102 pictures 2 tables 1 notes 3 links 0 | chapters 6 | loss: - | warning: otherMasters×2 sectionInsideStory",
        "cjk-rtl": "lossy | pages 2 stories 3 paragraphs 9 pictures 0 tables 0 notes 0 links 0 | chapters 2 | loss: inlineFontFamily×7 | warning: -",
        "links-notes": "approximate | pages 3 stories 2 paragraphs 12 pictures 0 tables 0 notes 2 links 6 | chapters 2 | loss: - | warning: endnotesAsFootnotes pageLinkTarget",
        "magazine-pages": "lossy | pages 4 stories 9 paragraphs 39 pictures 2 tables 0 notes 0 links 0 | chapters 1 | loss: pageArtInFlow×4 | warning: pictureCrop",
        "styles": "lossy | pages 1 stories 1 paragraphs 12 pictures 0 tables 0 notes 0 links 0 | chapters 1 | loss: grepStyles lineStyles | warning: -",
        "tables": "lossy | pages 1 stories 1 paragraphs 32 pictures 1 tables 3 notes 1 links 0 | chapters 1 | loss: diagonalCellLines rotatedCell | warning: nestedTable noteInTable tableFooterRows",
      }
    `);
  });
});

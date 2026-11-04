// The semantic writer over real books (#1390): the built-in guide, every
// Cookbook recipe text and the showcase presets with their configs and
// pictures. Each export must be a sound package whose bookmarks hold the
// map's text and whose map points at the very characters of the source,
// with no `:::` markup outside raw content controls and code.

import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type { Resource } from '../../types.js';
import type { MapFragment } from '../anchors/types.js';
import { exportDocx, exportProblems, looseMarkup } from './fixtures/harness.js';

const ROOT = new URL('../../../../../', import.meta.url).pathname;
const join = (...parts: string[]): string => parts.join('/').replace(/\/+/g, '/');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('semantic docx corpus', () => {
  it('exports the built-in guide', async () => {
    const path = join(ROOT, 'packages/postext-sandbox/src/defaultMarkdown/en.ts');
    const { DEFAULT_MARKDOWN_EN: md } = (await import(/* @vite-ignore */ path)) as { DEFAULT_MARKDOWN_EN: string };
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    expect(e.map.fragments.length).toBeGreaterThan(300);
    // Boxes, footnotes, lists and maths are native structures.
    expect(e.doc).toContain('<w:tag w:val="ptx:box:');
    expect(e.doc).toContain('<w:numPr>');
    expect(e.doc).toContain('<m:oMath>');
  });

  it('exports every Cookbook recipe text', async () => {
    const dir = join(ROOT, 'cookbook');
    const recipes = readdirSync(dir).filter((d: string) => existsSync(join(dir, d, 'content.en.md')));
    expect(recipes.length).toBeGreaterThan(100);
    const problems: string[] = [];
    for (const r of recipes) {
      const md = readFileSync(join(dir, r, 'content.en.md'), 'utf8');
      const e = await exportDocx(md);
      problems.push(...exportProblems(e, [md]).map((p) => `${r}: ${p}`));
      problems.push(...looseMarkup(e.doc).map((p) => `${r}: loose ${p}`));
    }
    expect(problems).toEqual([]);
  }, 120_000);

  it('exports the showcase presets with their configs and pictures', async () => {
    const dir = join(ROOT, 'apps/web/public/presets');
    const problems: string[] = [];
    let presets = 0;
    for (const id of readdirSync(dir)) {
      const base = join(dir, id);
      if (!existsSync(join(base, 'preset.json'))) continue;
      presets++;
      const preset: { chapters: Record<string, unknown> | unknown[]; locale: string; config: never; resources?: unknown[] } = JSON.parse(readFileSync(join(base, 'preset.json'), 'utf8'));
      const list = Array.isArray(preset.chapters) ? preset.chapters : (preset.chapters.en ?? preset.chapters[preset.locale] ?? Object.values(preset.chapters)[0]);
      const chapters = (list as { title: string; file: string }[]).map((c, i) => ({ id: `c${i}`, title: c.title, markdown: readFileSync(join(base, c.file), 'utf8') }));
      const resources = ((preset.resources ?? []) as Record<string, unknown>[]).map((r) => {
        const common = { id: r.id, typeId: r.typeId, kind: r.kind, caption: r.caption, note: r.note, altText: r.altText, createdAt: 0, updatedAt: 0 };
        if (r.kind === 'bitmap') return { ...common, bitmap: { fileId: r.file, format: String(r.file).split('.').pop(), width: r.width, height: r.height } };
        if (r.kind === 'svg') return { ...common, svg: { fileId: r.file, width: r.width, height: r.height } };
        return { ...r, ...common };
      }) as Resource[];
      const fields = (f: MapFragment): string | undefined => {
        if (f.target.kind !== 'resource') return undefined;
        const t = f.target;
        const res = resources.find((x) => x.id === t.resourceId);
        return t.field === 'cell' ? res?.table?.model.rows[t.row!]?.[t.col!]?.content : (res as unknown as Record<string, string> | undefined)?.[t.field];
      };
      const e = await exportDocx(
        chapters.map((c) => c.markdown),
        {
          chapters,
          config: preset.config,
          resources,
          resourceBytes: (f) => (existsSync(join(base, f)) ? new Uint8Array(readFileSync(join(base, f))) : undefined),
          rasterizeSvg: async () => PNG,
        },
      );
      problems.push(...exportProblems(e, chapters.map((c) => c.markdown), fields).map((p) => `${id}: ${p}`));
      problems.push(...looseMarkup(e.doc).map((p) => `${id}: loose ${p}`));
    }
    expect(presets).toBeGreaterThan(5);
    expect(problems).toEqual([]);
  }, 120_000);
});

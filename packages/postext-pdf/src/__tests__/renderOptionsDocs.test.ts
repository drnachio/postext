import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// The option lists the configuration reference (its Programmatic usage page,
// English and Spanish) and the package README give for `renderToPdf` name
// every field of `RenderToPdfOptions`, and nothing else.

const read = (path: string): string => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const source = read('../pdf-backend/index.ts');
const body = /export interface RenderToPdfOptions \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? '';
// The interface's own fields: two spaces in, doc comments dropped.
const FIELDS = [...body.replace(/\/\*\*[\s\S]*?\*\//g, '').matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]!).sort();

describe('the documented renderToPdf options', () => {
  it('read the interface', () => {
    expect(FIELDS).toContain('fontProvider');
    expect(FIELDS.length).toBeGreaterThan(5);
  });

  for (const doc of ['configuration-programmatic-usage-en.mdx', 'configuration-programmatic-usage-es.mdx']) {
    it(`are all listed in the RenderToPdfOptions summary of ${doc}`, () => {
      const summary = /\*\*`RenderToPdfOptions`\*\* — `\{([^}]*)\}`/.exec(read(`../../../../docs/${doc}`))?.[1] ?? '';
      const listed = summary.split(',').map((f) => f.trim().replace(/\?$/, '')).filter(Boolean).sort();
      expect(listed).toEqual(FIELDS);
    });
  }

  it('are all listed in the README', () => {
    let line = /^- `renderToPdf\(doc \| doc\[\], options\)`.*Options: (.*)$/m.exec(read('../../README.md'))?.[1] ?? '';
    // The notes in parentheses name other things in backticks.
    while (/\([^()]*\)/.test(line)) line = line.replace(/\([^()]*\)/g, '');
    const listed = [...line.matchAll(/`(\w+)`/g)].map((m) => m[1]!).sort();
    expect(listed).toEqual(FIELDS);
  });
});

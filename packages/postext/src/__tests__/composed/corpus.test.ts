/* eslint-disable @typescript-eslint/ban-ts-comment -- node built-ins in a test */
// @ts-nocheck
/* #854: every Cookbook text parses with no composed-page node, slot, frame
   or figure, so the new syntax changes nothing that existed before it. (The
   programme also compared the whole parse output of every Markdown file of
   the repository before and after the parser change: identical.) */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseMarkdownWithIssues } from '../../parse/index.js';
import { extractFrontmatter } from '../../parse/frontmatter.js';

describe('corpus (#854)', () => {
  const root = join(__dirname, '../../../../../cookbook');
  const files = existsSync(root)
    ? readdirSync(root).flatMap((d) => {
      const dir = join(root, d);
      try {
        return readdirSync(dir).filter((f) => /^content.*\.md$/.test(f)).map((f) => join(dir, f));
      } catch {
        return [];
      }
    })
    : [];
  // The composed-page recipes (#875–#879) write page fences on purpose; every other text
  // must read as it did before the syntax existed.
  const COMPOSED = /^::::+\s*page\s*\{/m;
  it.runIf(files.length > 0)('no Cookbook text reads as a composed page', () => {
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      if (COMPOSED.test(text)) continue;
      const { blocks } = parseMarkdownWithIssues(extractFrontmatter(text).content);
      const hit = blocks.find((b) => b.composedPage || b.slot || b.figure || b.containerName === 'frame');
      expect(hit, f).toBeUndefined();
    }
  });
});

/**
 * Layout cost of a Chinese chapter: chapter 1 of 红楼梦 (程乙本, simplified,
 * 6,949 characters), justified, as written (44 paragraphs) and as one
 * paragraph of 6,900 characters with one bold word — the case whose break
 * points used to be measured prefix by prefix. Skipped by `pnpm test`; run
 * with `pnpm bench` (BENCH=1).
 *
 * Text measurement is stubbed (CJK 16 px, anything else 8 px) and counts
 * the characters sent to `measureText`: linear composing measures each
 * distinct character once per font, however long the paragraph.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline/build';
import { createMeasurementCache } from '../measure';
import { clearTextWidthCache } from '../measure/canvas';
import type { PostextConfig } from '../types';
import type { VDTBlock } from '../vdt';

let chars = 0;
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    let w = 0;
    for (let i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2e80 ? 16 : 8;
    chars += s.length;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

// No node typings in this package: reach the environment through globalThis.
const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined>; stdout: { write(s: string): void } } }).process;

describe.skipIf(!nodeProcess?.env?.BENCH)('Chinese chapter bench', () => {
  it('lays chapter 1 of 红楼梦 out in linear time', { timeout: 300_000 }, async () => {
    const fs = await import(/* @vite-ignore */ 'node:fs' as string) as { readFileSync(p: string, enc: string): string };
    const url = new URL('./fixtures/hongloumeng-01-zh-Hans.txt', import.meta.url);
    const chapter = fs.readFileSync(decodeURIComponent(url.pathname), 'utf8');
    const paragraphs = chapter.split('\n').map((p) => p.trim()).filter((p) => p !== '');
    const whole = paragraphs.map((p) => p.replace(/^\u3000+/, '')).join('');
    const title = '# 第一回\u3000甄士隐梦幻识通灵\u3000贾雨村风尘怀闺秀';
    const cases: { name: string; markdown: string; paragraph: number }[] = [
      { name: 'as written', markdown: [title, ...paragraphs].join('\n\n'), paragraph: Math.max(...paragraphs.map((p) => p.length)) },
      { name: 'one paragraph, one bold word', markdown: [title, `**此开卷**${whole.slice(3)}`].join('\n\n'), paragraph: whole.length },
    ];
    const config: PostextConfig = {
      locale: 'zh-Hans',
      bodyText: { textAlign: 'justify', firstLineIndent: { value: 2, unit: 'em' }, hyphenateAcrossColumns: false, hyphenation: { enabled: false } },
    };
    for (const c of cases) {
      clearTextWidthCache();
      chars = 0;
      const t0 = performance.now();
      const doc = buildDocument({ markdown: c.markdown }, config, createMeasurementCache());
      const ms = performance.now() - t0;
      const paragraphs = doc.blocks.filter((b: VDTBlock) => b.type === 'paragraph');
      const lines = paragraphs.flatMap((b) => b.lines);
      const short = paragraphs.flatMap((b) => b.lines
        .filter((l) => !l.isLastLine)
        .map((l) => b.bbox.width - (l.bbox.x - b.bbox.x) - l.bbox.width))
        .filter((d) => d > 0.01);
      nodeProcess?.stdout.write(
        `[bench] 红楼梦 ch. 1, ${c.name}: ${doc.pages.length} pages, ${lines.length} lines, `
        + `${Math.round(ms)} ms, ${chars} characters measured (longest paragraph ${c.paragraph}), `
        + `${short.length} justified lines short of the measure, ${lines.filter((l) => l.hyphenated).length} hyphenated\n`,
      );
      expect(chars).toBeLessThan(3 * c.paragraph);
      expect(short.length).toBe(0);
    }
  });
});

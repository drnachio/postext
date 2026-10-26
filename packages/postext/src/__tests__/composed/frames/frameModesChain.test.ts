/**
 * A `next` chain whose frames differ in writing mode (#960): the story is cut
 * for the first frame in its mode, and goes on in the next in its own.
 */
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, VDTBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { installSizedStub } from '../../vertical/stub.js';

installSizedStub();

const pt = (value: number) => ({ value, unit: 'pt' as const });
const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(500), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(40) } } as never,
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(10), lineHeight: pt(20), textAlign: 'left' } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  locale: 'zh-Hans',
};
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frameOf = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const linesOf = (page: VDTPage, name: string): VDTBlock['lines'] =>
  frameOf(page, name).blockIds.map((id) => page.floats!.find((b) => b.id === id)!).filter((b) => b && b.type !== 'callout').flatMap((b) => b.lines);
const text = (lines: VDTBlock['lines']): string => lines.map((l) => l.text).join('');

/** A vertical box 60 × 100 pt that continues in a horizontal box 200 × 100 pt below it. */
const template = (first: 'vertical-rl' | 'horizontal-tb', second: 'vertical-rl' | 'horizontal-tb'): PageTemplate => ({
  id: 'chain',
  frames: [
    { name: 'a', flow: true, writingMode: first, width: pt(60), height: pt(100), next: 'b', placement: { anchor: { to: 'container', edge: 'top-left' } } },
    { name: 'b', writingMode: second, width: pt(200), height: pt(160), placement: { anchor: { to: '#a', edge: 'below' } } },
  ],
});
const story = Array.from({ length: 12 }, (_, i) => `第${i + 1}回の物語`).join('');
const md = `::::page{template="chain"}\n${story}\n::::\n`;
const build = (first: 'vertical-rl' | 'horizontal-tb', second: 'vertical-rl' | 'horizontal-tb') =>
  buildDocument({ markdown: md }, { ...PAGE, pageTemplates: [template(first, second)] } as PostextConfig, createMeasurementCache());
const digitWidth = (lines: VDTBlock['lines'], digit: string): number | undefined =>
  lines.flatMap((l) => l.segments ?? []).find((s) => s.text === digit)?.width;

describe('a story chained through frames of different writing modes (#960)', () => {
  it('a vertical frame goes on in a horizontal one: each piece is measured in its own frame\'s mode', () => {
    const doc = build('vertical-rl', 'horizontal-tb');
    const page = composedPage(doc);
    const a = linesOf(page, 'a');
    const b = linesOf(page, 'b');
    expect(frameOf(page, 'a').continuesTo).toBe(frameOf(page, 'b').id);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    // Nothing is lost or said twice across the cut.
    expect(text(a) + text(b)).toBe(story);
    // The first piece is cut for a 100 pt line down a 60 pt box: 10 characters a line, the
    // second for a 200 pt line across: 20.
    for (const l of a.slice(0, -1)) expect([...l.text].length).toBeLessThanOrEqual(10);
    expect(Math.max(...b.map((l) => [...l.text].length))).toBeGreaterThan(10);
    // A lone digit: an upright cell down the vertical frame, half a character across the horizontal one.
    const first = digitWidth(a, '1');
    const second = [...b.flatMap((l) => l.segments ?? [])].find((s) => /^\d$/.test(s.text));
    expect(first).toBeCloseTo(10);
    expect(second!.width).toBeCloseTo(5);
  });

  it('a horizontal frame goes on in a vertical one', () => {
    const doc = build('horizontal-tb', 'vertical-rl');
    const page = composedPage(doc);
    const a = linesOf(page, 'a');
    const b = linesOf(page, 'b');
    expect(text(a) + text(b)).toBe(story);
    // The first piece is cut for the 60 pt measure of a horizontal box: 6 characters a line.
    for (const l of a.slice(0, -1)) expect([...l.text].length).toBeLessThanOrEqual(6);
    // The second goes down a 160 pt box: 16 characters a line.
    expect(Math.max(...b.map((l) => [...l.text].length))).toBeGreaterThan(6);
    expect(frameOf(page, 'b').writingMode).toBe('vertical-rl');
  });
});

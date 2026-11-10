import { describe, expect, it } from 'vitest';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { computeWarnings } from './compute.js';
import { warningCategory } from './categories.js';
import { detailFor, titleFor } from '../sidebar/WarningsPanel.js';
import { DEFAULT_LABELS } from '../types/defaultLabels.js';
import { stackMarks, STACK_FILL } from '../viewport/canvas/CanvasPreview/stackMarks.js';

// #1463: under `bodyText.stacks: 'warn'` each stack, two lines in a row
// that end or start alike, is a row of the Review panel with the repeated
// text and its page, and a band on the page behind it on both lines.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (stacks: 'allow' | 'warn'): PostextConfig => ({
  page: { width: pt(160), height: pt(400), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false }, stacks },
});
// Lines the author ends with a backslash: both end on «la».
const markdown = 'Vino por la\\\nsalió con la\\\nmañana fría.';

describe('stack in the warnings panel (#1463)', () => {
  const doc = buildDocument({ markdown }, config('warn'));
  const rows = computeWarnings({ markdown, config: config('warn'), doc }).filter((w) => w.payload.kind === 'stack');

  it('lists the stack with its text, its edge and its page', () => {
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toMatchObject({ kind: 'stack', page: 1, edge: 'end', text: 'la' });
    expect(rows[0]!.line).toBe(1);
  });

  it('files it with the typesetting rules and prints its title and detail', () => {
    expect(warningCategory('stack')).toBe(warningCategory('shortListSplit'));
    const payload = { kind: 'stack' as const, page: 3, edge: 'end' as const, text: 'de la', lines: ['a de la', 'b de la'] as [string, string] };
    expect(titleFor(payload, DEFAULT_LABELS)).toBe('Stack');
    expect(detailFor(payload, DEFAULT_LABELS)).toContain('page 3 · two lines in a row end on “de la”');
    expect(detailFor({ ...payload, edge: 'start' }, DEFAULT_LABELS)).toContain('start on “de la”');
  });

  it('marks the repeated text on both lines, and nothing while stacks are allowed', () => {
    const marks = stackMarks(doc, 0, false);
    expect(marks).toHaveLength(2);
    expect(marks.every((m) => m.fill === STACK_FILL && m.width > 0)).toBe(true);
    expect(marks[1]!.y).toBeGreaterThan(marks[0]!.y);
    const allowed = buildDocument({ markdown }, config('allow'));
    expect(stackMarks(allowed, 0, false)).toEqual([]);
    expect(computeWarnings({ markdown, config: config('allow'), doc: allowed }).filter((w) => w.payload.kind === 'stack')).toEqual([]);
  });
});

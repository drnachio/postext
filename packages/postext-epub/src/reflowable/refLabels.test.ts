import { describe, expect, it } from 'vitest';
import type { PostextConfig, VDTDocument } from 'postext';
import { baseConfig, layOut } from './__tests__/vdt.js';
import { buildReflowablePublication } from './index.js';
import { textOfMarkup } from './__tests__/markup.js';

// #702: a reference whose label is words is set word by word and may stand
// on two print lines. The reflowed text holds one link around the whole
// label, across the place the print line broke.

const LABEL = 'close the lever so that it points backwards';
const MD = `To fit it, tighten the nut, then [${LABEL}]{#step}. Squeeze the front brake twice.\n\nPress each tyre hard with your thumb. A tyre that gives easily needs air. Finally, check that both levers are closed, as :ref{id="step"} in the section on wheels describes.`;

async function chapterXhtml(docs: VDTDocument[]): Promise<string> {
  const pub = await buildReflowablePublication(docs, { layout: 'reflowable', metadata: { title: 'Labels', language: 'en', modified: new Date(Date.UTC(2026, 9, 11)) } });
  return pub.items.filter((i) => i.mediaType === 'application/xhtml+xml').map((i) => String(i.data)).join('\n');
}
const narrow = (breakLabels: boolean): PostextConfig => ({
  ...baseConfig,
  page: { ...baseConfig.page, width: { value: 230, unit: 'pt' } },
  bodyText: { ...baseConfig.bodyText, textAlign: 'left', hyphenation: { enabled: false } },
  crossRefs: { breakLabels },
});
const labelLines = (doc: VDTDocument): number => doc.blocks.flatMap((b) => b.lines).filter((l) => l.segments?.some((s) => s.refResourceId !== undefined)).length;

describe('reflowable EPUB: a reference label on two print lines (#702)', () => {
  it('is one link around the whole label', async () => {
    const doc = layOut(MD, narrow(true));
    // Non-vacuous: the print layout broke the label.
    expect(labelLines(doc)).toBeGreaterThan(1);
    const xhtml = await chapterXhtml([doc]);
    const anchors = [...xhtml.matchAll(/<a\b[^>]*href="[^"]*#[^"]*"[^>]*>(.*?)<\/a>/g)].map((m) => textOfMarkup(m[1]!));
    expect(anchors.filter((text) => LABEL.includes(text.trim()) && text.trim() !== '')).toEqual([LABEL]);
  });

  it('reads the same as a label kept whole', async () => {
    const whole = await chapterXhtml([layOut(MD, narrow(false))]);
    const broken = await chapterXhtml([layOut(MD, narrow(true))]);
    const text = (xhtml: string): string => xhtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text(broken)).toBe(text(whole));
  });
});

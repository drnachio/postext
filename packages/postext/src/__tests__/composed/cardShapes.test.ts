/**
 * The box shapes of #1059 on a composed page (`fixtures/cards/`): a
 * textbook card with its title tab grown out of it, a box with a border on
 * its top only, a box rounded on two corners, joined tabs at the top
 * right (flush with the side) and at the foot, and a decoration band with
 * its two top corners rounded and its foot ruled. All of it vector: no
 * background picture.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync as readFile } from 'node:fs';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import type { PostextConfig, VDTBlock, VDTDesignBlock, VDTDesignBoxBlock, VDTDesignPathBlock } from '../../index.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
    return { width: [...s].length * size * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const readFileSync = readFile as (path: URL, encoding: 'utf8') => string;
const DIR = new URL('./fixtures/cards/', import.meta.url);
const CONFIG = JSON.parse(readFileSync(new URL('config.json', DIR), 'utf8')) as PostextConfig;
const MARKDOWN = readFileSync(new URL('cards.md', DIR), 'utf8');

const doc = buildDocument({ markdown: MARKDOWN }, CONFIG, createMeasurementCache());
const page = doc.pages[0]!;
const frames = doc.blocks.filter((b): b is VDTBlock => b.type === 'callout');
const frameOf = (style: string) => frames.find((b) => b.callout?.styleId === style)!;
const overlay = (style: string): VDTDesignBlock[] => frameOf(style).designOverlay?.blocks ?? [];
const paths = (style: string) => overlay(style).filter((b): b is VDTDesignPathBlock => b.kind === 'path');
const boxes = (style: string) => overlay(style).filter((b): b is VDTDesignBoxBlock => b.kind === 'box');

describe('box shapes on a composed page (#1059)', () => {
  it('lays the fixture out without a warning', () => {
    expect(collectConfigWarnings(CONFIG)).toEqual([]);
    expect(doc.contentWarnings ?? []).toEqual([]);
    expect(frames).toHaveLength(5);
  });

  it('draws the card and its title tab as one outline with the border round it', () => {
    const [fill, border] = paths('explore');
    expect(fill).toMatchObject({ boxPart: 'fill', fill: '#ffffff' });
    expect(border).toMatchObject({ boxPart: 'border', fill: '#2f6b3a', fillRule: 'evenodd' });
    // No tab box of its own: the tab is the outline's.
    expect(boxes('explore')).toEqual([]);
    // The tab rises out of the box: the outline starts at the frame's top.
    expect(fill!.bbox.y).toBeCloseTo(frameOf('explore').bbox.y, 6);
  });

  it('draws the top border only', () => {
    const [box] = boxes('ruled');
    expect(box!.box.borderSides).toMatchObject({ top: { color: '#c0392b' }, right: null, bottom: null, left: null });
    expect(box!.box.backgroundColor).toBeUndefined();
  });

  it('rounds two corners of the leaf', () => {
    const [box] = boxes('leaf');
    expect(box!.box.borderRadiiPx![1]).toBe(0);
    expect(box!.box.borderRadiiPx![3]).toBe(0);
    expect(box!.box.borderRadiiPx![0]).toBeGreaterThan(0);
    expect(box!.box.borderRadiiPx![0]).toBe(box!.box.borderRadiiPx![2]);
  });

  it('joins a tab flush with the right side and one hanging from the foot', () => {
    const corner = paths('corner');
    expect(corner.map((p) => p.boxPart)).toEqual(['fill']);
    const foot = paths('foot');
    expect(foot.map((p) => p.boxPart)).toEqual(['fill', 'border']);
    const f = frameOf('foot').bbox;
    expect(foot[0]!.bbox.y + foot[0]!.bbox.height).toBeCloseTo(f.y + f.height, 6);
  });

  it('rounds the decoration band on top and rules its foot', () => {
    const band = page.composed?.decoration?.blocks.find((b): b is VDTDesignBoxBlock => b.kind === 'box');
    expect(band).toBeDefined();
    const r = band!.box.borderRadiiPx!;
    expect(r[0]).toBeGreaterThan(0);
    expect(r.slice(2)).toEqual([0, 0]);
    expect(band!.box.borderSides).toMatchObject({ top: null, right: null, left: null, bottom: { color: '#2f6b3a' } });
  });
});

/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any -- scratch harness: loose fontkit types */
// @ts-nocheck
/* Scratch harness: lay out the real deep-sky bundle in node with fontkit
   metrics, so page geometry can be inspected without a browser. */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fontkit from '../../../../postext-pdf/node_modules/@pdf-lib/fontkit/dist/fontkit.es.js';
import { buildDocument } from '../../pipeline';
import type { PostextConfig, Resource, VDTDocument } from '../../index';

const BUNDLE = join(__dirname, '../../../../../apps/web/public/presets/deep-sky');
const manifest = JSON.parse(readFileSync(join(BUNDLE, 'preset.json'), 'utf8'));

type Face = { weight: number; style: string; file: string };
const faces = new Map<string, Face[]>();
for (const fam of manifest.fonts as { name: string; variants: Face[] }[]) faces.set(fam.name, fam.variants);
const loaded = new Map<string, any>();
function fontFor(family: string, weight: number, italic: boolean): any {
  const variants = faces.get(family) ?? [];
  const style = italic ? 'italic' : 'normal';
  const pool = variants.filter((v) => v.style === style);
  const list = pool.length > 0 ? pool : variants;
  const pick = list.reduce((b, v) => (Math.abs(v.weight - weight) < Math.abs(b.weight - weight) ? v : b), list[0]!);
  let f = loaded.get(pick.file);
  if (!f) { f = fontkit.create(readFileSync(join(BUNDLE, pick.file))); loaded.set(pick.file, f); }
  return f;
}

/** `[style] [weight] <size>px <family>` → measured advance width. */
class Ctx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /^(?:(italic|oblique)\s+)?(?:(\d{3}|bold|normal)\s+)?([\d.]+)px\s+(.+)$/.exec(this.font.trim());
    if (!m) return { width: s.length * 7 };
    const italic = m[1] !== undefined;
    const weight = m[2] === 'bold' ? 700 : m[2] ? Number(m[2]) : 400;
    const size = Number(m[3]);
    const family = m[4]!.replace(/["']/g, '').split(',')[0]!.trim();
    const font = fontFor(family, weight, italic);
    const run = font.layout(s);
    return { width: (run.advanceWidth / font.unitsPerEm) * size };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): Ctx { return new Ctx(); }
};

function resources(lang: string): Resource[] {
  const wording = new Map<string, any>((manifest.localized[lang].resources as any[]).map((r) => [r.id, r]));
  return (manifest.resources as any[]).map((r) => {
    const w = wording.get(r.id) ?? {};
    const base = { ...r, ...w, createdAt: 0, updatedAt: 0 };
    if (r.kind === 'bitmap') return { ...base, bitmap: { fileId: r.file, format: 'jpeg', width: r.width, height: r.height } };
    return base;
  }) as Resource[];
}

function configFor(lang: string, over: Record<string, unknown> = {}): PostextConfig {
  const cfg = { ...manifest.config, ...manifest.localized[lang].config } as Record<string, unknown>;
  return { ...cfg, ...over } as PostextConfig;
}

export function layoutChapter(lang: string, index: number, over: Record<string, unknown> = {}): VDTDocument {
  const spec = manifest.chapters[lang][index];
  const markdown = readFileSync(join(BUNDLE, spec.file), 'utf8');
  return buildDocument({ markdown, resources: resources(lang) }, configFor(lang, over));
}

function report(doc: VDTDocument): void {
    const grid = doc.baselineGrid;
    for (const page of doc.pages) {
      const cols = page.columns.map((c) => {
        const last = [...c.blocks].reverse().find((b) => b.lines.length > 0);
        const line = last?.lines[last.lines.length - 1];
        const firstBlock = c.blocks.find((b) => b.lines.length > 0);
        const first = firstBlock?.lines[0];
        return {
          first: first ? +(first.baseline).toFixed(1) : null,
          last: line ? +(line.baseline).toFixed(1) : null,
          firstId: firstBlock?.id,
        };
      });
      const phase = cols[0]?.first != null && cols[1]?.first != null
        ? (((cols[0]!.first - cols[1]!.first) / grid) % 1).toFixed(3) : 'n/a';
      const tail = cols[0]?.last != null && cols[1]?.last != null
        ? ((cols[0]!.last - cols[1]!.last) / grid).toFixed(2) : 'n/a';
       
      console.log(`page ${page.index} floats=${page.floats?.length ?? 0} phase=${phase} tailDiff=${tail}`,
        cols.map((c) => `${c.firstId ?? '-'}:${c.first}→${c.last}`).join(' | '));
    }
     
    console.log('pages', doc.pages.length, 'grid', grid.toFixed(2), 'converged', doc.converged);
}

function runts(doc: VDTDocument, label: string): void {
  for (const page of doc.pages) {
    for (const col of page.columns) {
      for (const b of col.blocks) {
        if (b.type !== 'paragraph' || b.lines.length === 0) continue;
        // The paragraph's real last line: no continuation follows it.
        const last = b.lines[b.lines.length - 1]!;
        if (last.hyphenated) continue;
        const width = last.bbox.width;
        const ratio = width / col.bbox.width;
        if (ratio < 0.18 && b.lines.length > 1) {
           
          console.log(`${label} p${page.index}c${col.index} ${b.id} last="${last.text}" ${(ratio * 100).toFixed(0)}% of column`);
        }
      }
    }
  }
}

function dump(doc: VDTDocument, pageIndex: number): void {
  const page = doc.pages[pageIndex]!;
   
  console.log(`== page ${pageIndex} contentArea y=${page.contentArea.y.toFixed(0)} h=${page.contentArea.height.toFixed(0)} floats=${(page.floats ?? []).map((f) => `${f.type}@${f.bbox.y.toFixed(0)}+${f.bbox.height.toFixed(0)}x${f.bbox.width.toFixed(0)}`).join(',')}`);
  for (const col of page.columns) {
    const last = [...col.blocks].reverse().find((b) => b.lines.length > 0);
     
    console.log(`   col${col.index} y=${col.bbox.y.toFixed(0)} h=${col.bbox.height.toFixed(0)} avail=${col.availableHeight.toFixed(0)} blocks=${col.blocks.map((b) => b.id + (b.containerId !== undefined ? '*' : '')).join('>')} lastBaseline=${last ? last.lines[last.lines.length - 1]!.baseline.toFixed(0) : '-'}`);
  }
}

describe('scratch: deep-sky in node', () => {
  it('dumps a page', () => {
    dump(layoutChapter('es', 6), 5);
  }, 120_000);

  it.skip('lists runt last lines', () => {
    for (let i = 3; i <= 6; i++) runts(layoutChapter('es', i), `es${i}`);
  }, 120_000);

  it('lays out a section chapter', () => {
    const noFloatLever = {
      headings: {
        ...(manifest.config.headings as Record<string, unknown>),
        balancing: { stretchAfterFloats: false },
      },
    };
     
    console.log('--- lever off ---');
    report(layoutChapter('es', 6, noFloatLever));
     
    console.log('--- lever on ---');
    report(layoutChapter('es', 6));
  }, 120_000);
});

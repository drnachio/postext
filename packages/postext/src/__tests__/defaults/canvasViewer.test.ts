import { describe, it, expect } from 'vitest';
import {
  CANVAS_VIEWER_MAX_GAP,
  DEFAULT_CANVAS_VIEWER_CONFIG,
  resolveCanvasViewerConfig,
  stripCanvasViewerDefaults,
} from '../../defaults/output/canvasViewer.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import type { PostextConfig } from '../../types.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

describe('resolveCanvasViewerConfig', () => {
  it('defaults both gaps to 24', () => {
    expect(DEFAULT_CANVAS_VIEWER_CONFIG).toEqual({ pageGap: 24, rowGap: 24 });
    expect(resolveCanvasViewerConfig()).toEqual({ pageGap: 24, rowGap: 24 });
    expect(resolveCanvasViewerConfig({})).toEqual({ pageGap: 24, rowGap: 24 });
  });

  it('takes the gaps as written, 0 included', () => {
    expect(resolveCanvasViewerConfig({ pageGap: 0 })).toEqual({ pageGap: 0, rowGap: 24 });
    expect(resolveCanvasViewerConfig({ pageGap: 6, rowGap: 80 })).toEqual({ pageGap: 6, rowGap: 80 });
  });

  it('rounds, holds a gap inside 0 to 200 and ignores what is no number', () => {
    expect(resolveCanvasViewerConfig({ pageGap: -5, rowGap: 999 })).toEqual({ pageGap: 0, rowGap: CANVAS_VIEWER_MAX_GAP });
    expect(resolveCanvasViewerConfig({ pageGap: 3.6 }).pageGap).toBe(4);
    expect(resolveCanvasViewerConfig({ pageGap: NaN, rowGap: '8' as unknown as number })).toEqual({ pageGap: 24, rowGap: 24 });
  });
});

describe('stripCanvasViewerDefaults', () => {
  it('drops a gap equal to its default and the section when nothing is left', () => {
    expect(stripCanvasViewerDefaults({ pageGap: 24, rowGap: 24 })).toBeUndefined();
    expect(stripCanvasViewerDefaults({ pageGap: 0, rowGap: 24 })).toEqual({ pageGap: 0 });
    expect(stripCanvasViewerDefaults(undefined)).toBeUndefined();
  });

  it('is part of stripConfigDefaults', () => {
    expect(stripConfigDefaults({ canvasViewer: { pageGap: 0 } }).canvasViewer).toEqual({ pageGap: 0 });
    expect(stripConfigDefaults({ canvasViewer: { rowGap: 24 } }).canvasViewer).toBeUndefined();
  });
});

describe('canvasViewer in the configuration warnings', () => {
  const warn = (canvasViewer: unknown) => collectConfigWarnings({ canvasViewer } as PostextConfig);

  it('is quiet for gaps in range', () => {
    expect(warn({ pageGap: 0, rowGap: 200 })).toEqual([]);
    expect(warn(undefined)).toEqual([]);
  });

  it('reports a gap out of range, fractional or no number, with what is used', () => {
    expect(warn({ pageGap: 300 })).toEqual([{ kind: 'unknownConfigValue', path: 'canvasViewer.pageGap', value: '300', used: '200' }]);
    expect(warn({ rowGap: -1 })).toEqual([{ kind: 'unknownConfigValue', path: 'canvasViewer.rowGap', value: '-1', used: '0' }]);
    expect(warn({ pageGap: 2.5 })).toEqual([{ kind: 'unknownConfigValue', path: 'canvasViewer.pageGap', value: '2.5', used: '3' }]);
    expect(warn({ pageGap: 'wide' })).toEqual([{ kind: 'unknownConfigValue', path: 'canvasViewer.pageGap', value: 'wide', used: '24' }]);
  });

  it('reports a misspelt key with its suggestion', () => {
    const w = warn({ pageGapp: 4 });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ kind: 'unknownConfigKey', path: 'canvasViewer.pageGapp', suggestion: 'pageGap' });
  });
});

describe('canvasViewer never shapes a page', () => {
  const SENTENCE = 'La composición tipográfica editorial exige columnas alineadas, rejilla base estable y márgenes consistentes. ';
  const markdown = ['# Documento', '', SENTENCE.repeat(8), '', '## Sección', '', SENTENCE.repeat(30)].join('\n');

  it('lays the same pages out with any gaps', () => {
    const base: PostextConfig = { headings: { balancing: { enabled: true } } };
    const plain = buildDocument({ markdown }, base, createMeasurementCache());
    const gapped = buildDocument({ markdown }, { ...base, canvasViewer: { pageGap: 0, rowGap: 120 } }, createMeasurementCache());
    expect(gapped.pages.length).toBe(plain.pages.length);
    expect(JSON.stringify(gapped.pages)).toBe(JSON.stringify(plain.pages));
  });
});

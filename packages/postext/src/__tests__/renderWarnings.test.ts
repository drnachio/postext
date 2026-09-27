import { describe, it, expect, afterEach } from 'vitest';
import {
  buildDocument,
  renderPageToCanvas,
  renderToHtml,
  registerResourceImage,
  clearResourceImages,
  type RenderWarning,
  type Resource,
  type ResourceImageSource,
  type TableModel,
} from '../index';

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

/** A 2D context that swallows every call. */
function stubCanvas(): HTMLCanvasElement {
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get(target: Record<string | symbol, unknown>, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

const photo: Resource = {
  id: 'photo',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A photo.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'file-photo', format: 'png', width: 400, height: 300 },
  placement: { position: 'here' },
};
const icon: Resource = { ...photo, id: 'icon', caption: undefined, bitmap: { fileId: 'file-icon', format: 'png', width: 40, height: 40 } };
const cells: TableModel = { rows: [[{ content: 'A', image: { resourceId: 'icon' } }, { content: 'B', image: { resourceId: 'icon' } }]] };
const grid: Resource = { id: 'grid', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, table: { model: cells }, placement: { position: 'here' } };

function build() {
  return buildDocument(
    { markdown: 'Text.\n\n::resource{id="photo"}\n\n::resource{id="grid"}\n', resources: [photo, icon, grid] },
    {},
  );
}

afterEach(() => clearResourceImages());

describe('render warnings — images painted as placeholders', () => {
  it('canvas reports every unregistered image once, with its resource and page', () => {
    const doc = build();
    const warnings: RenderWarning[] = [];
    renderPageToCanvas(doc.pages[0]!, doc, stubCanvas(), { onWarning: (w) => warnings.push(w) });
    expect(warnings).toEqual([
      { kind: 'missingImage', fileId: 'file-photo', resourceId: 'photo', pageIndex: 0 },
      { kind: 'missingImage', fileId: 'file-icon', resourceId: 'icon', pageIndex: 0 },
    ]);
  });

  it('canvas stays quiet once the images are registered, and without onWarning', () => {
    const doc = build();
    registerResourceImage('file-photo', {} as ResourceImageSource);
    registerResourceImage('file-icon', {} as ResourceImageSource);
    const warnings: RenderWarning[] = [];
    renderPageToCanvas(doc.pages[0]!, doc, stubCanvas(), { onWarning: (w) => warnings.push(w) });
    expect(warnings).toEqual([]);
    clearResourceImages();
    expect(() => renderPageToCanvas(doc.pages[0]!, doc, stubCanvas())).not.toThrow();
  });

  it('HTML reports the images it has no URL for', () => {
    const doc = build();
    const warnings: RenderWarning[] = [];
    renderToHtml(doc, { resourceImageUrl: (id) => (id === 'file-icon' ? 'data:image/png;base64,' : undefined), onWarning: (w) => warnings.push(w) });
    expect(warnings).toEqual([{ kind: 'missingImage', fileId: 'file-photo', resourceId: 'photo', pageIndex: 0 }]);
  });
});

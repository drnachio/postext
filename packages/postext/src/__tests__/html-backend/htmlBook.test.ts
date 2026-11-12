import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { anchoredResourceIds, HTML_TEXT_RESET, renderToHtml } from '../../html-backend/html-backend.js';
import { htmlBookFiles, htmlFontFaceRule, redistributableFaces, renderHtmlBook, type HtmlBookWarning } from '../../html-backend/book.js';
import { exerciseDataOf } from '../../exercises/digital.js';
import { EXERCISE_SCRIPT } from '../../exercises/runtime.js';
import { formatWarning } from '../../pipeline/contentWarnings.js';
import type { PostextConfig, Resource, VDTDocument } from '../../index.js';

// The book as one HTML page (#1544): the page `postext html` wrote up to
// 1.79, now shared with the Sandbox's Download as HTML.

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) }, backgroundColor: { hex: '#fdf6e3' }, dpi: 300 },
  headings: { levels: [{ level: 1, numberingTemplate: '{1}', breakBefore: { enabled: true, parity: 'any' } }, { level: 2, numberingTemplate: '{1}.{2}' }] },
} as PostextConfig;

const svg = (fill: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="${fill}"/></svg>`;
const resources: Resource[] = [
  { id: 'chart', kind: 'svg', typeId: 'figure', title: 'Chart', svg: { fileId: 'chart.svg', width: 10, height: 10 } } as Resource,
  { id: 'photo', kind: 'bitmap', typeId: 'figure', title: 'Photo', bitmap: { fileId: 'photo.png', width: 10, height: 10 } } as Resource,
];
const files = new Map<string, Uint8Array>([
  ['chart.svg', new TextEncoder().encode(svg('#ff0000'))],
  ['photo.png', new Uint8Array([137, 80, 78, 71])],
]);

const docs: VDTDocument[] = [
  buildDocument({ markdown: '# Opening\n\nSee :ref{id="photo"} later on.\n\n::resource{id="chart"}\n', resources }, config),
  buildDocument({ markdown: '# Method\n\nBack to :ref{id="chart"}.\n\n::resource{id="photo"}\n', resources }, config),
];

/** The page as the command line assembled it before #1544 (the
 *  pre-change `writeHtml`, its file handling aside): the reference the
 *  shared writer must keep to. */
function legacyCliPage(input: { docs: VDTDocument[]; title: string; lang: string; mode: 'single' | 'multi'; fontFaces: string[]; urls: Map<string, string> }, warn: (w: HtmlBookWarning) => void): string {
  const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const refTargets = new Set(input.docs.flatMap((d) => [...anchoredResourceIds(d)]));
  const resourceImageUrl = Object.assign((fileId: string) => input.urls.get(fileId), { singleInk: false });
  const body = input.docs.map((d) => renderToHtml(d, {
    mode: input.mode, refTargets, resourceImageUrl, resourceVideoUrl: () => undefined, videos: { files: 'poster' }, singleInk: false,
    onWarning: (w) => warn({ kind: `html.${w.kind}`, severity: 'warning', message: formatWarning(w) }),
  })).join('\n');
  const exercises = input.docs.some((d) => exerciseDataOf(d) !== undefined) ? `<script>${EXERCISE_SCRIPT.replace(/<\/(script)/gi, '<\\/$1')}</script>` : '';
  const dpi = input.docs[0]?.config.page.dpi ?? 96;
  const zoom = Math.round((96 / dpi) * 10000) / 10000;
  const paper = input.docs[0]?.config.page.backgroundColor?.hex;
  const background = !paper || paper === 'transparent' ? '#ffffff' : `linear-gradient(${paper},${paper}),#ffffff`;
  return [
    '<!doctype html>', `<html lang="${escapeHtml(input.lang)}">`, '<head>', '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">', `<meta name="generator" content="postext">`,
    `<title>${escapeHtml(input.title)}</title>`, '<style>', ...input.fontFaces,
    `html,body{margin:0;background:${background}}body{${HTML_TEXT_RESET}}`, `.postext-book{zoom:${zoom};padding:24px 0}`,
    '.postext-book .pt-page{margin-left:auto;margin-right:auto}', '</style>', '</head>', '<body>', '<main class="postext-book">',
    body, '</main>', ...(exercises ? [exercises] : []), '</body>', '</html>', '',
  ].join('\n');
}

describe('renderHtmlBook (#1544)', () => {
  const face = { family: 'Body "Serif"', weight: 700, style: 'italic', url: 'assets/fonts/Body-700i.ttf' };

  it('writes the page the command line wrote before, byte for byte', () => {
    const urls = new Map([['chart.svg', 'assets/chart.svg']]);
    for (const mode of ['single', 'multi'] as const) {
      const before: HtmlBookWarning[] = [];
      const after: HtmlBookWarning[] = [];
      const legacyFace = `@font-face{font-family:${JSON.stringify(face.family)};font-weight:${face.weight};font-style:${face.style};font-display:block;src:url(${JSON.stringify(face.url)})}`;
      const expected = legacyCliPage({ docs, title: 'A <book> & "more"', lang: 'en', mode, fontFaces: [legacyFace], urls }, (w) => before.push(w));
      const page = renderHtmlBook(docs, {
        title: 'A <book> & "more"', lang: 'en', mode, faces: [face],
        pictureUrl: (id) => urls.get(id), videoPosters: true, onWarning: (w) => after.push(w),
      });
      expect(page).toBe(expected);
      // The bitmap has no URL: one placeholder, reported the same way.
      expect(after).toEqual(before);
      expect(after.map((w) => w.kind)).toContain('html.missingImage');
    }
  });

  it('zooms from page.dpi and fills the window with the paper', () => {
    const page = renderHtmlBook(docs, { title: 'T', lang: 'en', faces: [], pictureUrl: () => undefined });
    expect(page).toContain('.postext-book{zoom:0.32;');
    expect(page).toContain('background:linear-gradient(#fdf6e3,#fdf6e3),#ffffff');
    expect(page).not.toContain('<script>');
  });

  it('says first which families were left out or stood in, then what the pages could not draw', () => {
    const warnings: HtmlBookWarning[] = [];
    renderHtmlBook(docs, {
      title: 'T', lang: 'en', faces: [], pictureUrl: () => undefined,
      fontNotes: [{ family: 'Licensed', standIn: 'Open Sans' }, { family: 'Closed' }],
      onWarning: (w) => warnings.push(w),
    });
    expect(warnings[0]).toEqual({ kind: 'fontStoodIn', severity: 'info', message: '"Licensed" may not be copied out of the book: the HTML sets it in Open Sans, under the same name' });
    expect(warnings[1]).toEqual({ kind: 'fontWithheld', severity: 'info', message: '"Closed" may not be copied out of the book: the HTML names it without its file' });
    expect(warnings.slice(2).every((w) => w.kind.startsWith('html.'))).toBe(true);
  });

  it('adds a unicode-range to a face that is one slice of a family', () => {
    expect(htmlFontFaceRule(face)).toBe('@font-face{font-family:"Body \\"Serif\\"";font-weight:700;font-style:italic;font-display:block;src:url("assets/fonts/Body-700i.ttf")}');
    expect(htmlFontFaceRule({ ...face, unicodeRange: 'U+0000-00FF' })).toBe('@font-face{font-family:"Body \\"Serif\\"";font-weight:700;font-style:italic;font-display:block;src:url("assets/fonts/Body-700i.ttf");unicode-range:U+0000-00FF}');
  });
});

describe('htmlBookFiles (#1544)', () => {
  it('serves each picture once, an SVG recoloured for single ink, a bitmap as stored', () => {
    const out = htmlBookFiles([...resources, resources[0]!], (id) => files.get(id), { inkHex: '#1a5276' });
    expect(out.map((f) => f.fileId)).toEqual(['chart.svg', 'photo.png']);
    expect(typeof out[0]!.content).toBe('string');
    expect(out[0]!.content).not.toContain('#ff0000');
    expect(out[1]!.content).toBe(files.get('photo.png'));
  });

  it('keeps an SVG as stored without single ink, and a video file only when asked for', () => {
    const video = { id: 'clip', kind: 'video', typeId: 'figure', title: 'Clip', video: { fileId: 'clip.mp4', poster: { fileId: 'poster.png', width: 10, height: 10 } } } as unknown as Resource;
    const all = new Map([...files, ['clip.mp4', new Uint8Array([1])], ['poster.png', new Uint8Array([2])]]);
    expect(htmlBookFiles([resources[0]!], (id) => all.get(id), { inkHex: null })[0]!.content).toBe(files.get('chart.svg'));
    expect(htmlBookFiles([video], (id) => all.get(id), { inkHex: null }).map((f) => `${f.kind}:${f.fileId}`)).toEqual(['picture:poster.png']);
    expect(htmlBookFiles([video], (id) => all.get(id), { inkHex: null, videos: true }).map((f) => `${f.kind}:${f.fileId}`)).toEqual(['picture:poster.png', 'video:clip.mp4']);
  });
});

describe('redistributableFaces (#993, #1544)', () => {
  const faces = [{ family: 'Open', n: 1 }, { family: 'Closed', n: 2 }, { family: 'closed', n: 3 }, { family: 'Shut', n: 4 }];
  const customFonts = [{ name: 'Closed', redistributable: false }, { name: 'Shut', redistributable: false }];

  it('puts the stand-in faces in the place of the first face of a family left out, once, and notes it', async () => {
    const { faces: kept, notes } = await redistributableFaces(faces, customFonts, async (family) =>
      family === 'Closed' ? [{ family: 'Closed', n: 9, standsInFor: 'Lora' }] : []);
    expect(kept.map((f) => f.n)).toEqual([1, 9]);
    expect(notes).toEqual([{ family: 'Closed', standIn: 'Lora' }, { family: 'Shut' }]);
  });
});

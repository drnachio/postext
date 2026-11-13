// Shared by the special-ink and die-line tests (#1566): a small page with
// coloured bands, rendered to PDF, and readers for its plates and states.
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream, type PDFObject } from 'pdf-lib';
import { buildDocument, type ColorValue, type PostextConfig, type PrintConfig, type VDTDocument } from 'postext';
import { renderToPdf, type RenderToPdfOptions } from '../pdf-backend/index.js';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
export const fogra39 = new Uint8Array(fs.readFileSync(new URL('../../../postext/icc/fogra39.icc', import.meta.url)));
export const pt = (value: number) => ({ value, unit: 'pt' as const });

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 6 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

export function band(id: string, edge: 'top-left' | 'bottom-left' | 'top-right' | 'bottom-right', color: ColorValue, height = 40) {
  return { kind: 'box' as const, id, placement: { anchor: { to: 'container' as const, edge }, size: { width: pt(120), height: pt(height) } }, style: { backgroundColor: color } };
}

/** A 300 × 300 pt page with crop marks, its text in black and a band of
 *  each colour given. */
export function inkConfig(colors: ColorValue[], extra: PostextConfig = {}): PostextConfig {
  const edges = ['top-left', 'bottom-left', 'top-right', 'bottom-right'] as const;
  return {
    page: { width: pt(300), height: pt(300), margins: { top: pt(30), bottom: pt(30), left: pt(24), right: pt(24) }, cutLines: { enabled: true } as never },
    bodyText: { fontFamily: 'Lora' },
    headings: { fontFamily: 'Lora' },
    header: { elements: colors.map((c, i) => band(`band${i}`, edges[i % 4]!, c, 20)) },
    footer: { elements: [] },
    ...extra,
  };
}

export function inkDocument(colors: ColorValue[], extra: PostextConfig = {}): VDTDocument {
  return buildDocument({ markdown: 'Some text on the page.', resources: [] }, inkConfig(colors, extra));
}

export function streamText(pdf: PDFDocument, obj: PDFObject | undefined): string {
  const s = obj instanceof PDFStream ? obj : obj ? pdf.context.lookup(obj) : undefined;
  return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
}

export interface Rendered {
  bytes: Uint8Array;
  pdf: PDFDocument;
  content: string;
  warnings: { kind: string; message?: string }[];
}

/** Render `doc` and read its first page's content back. */
export async function renderInk(doc: VDTDocument, print: PrintConfig | undefined, opts: Partial<RenderToPdfOptions> = {}): Promise<Rendered> {
  const warnings: { kind: string; message?: string }[] = [];
  const bytes = await renderToPdf(doc, {
    onWarning: (w) => void warnings.push(w as { kind: string; message?: string }),
    fontProvider: async () => new Uint8Array(fontBytes),
    outputProfile: fogra39,
    accessible: false,
    date: 0,
    ...(print ? { print } : {}),
    ...opts,
  });
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return { bytes, pdf, content: refs.map((r) => streamText(pdf, r)).join('\n'), warnings };
}

/** The Separation colour spaces of the first page, by resource name. */
export function separations(pdf: PDFDocument): Map<string, { ink: string; c1: number[] }> {
  const out = new Map<string, { ink: string; c1: number[] }>();
  const spaces = pdf.getPage(0).node.Resources()?.lookup(PDFName.of('ColorSpace'));
  if (!(spaces instanceof PDFDict)) return out;
  for (const [name, ref] of spaces.entries()) {
    const arr = pdf.context.lookup(ref);
    if (!(arr instanceof PDFArray) || arr.lookup(0)?.toString() !== '/Separation' || arr.lookup(1)?.toString() === '/All') continue;
    const fn = arr.lookup(3) as PDFDict;
    const c1 = (fn.lookup(PDFName.of('C1')) as PDFArray).asArray().map((n) => Number(n.toString()));
    out.set(name.asString().slice(1), { ink: new TextDecoder().decode((arr.lookup(1) as PDFName).asBytes()), c1 });
  }
  return out;
}

/** The resource name of the first page's Separation of `ink`. */
export function separationOf(pdf: PDFDocument, ink: string): string | undefined {
  return [...separations(pdf)].find(([, s]) => s.ink === ink)?.[0];
}

/** The first page's ExtGStates, by resource name. */
export function extGStates(pdf: PDFDocument): Map<string, PDFDict> {
  const out = new Map<string, PDFDict>();
  const states = pdf.getPage(0).node.Resources()?.lookup(PDFName.of('ExtGState'));
  if (!(states instanceof PDFDict)) return out;
  for (const [name, ref] of states.entries()) out.set(name.asString().slice(1), pdf.context.lookup(ref) as PDFDict);
  return out;
}

/** Whether the fill painted right after `/<space> cs` overprints: the
 *  overprint state (an ExtGState that sets `op`) in force at that fill,
 *  following `q` / `Q`. */
export function fillOverprints(pdf: PDFDocument, content: string, space: string): boolean {
  const states = extGStates(pdf);
  const at = content.indexOf(`/${space} cs`);
  if (at < 0) throw new Error(`no fill on ${space}`);
  const fillAt = content.indexOf('\nf', at);
  let op = false;
  const stack: boolean[] = [];
  for (const line of content.slice(0, fillAt).split('\n')) {
    if (line === 'q') stack.push(op);
    else if (line === 'Q') op = stack.pop() ?? false;
    else {
      const m = /^\/(\S+) gs$/.exec(line);
      const flag = m ? states.get(m[1]!)?.lookup(PDFName.of('op')) : undefined;
      if (flag !== undefined) op = flag.toString() === 'true';
    }
  }
  return op;
}

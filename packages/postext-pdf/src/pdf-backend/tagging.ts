/**
 * Tagged (accessible) PDF support, oriented to PDF/UA-1 (ISO 14289-1).
 *
 * A tagged PDF carries a logical structure tree (`/StructTreeRoot`) whose
 * leaves point at *marked-content sequences* in the page content streams:
 * every painted run is wrapped in `/Tag << /MCID n >> BDC … EMC` and a
 * structure element (`P`, `H1`, `Figure`, `TD`, …) lists the MCIDs it owns.
 * Decoration that carries no meaning — page backgrounds, rules, running
 * headers and footers, cut marks — is wrapped in `/Artifact BMC … EMC`
 * instead so assistive technology skips it. The `/ParentTree` maps each
 * page's MCIDs (and each tagged annotation) back to its element.
 *
 * Two objects cooperate:
 *   - {@link StructTree}: the document-level tree, its elements and the
 *     catalog bookkeeping written by {@link StructTree.finalize};
 *   - {@link PageTagger}: the per-page marked-content state. Renderers call
 *     {@link PageTagger.content} / {@link PageTagger.artifact} before every
 *     drawing call; consecutive calls for the same element extend the open
 *     sequence, a change closes it and opens the next one. Sequences never
 *     nest, and {@link PageTagger.close} runs before any `q` / `Q` the page
 *     pushes so marked content stays properly nested with the graphics state.
 */

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  PDFObject,
  PDFOperator,
  PDFOperatorNames,
  PDFPage,
  PDFRef,
  PDFString,
} from 'pdf-lib';
import type { PageCtx } from './primitives';

/** Standard structure types this backend emits (PDF 1.7 §14.8.4). */
export type StructType =
  | 'Document' | 'Div' | 'P' | 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6'
  | 'L' | 'LI' | 'Lbl' | 'LBody' | 'BlockQuote' | 'Figure' | 'Formula'
  | 'Caption' | 'Table' | 'TR' | 'TH' | 'TD' | 'Link' | 'Note' | 'Span';

/** Artifact classes (PDF 1.7 §14.8.2.2). */
export interface ArtifactSpec {
  type?: 'Pagination' | 'Layout' | 'Page' | 'Background';
  subtype?: 'Header' | 'Footer' | 'Watermark';
}

/** Optional element properties. */
export interface StructAttrs {
  /** Alternate description (`/Alt`), required on figures and formulas. */
  alt?: string;
  /** Replacement text (`/ActualText`). */
  actualText?: string;
  /** Language override (`/Lang`, BCP 47). */
  lang?: string;
  /** Attribute dictionaries (`/A`): owner → entries. */
  attributes?: Array<{ owner: 'Layout' | 'List' | 'Table'; entries: Record<string, PDFObject | number | string> }>;
}

/** pdf-lib types operator arguments narrowly, but serialises any
 *  `PDFObject`; a property list (`<< /MCID n >>`) is an ordinary inline
 *  dictionary operand of `BDC`. */
type OperatorArg = Parameters<typeof PDFOperator.of>[1] extends (infer A)[] | undefined ? A : never;
const dictArg = (dict: PDFDict): OperatorArg => dict as unknown as OperatorArg;

type Kid =
  | { kind: 'mcid'; page: PDFPage; mcid: number }
  | { kind: 'elem'; elem: StructElem }
  | { kind: 'objr'; page: PDFPage; annotRef: PDFRef };

export class StructElem {
  readonly kids: Kid[] = [];
  constructor(
    readonly tree: StructTree,
    readonly type: StructType,
    public parent: StructElem | null,
    readonly attrs: StructAttrs,
    readonly ref: PDFRef,
  ) {}

  /** Create a child element (appended after the kids recorded so far). */
  child(type: StructType, attrs: StructAttrs = {}): StructElem {
    return this.tree.elem(type, this, attrs);
  }
}

/** Per-page marked-content state (see the module header). */
export class PageTagger {
  private open: { elem: StructElem } | { artifact: ArtifactSpec } | null = null;
  private nextMcid = 0;
  /** Elements owning each MCID of the page, by MCID. */
  readonly owners: StructElem[] = [];

  constructor(readonly page: PDFPage, readonly structParents: number) {}

  /** Route the content painted next to `elem`. */
  content(elem: StructElem): void {
    if (this.open && 'elem' in this.open && this.open.elem === elem) return;
    this.close();
    const mcid = this.nextMcid++;
    this.owners[mcid] = elem;
    elem.kids.push({ kind: 'mcid', page: this.page, mcid });
    const props = this.page.doc.context.obj({ MCID: mcid });
    this.page.pushOperators(
      PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of(elem.type), dictArg(props)]),
    );
    this.open = { elem };
  }

  /** Flag the content painted next as an artifact of the given class. */
  artifact(spec: ArtifactSpec = {}): void {
    if (this.open && 'artifact' in this.open
      && this.open.artifact.type === spec.type && this.open.artifact.subtype === spec.subtype) return;
    this.close();
    if (spec.type) {
      const dict: Record<string, PDFObject> = { Type: PDFName.of(spec.type) };
      if (spec.subtype) dict.Subtype = PDFName.of(spec.subtype);
      this.page.pushOperators(
        PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
          PDFName.of('Artifact'),
          dictArg(this.page.doc.context.obj(dict)),
        ]),
      );
    } else {
      this.page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContent, [PDFName.of('Artifact')]));
    }
    this.open = { artifact: spec };
  }

  /** End the open sequence, if any. */
  close(): void {
    if (!this.open) return;
    this.page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
    this.open = null;
  }

  get mcidCount(): number {
    return this.nextMcid;
  }
}

/** Route the next drawing calls on `ctx` to `elem` (no-op when untagged). */
export function tagContent(ctx: PageCtx, elem: StructElem | undefined): void {
  if (elem) ctx.tags?.content(elem);
}

/** Flag the next drawing calls on `ctx` as an artifact (no-op when untagged). */
export function tagArtifact(ctx: PageCtx, spec?: ArtifactSpec): void {
  ctx.tags?.artifact(spec);
}

export interface StructTreeOptions {
  /** Document title — also written to the XMP `dc:title`. */
  title: string;
  author?: string;
  /** BCP 47 language tag of the document (`/Lang`). */
  lang?: string;
  /** `pdf:Producer` / `xmp:CreatorTool` of the XMP packet. */
  producer: string;
  creatorTool: string;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** XMP packet identifying the file as PDF/UA-1 and carrying the Dublin
 *  Core title / creator / language (PDF/UA-1 §7.1 requires `dc:title`). */
export function buildXmp(opts: StructTreeOptions): string {
  const title = xmlEscape(opts.title);
  const creator = opts.author ? `<dc:creator><rdf:Seq><rdf:li>${xmlEscape(opts.author)}</rdf:li></rdf:Seq></dc:creator>` : '';
  const language = opts.lang ? `<dc:language><rdf:Bag><rdf:li>${xmlEscape(opts.lang)}</rdf:li></rdf:Bag></dc:language>` : '';
  return (
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n' +
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"' +
    ' xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"' +
    ' xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">\n' +
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>\n` +
    `${creator}${language}` +
    `<pdf:Producer>${xmlEscape(opts.producer)}</pdf:Producer>\n` +
    `<xmp:CreatorTool>${xmlEscape(opts.creatorTool)}</xmp:CreatorTool>\n` +
    '<pdfuaid:part>1</pdfuaid:part>\n' +
    '</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n' +
    '<?xpacket end="w"?>'
  );
}

/** The document's logical structure. Create it before any page is added,
 *  call {@link beginPage} for every page, tag content through the returned
 *  {@link PageTagger}, and {@link finalize} once every page and annotation
 *  exists. */
export class StructTree {
  readonly root: StructElem;
  private readonly elems: StructElem[] = [];
  private readonly pages: PageTagger[] = [];
  private readonly annotParents: Array<{ key: number; elem: StructElem }> = [];
  private nextParentKey = 0;

  constructor(readonly pdfDoc: PDFDocument, readonly options: StructTreeOptions) {
    this.root = this.elem('Document', null, {});
  }

  /** Create an element under `parent` (`null` only for the root). */
  elem(type: StructType, parent: StructElem | null, attrs: StructAttrs = {}): StructElem {
    const el = new StructElem(this, type, parent, attrs, this.pdfDoc.context.nextRef());
    this.elems.push(el);
    if (parent) parent.kids.push({ kind: 'elem', elem: el });
    return el;
  }

  /** Start tagging a page: assigns its `/StructParents` key and sets
   *  `/Tabs /S` (structure tab order, required once annotations exist). */
  beginPage(page: PDFPage): PageTagger {
    const tagger = new PageTagger(page, this.nextParentKey++);
    this.pages.push(tagger);
    page.node.set(PDFName.of('StructParents'), PDFNumber.of(tagger.structParents));
    page.node.set(PDFName.of('Tabs'), PDFName.of('S'));
    return tagger;
  }

  /** Register an annotation as a kid (`OBJR`) of `elem`; returns the
   *  `/StructParent` key the annotation dictionary must carry. */
  annotation(elem: StructElem, page: PDFPage, annotRef: PDFRef): number {
    const key = this.nextParentKey++;
    elem.kids.push({ kind: 'objr', page, annotRef });
    this.annotParents.push({ key, elem });
    return key;
  }

  /** Remove `elem` from the tree, handing its kids to its parent in place
   *  (used for a `Link` whose annotation never materialised). */
  dissolve(elem: StructElem): void {
    const parent = elem.parent;
    if (!parent) return;
    const at = parent.kids.findIndex((k) => k.kind === 'elem' && k.elem === elem);
    if (at < 0) return;
    for (const kid of elem.kids) {
      if (kid.kind === 'elem') kid.elem.parent = parent;
      if (kid.kind === 'mcid') {
        const tagger = this.pages.find((p) => p.page === kid.page);
        if (tagger) tagger.owners[kid.mcid] = parent;
      }
    }
    parent.kids.splice(at, 1, ...elem.kids);
    elem.kids.length = 0;
    elem.parent = null;
    const idx = this.elems.indexOf(elem);
    if (idx >= 0) this.elems.splice(idx, 1);
  }

  private attrDict(owner: string, entries: Record<string, PDFObject | number | string>): PDFDict {
    const ctx = this.pdfDoc.context;
    const dict: Record<string, PDFObject> = { O: PDFName.of(owner) };
    for (const [k, v] of Object.entries(entries)) {
      dict[k] = typeof v === 'number' ? PDFNumber.of(v) : typeof v === 'string' ? PDFName.of(v) : v;
    }
    return ctx.obj(dict);
  }

  private writeElem(el: StructElem): void {
    const ctx = this.pdfDoc.context;
    const dict: Record<string, PDFObject> = {
      Type: PDFName.of('StructElem'),
      S: PDFName.of(el.type),
      P: el.parent ? el.parent.ref : this.structTreeRootRef,
    };
    const kids: PDFObject[] = [];
    let firstPage: PDFPage | undefined;
    for (const kid of el.kids) {
      if (kid.kind === 'elem') {
        kids.push(kid.elem.ref);
      } else if (kid.kind === 'mcid') {
        firstPage ??= kid.page;
        kids.push(ctx.obj({ Type: PDFName.of('MCR'), Pg: kid.page.ref, MCID: PDFNumber.of(kid.mcid) }));
      } else {
        firstPage ??= kid.page;
        kids.push(ctx.obj({ Type: PDFName.of('OBJR'), Pg: kid.page.ref, Obj: kid.annotRef }));
      }
    }
    if (kids.length > 0) dict.K = ctx.obj(kids);
    if (firstPage) dict.Pg = firstPage.ref;
    if (el.attrs.alt !== undefined) dict.Alt = PDFHexString.fromText(el.attrs.alt);
    if (el.attrs.actualText !== undefined) dict.ActualText = PDFHexString.fromText(el.attrs.actualText);
    if (el.attrs.lang !== undefined) dict.Lang = PDFString.of(el.attrs.lang);
    if (el.attrs.attributes && el.attrs.attributes.length > 0) {
      const dicts = el.attrs.attributes.map((a) => this.attrDict(a.owner, a.entries));
      dict.A = dicts.length === 1 ? dicts[0]! : ctx.obj(dicts);
    }
    ctx.assign(el.ref, ctx.obj(dict));
  }

  private structTreeRootRef!: PDFRef;

  /** Write the structure elements, the parent tree, the catalog entries
   *  (`/StructTreeRoot`, `/MarkInfo`, `/Lang`, `/ViewerPreferences`) and the
   *  XMP metadata packet. Closes any sequence still open on a page. */
  finalize(): void {
    const ctx = this.pdfDoc.context;
    for (const tagger of this.pages) tagger.close();

    this.structTreeRootRef = ctx.nextRef();
    for (const el of this.elems) this.writeElem(el);

    // Parent tree: page keys → array indexed by MCID; annotation keys → element.
    const entries: Array<{ key: number; value: PDFObject }> = [];
    for (const tagger of this.pages) {
      const owners: PDFObject[] = [];
      for (let i = 0; i < tagger.mcidCount; i++) {
        const owner = tagger.owners[i];
        owners.push(owner ? owner.ref : PDFNull);
      }
      entries.push({ key: tagger.structParents, value: ctx.obj(owners) });
    }
    for (const { key, elem } of this.annotParents) entries.push({ key, value: elem.ref });
    entries.sort((a, b) => a.key - b.key);
    const nums = PDFArray.withContext(ctx);
    for (const { key, value } of entries) {
      nums.push(PDFNumber.of(key));
      nums.push(value);
    }
    const parentTreeRef = ctx.register(ctx.obj({ Nums: nums }));

    ctx.assign(this.structTreeRootRef, ctx.obj({
      Type: PDFName.of('StructTreeRoot'),
      K: ctx.obj([this.root.ref]),
      ParentTree: parentTreeRef,
      ParentTreeNextKey: PDFNumber.of(this.nextParentKey),
    }));

    const catalog = this.pdfDoc.catalog;
    catalog.set(PDFName.of('StructTreeRoot'), this.structTreeRootRef);
    catalog.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: true }));
    if (this.options.lang) this.pdfDoc.setLanguage(this.options.lang);
    this.pdfDoc.setTitle(this.options.title, { showInWindowTitleBar: true });
    if (this.options.author) this.pdfDoc.setAuthor(this.options.author);

    const xmp = buildXmp(this.options);
    const metadata = ctx.stream(new TextEncoder().encode(xmp), {
      Type: 'Metadata',
      Subtype: 'XML',
    });
    catalog.set(PDFName.of('Metadata'), ctx.register(metadata));
  }
}

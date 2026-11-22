/**
 * The die line (#1566): on every page with a die-cut (`VDTPage.dieCut`),
 * the holes and the leaf's shaped outline stroked on a plate of their own,
 * the one the die-maker reads and the press never inks.
 *
 * - The plate is `[/Separation /<ink> /DeviceCMYK <tint fn>]`, named by
 *   `print.dieLine.ink` through `printableInkName` (default `Die`), its
 *   alternate the configured CMYK (default 100 % magenta) so a proof shows
 *   it.
 * - It overprints (`OP`/`op` true, `OPM 1`), so it never knocks a white
 *   hole into the plates under it.
 * - In a tagged PDF it is an artifact. Outside PDF/X-1a, which allows no
 *   optional content, it sits in an optional content group "Die line" a
 *   reader can hide.
 *
 * - An emboss or a deboss (#1667, `VDTPage.plates`) is filled on a plate of
 *   its own the same way (`Emboss`, `Deboss`), in its own group.
 *
 * It is written after the page's crop marks and after the print pass
 * (`printPass.ts`), so nothing reworks its colour or its overprint.
 */

import {
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  popGraphicsState,
  pushGraphicsState,
  setGraphicsState,
  setLineWidth,
  setLineJoin,
  setLineCap,
  stroke,
  fill,
  LineCapStyle,
  LineJoinStyle,
  type PDFDocument,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';
import {
  dimensionToPx,
  printableInkName,
  resolvePrintDieLine,
  type ResolvedPrintDieLineConfig,
  type VDTDieCut,
  type VDTDocument,
  type VDTPage,
  type VDTPathCommand,
} from 'postext';
import { inkPdfName } from '../../print/spot.js';
import { traceOps } from '../vector/pathBlock.js';

/** The name of the optional content group the die line sits in. */
export const DIE_LINE_LAYER = 'Die line';

export interface DieLineOptions {
  /** Put the die line in an optional content group (not in PDF/X-1a). */
  optionalContent: boolean;
  /** Mark it as an artifact (a tagged PDF). */
  tagged: boolean;
}

/** The paths a die cuts on a page: each hole, then the outline. */
export function dieLinePaths(cut: VDTDieCut | undefined): VDTPathCommand[][] {
  if (!cut) return [];
  return [...cut.holes, ...(cut.outline ?? [])].filter((p) => p.length > 0);
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

type OperatorArg = Parameters<typeof PDFOperator.of>[1] extends (infer A)[] | undefined ? A : never;

/** The resource names a page's die line is drawn with. */
export interface DieLineNames {
  space: PDFName;
  state: PDFName;
  /** The optional content group's property name; absent: none. */
  layer?: PDFName;
  /** The artifact's property list, in a tagged PDF. */
  artifact?: PDFDict;
}

/**
 * The operators of a page's die line: every path stroked at `widthPt` on
 * the die plate at full tint, under the overprinting state, inside the
 * optional content group and the artifact when given. Round joins and
 * caps, so a corner of a hole is cut as drawn.
 */
export function dieLineOps(
  paths: readonly VDTPathCommand[][],
  frame: { scale: number; pageHeightPt: number },
  widthPt: number,
  names: DieLineNames,
): PDFOperator[] {
  if (paths.length === 0) return [];
  const open: PDFOperator[] = [];
  const close: PDFOperator[] = [];
  if (names.artifact) {
    open.push(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('Artifact'), names.artifact as unknown as OperatorArg]));
    close.push(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  }
  if (names.layer) {
    open.push(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('OC'), names.layer]));
    close.unshift(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  }
  return [
    ...open,
    pushGraphicsState(),
    setGraphicsState(names.state),
    PDFOperator.of(PDFOperatorNames.StrokingColorspace, [names.space]),
    PDFOperator.of(PDFOperatorNames.StrokingColorN, [PDFNumber.of(1)]),
    setLineWidth(round4(Math.max(0.01, widthPt))),
    setLineJoin(LineJoinStyle.Round),
    setLineCap(LineCapStyle.Round),
    ...traceOps(frame, paths),
    stroke(),
    popGraphicsState(),
    ...close,
  ];
}

/**
 * The operators of a page's relief plate (#1667): every outline filled on
 * the plate at full tint (nonzero), under the overprinting state, inside
 * the optional content group and the artifact when given.
 */
export function reliefOps(
  paths: readonly VDTPathCommand[][],
  frame: { scale: number; pageHeightPt: number },
  names: DieLineNames,
): PDFOperator[] {
  if (paths.length === 0) return [];
  const open: PDFOperator[] = [];
  const close: PDFOperator[] = [];
  if (names.artifact) {
    open.push(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('Artifact'), names.artifact as unknown as OperatorArg]));
    close.push(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  }
  if (names.layer) {
    open.push(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('OC'), names.layer]));
    close.unshift(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  }
  return [
    ...open,
    pushGraphicsState(),
    setGraphicsState(names.state),
    PDFOperator.of(PDFOperatorNames.NonStrokingColorspace, [names.space]),
    PDFOperator.of(PDFOperatorNames.NonStrokingColorN, [PDFNumber.of(1)]),
    ...traceOps(frame, paths),
    fill(),
    popGraphicsState(),
    ...close,
  ];
}

/** A dictionary of a page's resources (`ColorSpace`, `Properties`),
 *  made when missing. */
function resourceDict(page: PDFPage, key: string): PDFDict {
  const { Resources } = page.node.normalizedEntries();
  let dict = Resources.lookupMaybe(PDFName.of(key), PDFDict);
  if (!dict) {
    dict = page.doc.context.obj({});
    Resources.set(PDFName.of(key), dict);
  }
  return dict;
}

/** The relief plates (#1667): each process's plate name, as the printer
 *  and the die-maker read it, and the alternate a proof shows it in. */
export const RELIEF_PLATES: Readonly<Record<'emboss' | 'deboss', { ink: string; layer: string; cmyk: { c: number; m: number; y: number; k: number } }>> = {
  emboss: { ink: 'Emboss', layer: 'Emboss', cmyk: { c: 100, m: 0, y: 0, k: 0 } },
  deboss: { ink: 'Deboss', layer: 'Deboss', cmyk: { c: 0, m: 0, y: 100, k: 0 } },
};

/** One non-printing plate's objects: its colour space and its optional
 *  content group, written once in the document. */
interface PlateObjects {
  space: PDFRef;
  layer?: PDFRef;
}

/**
 * The die line of one render, and the relief plates of its embosses and
 * debosses (#1667): each plate's colour space, the overprinting state and
 * each plate's optional content group, written once in the document, and
 * the pages that draw them. A relief is filled, not stroked: the
 * die-maker engraves the area. `print.dieLine.output: 'none'` leaves the
 * reliefs out as well.
 */
export class DieLineWriter {
  readonly config: ResolvedPrintDieLineConfig;
  /** The plate's name as the PDF writes it. */
  readonly plateName: string;
  private readonly plates = new Map<string, PlateObjects>();
  private readonly layers: PDFRef[] = [];
  private state?: PDFRef;
  private drawn = 0;

  constructor(
    private readonly pdfDoc: PDFDocument,
    config: ResolvedPrintDieLineConfig | undefined,
    private readonly options: DieLineOptions,
  ) {
    // A configuration resolved before the die line existed has none.
    this.config = config ?? resolvePrintDieLine();
    this.plateName = printableInkName(this.config.ink);
  }

  /** How many pages carry the die line or a relief plate so far. */
  get pages(): number {
    return this.drawn;
  }

  /** Stroke `vdtPage`'s die-cut on `page` (its sheet) and fill its relief
   *  plates, when it has them and the die line is on. Returns whether
   *  anything was drawn. */
  draw(page: PDFPage, vdtPage: VDTPage, doc: VDTDocument): boolean {
    if (this.config.output === 'none') return false;
    const paths = dieLinePaths(vdtPage.dieCut);
    const reliefs = (vdtPage.plates ?? []).filter((p) => p.paths.length > 0);
    if (paths.length === 0 && reliefs.length === 0) return false;
    const scale = 72 / doc.config.page.dpi;
    const frame = { scale, pageHeightPt: vdtPage.height * scale };
    const artifact = this.options.tagged ? page.doc.context.obj({ Type: PDFName.of('Layout') }) : undefined;
    const state = page.node.newExtGState('GSDie', this.stateRef());
    if (paths.length > 0) {
      const names = this.pageNames(page, this.plateName, this.config.cmyk, DIE_LINE_LAYER, 'CSDie', 'OCDie');
      const widthPt = dimensionToPx(this.config.width, doc.config.page.dpi) * scale;
      page.pushOperators(...dieLineOps(paths, frame, widthPt, { ...names, state, ...(artifact ? { artifact } : {}) }));
    }
    for (const process of ['emboss', 'deboss'] as const) {
      const shapes = reliefs.filter((r) => r.process === process).flatMap((r) => r.paths);
      if (shapes.length === 0) continue;
      const plate = RELIEF_PLATES[process];
      const names = this.pageNames(page, printableInkName(plate.ink), plate.cmyk, plate.layer, `CS${plate.ink}`, `OC${plate.ink}`);
      page.pushOperators(...reliefOps(shapes, frame, { ...names, state, ...(artifact ? { artifact } : {}) }));
    }
    this.drawn++;
    return true;
  }

  /** A plate's colour space and optional content group named in `page`'s
   *  resources. */
  private pageNames(page: PDFPage, ink: string, cmyk: { c: number; m: number; y: number; k: number }, layerName: string, spaceKey: string, layerKey: string): { space: PDFName; layer?: PDFName } {
    const objects = this.plateObjects(ink, cmyk, layerName);
    const spaces = resourceDict(page, 'ColorSpace');
    const space = spaces.uniqueKey(spaceKey);
    spaces.set(space, objects.space);
    if (!objects.layer) return { space };
    const properties = resourceDict(page, 'Properties');
    const layer = properties.uniqueKey(layerKey);
    properties.set(layer, objects.layer);
    return { space, layer };
  }

  private plateObjects(ink: string, cmyk: { c: number; m: number; y: number; k: number }, layerName: string): PlateObjects {
    const known = this.plates.get(ink);
    if (known) return known;
    const context = this.pdfDoc.context;
    const { c, m, y, k } = cmyk;
    const fn = context.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [c / 100, m / 100, y / 100, k / 100].map(round4), N: 1 });
    const space = context.register(context.obj([PDFName.of('Separation'), inkPdfName(ink), PDFName.of('DeviceCMYK'), fn]));
    const objects: PlateObjects = { space, ...(this.options.optionalContent ? { layer: this.layerRef(layerName) } : {}) };
    this.plates.set(ink, objects);
    return objects;
  }

  private stateRef(): PDFRef {
    this.state ??= this.pdfDoc.context.register(this.pdfDoc.context.obj({ Type: 'ExtGState', OP: true, op: true, OPM: 1 }));
    return this.state;
  }

  /** An optional content group, listed in the catalog's `OCProperties`
   *  with the others: on by default, named in the default configuration
   *  as PDF/X-4 asks. */
  private layerRef(name: string): PDFRef {
    const context = this.pdfDoc.context;
    const layer = context.register(context.obj({ Type: 'OCG', Name: PDFHexString.fromText(name) }));
    this.layers.push(layer);
    this.pdfDoc.catalog.set(
      PDFName.of('OCProperties'),
      context.obj({
        OCGs: [...this.layers],
        D: { Name: PDFHexString.fromText('Postext'), Order: [...this.layers], ON: [...this.layers], OFF: [] },
      }),
    );
    return layer;
  }
}

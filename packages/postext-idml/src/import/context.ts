// What every part of the importer shares: the document, the options, the
// report, the identifiers handed out and the things gathered on the way
// (resources, files, styles of inline marks).

import type { CharacterStyleConfig, ChipStyleConfig, ColorValue, MarkStyleConfig, Resource } from 'postext';
import type { IdmlDestination, IdmlDocument, IdmlHyperlink, IdmlPage, IdmlPageItem, IdmlParagraph, IdmlRun } from '../model/document.js';
import { findOrdered, readingOrder, type OrderedStory } from '../resolve/order.js';
import { Ids, idOf } from './escape.js';
import { Looks } from './looks.js';
import { Reporter } from './report.js';
import type { IdmlImportOptions } from './types.js';
import { Palette } from './values.js';

export interface Resolved {
  layout: 'auto' | 'pages' | 'flow';
  hiddenLayers: boolean;
  hiddenObjects: boolean;
  pasteboard: boolean;
  nonPrinting: boolean;
  allConditions: boolean;
  rejectChanges: boolean;
  masterItems: boolean;
}

export class Context {
  readonly rep = new Reporter();
  readonly palette: Palette;
  readonly looks: Looks;
  readonly opt: Resolved;
  readonly order: OrderedStory[];
  readonly resourceIds = new Ids();
  readonly anchorIds = new Ids();
  readonly styleIds = new Ids();
  readonly resources: Resource[] = [];
  readonly files = new Map<string, Uint8Array>();
  readonly missing = new Map<string, { name: string; uri: string; uses: number }>();
  readonly markStyles = new Map<string, MarkStyleConfig>();
  readonly chipStyles = new Map<string, ChipStyleConfig>();
  /** Character styles of the book (`:span[…]{style}`), by the look
   *  they set (`spanStyle`, #1555). */
  readonly characterStyles = new Map<string, CharacterStyleConfig>();
  /** Hyperlinks and cross-references by the `Self` of their source. */
  readonly linkBySource = new Map<string, IdmlHyperlink>();
  /** Destinations a link or a reference of the book points at → anchor. */
  readonly anchorOf = new Map<string, string>();
  /** Pages a link points at → anchor. */
  readonly pageAnchor = new Map<string, string>();
  /** Characters set per face (`family\u0000style`). */
  readonly faces = new Map<string, number>();
  /** Characters set per language tag. */
  readonly languages = new Map<string, number>();
  private readonly hiddenConditions: Set<string>;
  private noteSeq = 0;
  counts = { stories: 0, paragraphs: 0, characters: 0, pictures: 0, tables: 0, footnotes: 0, hyperlinks: 0, indexMarks: 0 };
  /** The word a typed caption label used, by kind of resource. */
  readonly labelWords = new Map<'figure' | 'table', string>();
  /** The look of the first caption read: the captions' style follows it. */
  captionLook?: import('./looks.js').Look;
  /** That caption typed its label ("Figure 3.") in the caption's own weight. */
  captionLabelPlain = false;
  /** A paragraph of a note, for the notes' type. */
  noteParagraph: IdmlParagraph | undefined;
  /** The document's index holds entries: the book prints one. */
  hasIndexMarks = false;
  /** The paragraph each text or paragraph destination of the text the
   *  book sets stands in (`fidelity/crossref`). */
  readonly destinationParagraph = new Map<string, IdmlParagraph>();
  /** Stories joined to another (a paragraph that goes on in the next
   *  frame), by their `Self`: the joined story. */
  readonly alias = new Map<string, OrderedStory>();
  /** Anchored objects set in a frame of their own on the page: the text
   *  they are anchored in leaves them out. */
  readonly placedAnchors = new Set<IdmlPageItem>();

  constructor(readonly doc: IdmlDocument, readonly options: IdmlImportOptions) {
    this.palette = new Palette(doc, this.rep);
    this.looks = new Looks(doc);
    this.opt = {
      layout: options.layout === 'pages' || options.layout === 'flow' ? options.layout : 'auto',
      hiddenLayers: options.hiddenLayers === 'include',
      hiddenObjects: options.hiddenObjects === 'include',
      pasteboard: options.pasteboard === 'include',
      nonPrinting: options.nonPrinting === 'include',
      allConditions: options.conditions === 'all',
      rejectChanges: options.trackedChanges === 'reject',
      masterItems: options.masterItems !== false,
    };
    this.order = readingOrder(doc);
    this.hiddenConditions = new Set([...doc.conditions.values()].filter((c) => !c.visible).map((c) => c.self));
    for (const h of doc.hyperlinks) if (h.source && !this.linkBySource.has(h.source)) this.linkBySource.set(h.source, h);
    // Every destination a link names gets an anchor; the others print
    // nothing in InDesign either and are only counted.
    let unused = 0;
    const named = new Set(doc.hyperlinks.map((h) => h.destination).filter((d): d is string => !!d));
    for (const d of doc.destinations.values()) {
      if (d.kind !== 'text' && d.kind !== 'paragraph') continue;
      if (named.has(d.self)) this.anchorOf.set(d.self, this.anchorIds.take(idOf(d.name, 'anchor')));
      else unused++;
    }
    if (unused) this.rep.add('unusedAnchors', 'info', 'Text anchors no link points at are left out (they print nothing)', undefined, unused);
  }

  entryOf(story: string): OrderedStory | undefined {
    return findOrdered(this.order, story);
  }

  destination(self: string | undefined): IdmlDestination | undefined {
    return self ? this.doc.destinations.get(self) : undefined;
  }

  nextNote(): string {
    return `n${++this.noteSeq}`;
  }

  /** The anchor of a page a link points at (made on first use). */
  anchorForPage(page: IdmlPage): string {
    let id = this.pageAnchor.get(page.self);
    if (!id) this.pageAnchor.set(page.self, (id = this.anchorIds.take(`page-${idOf(page.name, String(page.index + 1))}`)));
    return id;
  }

  pageByRef(ref: string | undefined): IdmlPage | undefined {
    if (!ref) return undefined;
    for (const s of this.doc.spreads) for (const p of s.pages) if (p.self === ref) return p;
    return undefined;
  }

  /** Whether a run is part of the text the book prints: conditions that
   *  are switched off and tracked deletions leave it out. Each case is
   *  counted. */
  runShown(run: IdmlRun, sample: () => string): boolean {
    if (run.change) {
      const drop = this.opt.rejectChanges ? run.change === 'inserted' || run.change === 'moved' : run.change === 'deleted';
      this.rep.add('trackedChanges', 'info', this.opt.rejectChanges ? 'Tracked changes are rejected: inserted text is left out, deleted text kept' : 'Tracked changes are accepted: inserted text is kept, deleted text left out', sample());
      if (drop) return false;
    }
    const off = run.hidden || run.conditions.some((c) => this.hiddenConditions.has(c));
    if (run.conditions.length || run.hidden) {
      if (off && !this.opt.allConditions) {
        this.rep.add('hiddenConditionalText', 'info', 'Text under a condition that is switched off is left out', sample());
        return false;
      }
      this.rep.add('conditionalText', 'info', 'Conditional text is set as ordinary text: Postext has no conditions', sample());
    }
    return true;
  }

  /** `runShown` without the report: whether the book prints the run. */
  runPrinted(run: IdmlRun): boolean {
    if (run.change && (this.opt.rejectChanges ? run.change === 'inserted' || run.change === 'moved' : run.change === 'deleted')) return false;
    const off = run.hidden || run.conditions.some((c) => this.hiddenConditions.has(c));
    return !off || this.opt.allConditions;
  }

  /** A mark style that only colours its text. */
  inkStyle(colour: ColorValue): string {
    const id = `ink-${colour.paletteId ?? colour.hex.replace('#', '')}`;
    if (!this.markStyles.has(id)) {
      this.markStyles.set(id, { id, name: `Text colour ${colour.paletteId ?? colour.hex}`, color: colour, background: { hex: '#ffffff00', model: 'hex' }, paddingX: { value: 0, unit: 'em' }, paddingY: { value: 0, unit: 'em' } });
    }
    return id;
  }

  countFace(family: string | undefined, style: string, characters: number): void {
    if (!family || !characters) return;
    const key = `${family}\u0000${style}`;
    this.faces.set(key, (this.faces.get(key) ?? 0) + characters);
  }

  sample(para: IdmlParagraph): string {
    let s = '';
    for (const r of para.runs) for (const i of r.content) if (i.kind === 'text' && s.length < 60) s += i.text;
    return s.trim().slice(0, 60);
  }
}

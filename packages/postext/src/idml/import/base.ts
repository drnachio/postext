// The converter's state and the helpers both its halves use (`design.ts`,
// `convert.ts`): the notes, the roles of the styles, the ids they get.

import type { Resource } from '../../types.js';
import { analyzeIdml, linkName, type CharacterRole, type IdmlAnalysis, type ParagraphRole } from './analyze.js';
import { Slugger, slugify } from './markdown.js';
import { type IdmlDocument } from './read.js';
import type { IdmlImportOptions, IdmlNoteId } from './types.js';

export interface Chapter {
  title: string;
  blocks: string[];
  notes: string[];
  /** Resources made in this chapter, for its captions. */
  resources: Resource[];
}


/** The state of a conversion, and what both halves read from it. */
export abstract class ConverterBase {
  protected readonly analysis: IdmlAnalysis;
  protected readonly notes = new Map<IdmlNoteId, { count: number; examples: Set<string> }>();
  protected readonly slugs = new Slugger();
  protected readonly resources: Resource[] = [];
  protected readonly files = new Map<string, { bytes: Uint8Array; mime: string }>();
  protected readonly fileOf = new Map<string, string>();
  protected readonly links = new Map<string, Uint8Array>();
  protected readonly paletteIds = new Map<string, string>();
  protected readonly paragraphIds = new Map<string, string>();
  protected readonly characterIds = new Map<string, string>();
  /** Spot swatches the colours used, set as their CMYK equivalent. */
  protected readonly spots = new Set<string>();
  protected readonly calloutIds = new Map<string, string>();
  protected readonly now = Date.now();
  protected chapters: Chapter[] = [];
  protected noteNo = 0;
  protected list: string[] = [];
  protected box: { type: string; title?: string; body: string[] } | undefined;
  protected pendingCaption: string | undefined;
  /** Pages that print a chapter's title in a frame of their own (openers). */
  protected readonly titlePages = new Set<number>();
  /** The chapter each page of a long story belongs to. */
  protected readonly pageChapter = new Map<number, number>();
  protected fonts = new Set<string>();

  constructor(protected readonly doc: IdmlDocument, protected readonly options: IdmlImportOptions) {
    this.analysis = analyzeIdml(doc);
    for (const [name, bytes] of options.links ?? []) this.links.set(linkName(name).toLowerCase(), bytes);
  }

  protected note(id: IdmlNoteId, example?: string, count = 1): void {
    const entry = this.notes.get(id) ?? { count: 0, examples: new Set<string>() };
    entry.count += count;
    if (example && entry.examples.size < 6) entry.examples.add(example);
    this.notes.set(id, entry);
  }

  protected role(style: string): ParagraphRole {
    return this.options.paragraphRoles?.[style] ?? this.analysis.paragraphStyles.find((s) => s.self === style)?.guess ?? 'body';
  }

  protected charRole(style: string): CharacterRole {
    if (!style) return 'auto';
    return this.options.characterRoles?.[style] ?? this.analysis.characterStyles.find((s) => s.self === style)?.guess ?? 'auto';
  }

  protected styleName(self: string, kind: 'p' | 'c'): string {
    const map = kind === 'p' ? this.doc.paragraphStyles : this.doc.characterStyles;
    return map.get(self)?.name ?? self.replace(/^(Paragraph|Character)Style\//, '');
  }

  /** The id of the Postext style an IDML style becomes. A style
   *  named after a Postext one (`Paragraph lead`, `Box note`) gets its id
   *  back. */
  protected idFor(self: string, kind: 'p' | 'c' | 'box'): string {
    const map = kind === 'p' ? this.paragraphIds : kind === 'c' ? this.characterIds : this.calloutIds;
    const known = map.get(self);
    if (known) return known;
    const name = this.styleName(self, kind === 'c' ? 'c' : 'p');
    const back = (kind === 'p' ? /^Paragraph\s+(\S.*)$/ : kind === 'c' ? /^Character\s+(\S.*)$/ : /^Box(?: title)?\s+(\S.*)$/).exec(name)?.[1];
    const taken = new Set(map.values());
    let id = back && /^[\w-]+$/.test(back) && !taken.has(back) ? back : slugify(name, 4, 32);
    for (let n = 2; taken.has(id); n++) id = `${slugify(name, 4, 32)}-${n}`;
    map.set(self, id);
    return id;
  }

  /** A figure resource for the picture `uri` links to (the text half). */
  protected abstract picture(uri: string, frame?: [number, number, number, number]): string | undefined;
}

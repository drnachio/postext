// Word model → Postext chapters. Each paragraph style becomes what the
// template says (heading, paragraph style, callout, quote, caption…), runs
// become inline marks, Word lists become Postext lists, notes become
// footnotes, pictures and tables become resources placed where they were.

import type { PostextConfig, TableCell, TableModel } from '../types';
import { guardLineStart, renderInline, WORD_JOINER, type InlineRun } from './inline';
import type { WordBlock, WordDocument, WordMedia, WordParagraph, WordRun, WordTable, WordTextRun } from './model';
import {
  guessCharacterTarget,
  guessParagraphTarget,
  lookup,
  type CharacterTarget,
  type ParagraphTarget,
  type WordTemplate,
} from './template';

export type ChapterMode = 'single' | 'split';

export interface ImportedPicture {
  id: string;
  media: WordMedia;
  name?: string;
  alt?: string;
  caption?: string;
}

export interface ImportedTable {
  id: string;
  model: TableModel;
  caption?: string;
}

export interface ImportedChapter {
  title: string;
  markdown: string;
}

export interface ImportResult {
  chapters: ImportedChapter[];
  pictures: ImportedPicture[];
  tables: ImportedTable[];
  /** Pictures in formats the Sandbox cannot show (EMF, WMF, TIFF). */
  skippedPictures: string[];
  /** Footnotes on headings (a heading prints a marker as text): dropped. */
  droppedHeadingNotes: number;
}

export interface ImportSettings {
  template: WordTemplate;
  config: PostextConfig;
  /** One chapter, or a new chapter at every level-1 heading (and at every
   *  `Postext Chapter` paragraph of a Sandbox export). */
  chapters: ChapterMode;
  /** Resource ids already taken (the project's). */
  existingIds: ReadonlySet<string>;
  /** Title of text before the first chapter break. */
  untitledChapter: string;
}

/** The target of a paragraph style: the template's, else a guess. */
export function paragraphTargetOf(doc: WordDocument, styleId: string, template: WordTemplate, config: PostextConfig): ParagraphTarget {
  const id = styleId || doc.defaultParagraphStyle;
  const style = doc.styles.get(id);
  const name = style?.name ?? (id || 'Normal');
  return lookup(template.paragraphs, name) ?? guessParagraphTarget(name, config, doc, style);
}

/** The target of a character style: the template's, else a guess. */
export function characterTargetOf(doc: WordDocument, name: string, template: WordTemplate, config: PostextConfig): CharacterTarget {
  const style = [...doc.styles.values()].find((s) => s.type === 'character' && s.name === name);
  return lookup(template.characters, name) ?? guessCharacterTarget(name, config, doc, style);
}

const CAPTION_LABEL_RE = /^\s*(?:fig(?:ure|ura|\.)?|figs?\.|table|tabla|tab\.|taula|tableau|tabelle|tabella|plate|lámina|làmina|chart|gráfico|map|mapa|image|imagen|imatge|ilustración|il·lustració|illustration|esquema|diagram|diagrama|图|表|図|شكل|جدول)\s*[0-9IVXLC٠-٩]+(?:[.\-–][0-9٠-٩]+)*\s*[.:\-–—]?\s*/iu;

/** A caption without its typed label (Postext numbers resources). */
export function stripCaptionLabel(text: string): string {
  return text.replace(CAPTION_LABEL_RE, '');
}

const attrValue = (v: string): string => `"${v.replace(/"/g, '”').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()}"`;

function slugify(text: string, fallback: string): string {
  const s = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
    .split('-').slice(0, 4).join('-').slice(0, 40).replace(/-+$/, '');
  return s || fallback;
}

type Chunk = { kind: 'block' | 'list' | 'markup'; text: string };

function joinChunks(chunks: Chunk[]): string {
  let out = '';
  chunks.forEach((c, i) => {
    if (i > 0) {
      const prev = chunks[i - 1]!;
      out += (prev.kind === c.kind && c.kind !== 'block') ? '\n' : '\n\n';
    }
    out += c.text;
  });
  return out;
}

/** Container fences a markup paragraph opens (`:::callout{…}`); a bare
 *  `:::` closes the innermost. Inside one, paragraph styles mapped to
 *  callouts and paragraph styles do not open boxes of their own. */
const FENCE_OPEN_RE = /^:::\s*(callout|paragraphs|part|columns|paper|verse|references|page|strip)\b/;
const FENCE_CLOSE_RE = /^:::\s*$/;

interface Group {
  kind: 'callout' | 'paragraphs' | 'verse';
  key: string;
  title?: string;
  chunks: Chunk[];
  /** A poem (#620): its last stanza came from a one-line paragraph, which
   *  the next one-line paragraph runs on (verse typed a line a paragraph). */
  runOn?: boolean;
  /** A poem: an empty paragraph ended its last stanza. */
  stanzaBreak?: boolean;
  /** A poem: a line carries a hemistich separator (`||`), so the fence
   *  names the line layout. */
  layoutLines?: boolean;
}

interface ListLevel { ilvl: number; indent: number; width: number }

class Converter {
  private chapters: ImportedChapter[] = [];
  private chunks: Chunk[] = [];
  private notes: string[] = [];
  private title: string | undefined;
  private group: Group | null = null;
  private explicitDepth = 0;
  private list: ListLevel[] = [];
  private counters = new Map<string, number>();
  private noteSeq = 0;
  private pendingCaption: string | undefined;
  private lastResource: ImportedPicture | ImportedTable | null = null;
  private usedIds: Set<string>;
  private hasChapterMarkers: boolean;
  readonly pictures: ImportedPicture[] = [];
  readonly tables: ImportedTable[] = [];
  readonly skippedPictures: string[] = [];
  droppedHeadingNotes = 0;

  /** Tidy style boundaries (spaces between two bold words, a style change
   *  inside a word) in documents from Word; a Sandbox export keeps its runs
   *  exactly as they were written. */
  private tidy: boolean;

  constructor(private doc: WordDocument, private s: ImportSettings) {
    this.tidy = doc.embeddedTemplate === undefined;
    this.usedIds = new Set(s.existingIds);
    this.hasChapterMarkers = doc.blocks.some((b) => b.type === 'paragraph' && this.target(b).kind === 'chapter');
  }

  private target(p: WordParagraph): ParagraphTarget {
    return paragraphTargetOf(this.doc, p.styleId, this.s.template, this.s.config);
  }

  private uniqueId(base: string): string {
    // `table-1` taken: `table-2`, not `table-1-2`.
    const numbered = /^(.*-)(\d+)$/.exec(base);
    let id = base;
    for (let n = 2; this.usedIds.has(id); n++) id = numbered ? `${numbered[1]}${Number(numbered[2]) + n - 1}` : `${base}-${n}`;
    this.usedIds.add(id);
    return id;
  }

  private render(runs: InlineRun[]): string {
    return renderInline(runs, { tidy: this.tidy }).trim();
  }

  // -- output ---------------------------------------------------------------

  private out(chunk: Chunk): void {
    if (chunk.kind !== 'list') this.list = [];
    (this.group ? this.group.chunks : this.chunks).push(chunk);
  }

  private closeGroup(): void {
    const g = this.group;
    if (!g) return;
    this.group = null;
    if (g.chunks.length === 0 && !g.title) return;
    const verseAttrs = [...(g.key ? [`style=${attrValue(g.key)}`] : []), ...(g.layoutLines ? ['layout=lines'] : [])];
    const attrs = g.kind === 'callout'
      ? `{type=${attrValue(g.key)}${g.title ? ` title=${attrValue(g.title)}` : ''}}`
      : g.kind === 'verse' ? (verseAttrs.length ? `{${verseAttrs.join(' ')}}` : '')
        : `{style=${attrValue(g.key)}}`;
    const inner = joinChunks(g.chunks);
    this.chunks.push({ kind: 'block', text: `:::${g.kind}${attrs}${inner ? `\n${inner}` : ''}\n:::` });
    this.list = [];
  }

  private openGroup(kind: Group['kind'], key: string): void {
    if (this.group && this.group.kind === kind && this.group.key === key) return;
    this.closeGroup();
    this.group = { kind, key, chunks: [] };
  }

  private flushChapter(nextTitle?: string): void {
    this.closeGroup();
    this.flushCaption();
    const body = joinChunks(this.chunks);
    const notes = this.notes.join('\n\n');
    const markdown = [body, notes].filter(Boolean).join('\n\n');
    if (markdown.trim() || this.title !== undefined) {
      this.chapters.push({ title: this.title ?? this.s.untitledChapter, markdown: markdown ? markdown + '\n' : '' });
    }
    this.chunks = [];
    this.notes = [];
    this.list = [];
    this.title = nextTitle;
  }

  private flushCaption(): void {
    if (this.pendingCaption === undefined) return;
    const text = this.pendingCaption;
    this.pendingCaption = undefined;
    this.out({ kind: 'block', text: guardLineStart(text) });
  }

  // -- runs -----------------------------------------------------------------

  private charTarget(name: string): CharacterTarget {
    return characterTargetOf(this.doc, name, this.s.template, this.s.config);
  }

  /** Runs → inline runs, split at line breaks when `split` (verse typed
   *  with Shift+Enter) and at page breaks. Notes are numbered here. */
  private inlineRuns(runs: WordRun[], opts: { heading?: boolean; splitLines?: boolean; inCell?: boolean; inNote?: boolean; verse?: boolean }): { lines: InlineRun[][]; images: Array<Extract<WordRun, { type: 'image' }>>; pageBreak: boolean; displayMath: string[] } {
    const lines: InlineRun[][] = [[]];
    const images: Array<Extract<WordRun, { type: 'image' }>> = [];
    const displayMath: string[] = [];
    let pageBreak = false;
    const keepDirect = this.s.template.options.directFormatting === 'keep';
    const cur = (): InlineRun[] => lines[lines.length - 1]!;
    for (const r of runs) {
      switch (r.type) {
        case 'text': {
          if (r.hidden) break;
          const t = this.textRun(r, keepDirect, !!opts.heading);
          if (t) cur().push(t);
          break;
        }
        case 'tab':
          // A tab at the start of a line of verse indents it (#620).
          cur().push({ text: opts.verse ? '\t' : ' ' });
          break;
        case 'break':
          if (r.kind === 'page') pageBreak = true;
          if (r.kind === 'line' && opts.heading) cur().push({ text: ' \\\\ ', raw: true });
          else if (r.kind === 'line' && opts.splitLines) lines.push([]);
          else if (r.kind === 'line' && opts.inCell && !opts.inNote) cur().push({ text: '\n', raw: true });
          else cur().push({ text: ' ' });
          break;
        case 'note': {
          if (opts.heading || opts.inCell || opts.inNote) {
            this.droppedHeadingNotes++;
            break;
          }
          const blocks = (r.kind === 'footnote' ? this.doc.footnotes : this.doc.endnotes).get(r.id);
          if (!blocks) break;
          const id = String(++this.noteSeq);
          const text = blocks
            .filter((b): b is WordParagraph => b.type === 'paragraph')
            .map((b) => this.renderRuns(b.runs, { inNote: true }))
            .filter(Boolean)
            .join(' ');
          this.notes.push(`[^${id}]: ${text}`);
          cur().push({ text: '', note: id });
          break;
        }
        case 'math':
          if (r.display && !opts.inCell && !opts.inNote) displayMath.push(r.tex);
          else cur().push({ text: `$${r.tex}$`, raw: true });
          break;
        case 'image':
          images.push(r);
          break;
        case 'index': {
          if (opts.inCell) break;
          const term = r.term.map((t) => t.replace(/!/g, '')).join('!');
          let a = `term=${attrValue(term)}`;
          if (r.main) a += ' main';
          if (r.see) a += ` see=${attrValue(r.see)}`;
          cur().push({ text: `:index{${a}}`, raw: true });
          break;
        }
      }
    }
    return { lines, images, pageBreak, displayMath };
  }

  private textRun(r: WordTextRun, keepDirect: boolean, heading: boolean): InlineRun | null {
    const t: InlineRun = { text: r.text.replace(/[​﻿]/g, '') };
    if (!t.text) return null;
    if (r.href !== undefined && !heading) t.href = r.href;
    if (keepDirect) {
      if (r.bold) t.bold = true;
      if (r.italic) t.italic = true;
      if (r.smallCaps) t.smallCaps = true;
      if (r.script) t.script = r.script;
    }
    if (r.charStyle) {
      const target = this.charTarget(r.charStyle);
      switch (target.kind) {
        case 'drop':
          return null;
        case 'markup': {
          // Verbatim, inside the emphasis and link around it.
          const raw: InlineRun = { text: r.text, raw: true };
          if (t.bold && r.bold !== false) raw.bold = true;
          if (t.italic && r.italic !== false) raw.italic = true;
          if (t.smallCaps) raw.smallCaps = true;
          if (t.href !== undefined) raw.href = t.href;
          return raw;
        }
        case 'bold':
          if (r.bold !== false) t.bold = true;
          break;
        case 'italic':
          if (r.italic !== false) t.italic = true;
          break;
        case 'boldItalic':
          if (r.bold !== false) t.bold = true;
          if (r.italic !== false) t.italic = true;
          break;
        case 'smallCaps':
          if (r.smallCaps !== false) t.smallCaps = true;
          break;
        case 'sup':
        case 'sub':
          t.script = target.kind;
          break;
        case 'chip':
          if (!heading) t.chip = target.style;
          break;
        default:
          break;
      }
    }
    if (r.bold === false) delete t.bold;
    if (r.italic === false) delete t.italic;
    return t;
  }

  private renderRuns(runs: WordRun[], opts: { inNote?: boolean } = {}): string {
    const { lines } = this.inlineRuns(runs, { inNote: !!opts.inNote });
    return lines.map((l) => this.render(l)).filter(Boolean).join(' ');
  }

  // -- blocks ---------------------------------------------------------------

  private emitImages(images: Array<Extract<WordRun, { type: 'image' }>>): void {
    if (!this.s.template.options.images) return;
    for (const img of images) {
      const media = this.doc.media.get(img.rId);
      if (!media) continue;
      if (!/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(media.contentType)) {
        this.skippedPictures.push(media.path.split('/').pop() ?? media.path);
        continue;
      }
      const base = slugify(img.alt ?? '', '') || slugify(img.name ?? '', '') || 'figure';
      const id = this.uniqueId(/^(picture|imagen|image|figure)\b/i.test(base) || !/[a-z]/.test(base) ? `fig-${this.pictures.length + 1}` : base);
      const pic: ImportedPicture = { id, media, ...(img.name ? { name: img.name } : {}), ...(img.alt ? { alt: img.alt } : {}) };
      if (this.pendingCaption !== undefined) {
        pic.caption = this.pendingCaption;
        this.pendingCaption = undefined;
      }
      this.pictures.push(pic);
      this.lastResource = pic;
      this.out({ kind: 'block', text: `::resource{id="${id}"}` });
    }
  }

  private emitMarkup(p: WordParagraph): void {
    let text = '';
    for (const r of p.runs) {
      if (r.type === 'text' && !r.hidden) text += r.text;
      else if (r.type === 'tab') text += '\t';
      else if (r.type === 'break' && r.kind === 'line') text += '\n';
    }
    this.closeGroup();
    this.flushCaption();
    for (const line of text.split('\n')) {
      const t = line.replace(/\s+$/, '');
      if (FENCE_OPEN_RE.test(t.trim())) this.explicitDepth++;
      else if (FENCE_CLOSE_RE.test(t.trim()) && this.explicitDepth > 0) this.explicitDepth--;
    }
    this.out({ kind: 'markup', text: text.replace(/\s+$/, '') });
  }

  private listMarker(p: WordParagraph): { indent: string; marker: string } {
    const { numId, ilvl } = p.list!;
    const num = this.doc.numbering.nums.get(numId);
    const level = num ? this.doc.numbering.abstracts.get(num.abstractId)?.get(ilvl) : undefined;
    const ordered = !!level && level.format !== 'bullet' && level.format !== 'none';
    let marker = '- ';
    if (ordered) {
      const k = `${numId}:${ilvl}`;
      const start = num?.starts.get(ilvl) ?? level?.start ?? 1;
      const n = this.counters.has(k) ? this.counters.get(k)! + 1 : start;
      this.counters.set(k, n);
      for (const key of [...this.counters.keys()]) {
        const [id, l] = key.split(':');
        if (id === numId && Number(l) > ilvl) this.counters.delete(key);
      }
      marker = `${n}. `;
    }
    while (this.list.length && this.list[this.list.length - 1]!.ilvl >= ilvl) this.list.pop();
    const parent = this.list[this.list.length - 1];
    const indent = parent ? parent.indent + parent.width : 0;
    this.list.push({ ilvl, indent, width: marker.length });
    return { indent: ' '.repeat(indent), marker };
  }

  /** A line of verse (#620): its leading tabs and spaces kept as its
   *  indent, the rest rendered; a line that would read as a stepped line
   *  (`+ …`) keeps its plus sign. */
  private verseLine(runs: InlineRun[]): string {
    const rest = runs.map((r) => ({ ...r }));
    let lead = '';
    while (rest.length > 0 && !rest[0]!.raw && rest[0]!.note === undefined && /^[ \t]/.test(rest[0]!.text)) {
      const ws = /^[ \t]+/.exec(rest[0]!.text)![0];
      lead += ws;
      rest[0]!.text = rest[0]!.text.slice(ws.length);
      if (!rest[0]!.text) rest.shift();
    }
    const text = this.render(rest.map((r) => (r.raw ? r : { ...r, text: r.text.replace(/\t/g, ' ') })));
    if (!text) return '';
    return lead + (/^\+\s/.test(text) ? `\\${text}` : text);
  }

  private isManualHeading(p: WordParagraph, text: string): boolean {
    if (!this.s.template.options.manualHeadings || p.list) return false;
    const runs = p.runs.filter((r): r is WordTextRun => r.type === 'text' && r.text.trim() !== '');
    if (!runs.length) return false;
    const t = text.trim();
    if (t.length > 120 || /[.:;,]$/.test(t)) return false;
    return runs.every((r) => r.bold || (r.charStyle && ['bold', 'boldItalic'].includes(this.charTarget(r.charStyle).kind)));
  }

  paragraph(p: WordParagraph): void {
    let target = this.target(p);
    const plain = p.runs.map((r) => (r.type === 'text' && !r.hidden ? r.text : r.type === 'tab' || r.type === 'break' ? ' ' : '')).join('').replace(/\s+/g, ' ').trim();
    if (target.kind === 'drop') return;
    if (target.kind === 'markup') {
      this.emitMarkup(p);
      return;
    }
    if (target.kind === 'chapter') {
      if (this.s.chapters === 'split') this.flushChapter(plain || this.s.untitledChapter);
      return;
    }
    if (p.pageBreakBefore && this.s.template.options.pageBreaks === 'keep' && !(target.kind === 'heading' && target.level === 1)) {
      this.closeGroup();
      this.out({ kind: 'block', text: ':::pagebreak' });
    }
    let manualHeading = false;
    if (target.kind === 'body' && this.isManualHeading(p, plain)) {
      target = { kind: 'heading', level: this.s.template.options.manualHeadings };
      manualHeading = true;
    }
    if (this.explicitDepth > 0 && (target.kind === 'callout' || target.kind === 'paragraphs' || target.kind === 'calloutTitle')) {
      target = target.kind === 'calloutTitle' ? target : { kind: 'body' };
    }

    if (target.kind === 'heading') {
      const level = Math.min(6, Math.max(1, target.level));
      if (level === 1 && this.s.chapters === 'split' && !this.hasChapterMarkers) this.flushChapter(plain || this.s.untitledChapter);
      else {
        this.closeGroup();
        this.flushCaption();
      }
      const { lines } = this.inlineRuns(p.runs, { heading: true });
      // A heading typed in bold by hand: the bold was its only sign.
      let text = this.render(manualHeading ? lines.flat().map((x) => ({ ...x, bold: undefined })) : lines.flat());
      if (!text) return;
      if (target.style) {
        const attrs = /\s\{([^{}]*)\}$/.exec(text);
        if (attrs && !/\bstyle\s*=/.test(attrs[1]!)) text = text.slice(0, attrs.index) + ` {style=${attrValue(target.style)} ${attrs[1]!.trim()}}`;
        else if (!attrs) text += ` {style=${attrValue(target.style)}}`;
      } else if (text.endsWith('}') && !/\s\{[^{}]*\}$/.test(text)) text += WORD_JOINER;
      this.out({ kind: 'block', text: `${'#'.repeat(level)} ${text}` });
      return;
    }

    // A poem (#620): each line typed with Shift+Enter a line of verse, its
    // leading tabs and spaces its indent; a paragraph of lines a stanza,
    // one-line paragraphs in a row one stanza, an empty paragraph a
    // stanza break.
    if (target.kind === 'verse') {
      this.flushCaption();
      const key = target.style ?? '';
      if (!(this.group?.kind === 'verse' && this.group.key === key)) this.openGroup('verse', key);
      const g = this.group!;
      const { lines, images, displayMath } = this.inlineRuns(p.runs, { splitLines: true, verse: true });
      const verse = lines.map((l) => this.verseLine(l)).filter((l) => l.trim() !== '');
      if (verse.length === 0) {
        g.stanzaBreak = true;
      } else {
        if (verse.some((l) => l.includes('||') || /\s\\\\\s/.test(l))) g.layoutLines = true;
        const last = g.chunks[g.chunks.length - 1];
        if (verse.length === 1 && last && g.runOn && !g.stanzaBreak) last.text += `\n${verse[0]}`;
        else g.chunks.push({ kind: 'block', text: verse.join('\n') });
        g.runOn = verse.length === 1;
        g.stanzaBreak = false;
      }
      if (images.length > 0 || displayMath.length > 0) {
        this.closeGroup();
        for (const tex of displayMath) this.out({ kind: 'block', text: `$$${tex}$$` });
        this.emitImages(images);
      }
      return;
    }

    const splitLines = this.s.template.options.lineBreaks === 'paragraph' && !p.list;
    const { lines, images, pageBreak, displayMath } = this.inlineRuns(p.runs, { splitLines });
    const rendered = lines.map((l) => this.render(l)).filter(Boolean);

    if (target.kind === 'caption') {
      const text = stripCaptionLabel(rendered.join(' '));
      if (images.length === 0 && text) {
        if (this.lastResource && !this.lastResource.caption && this.lastChunkIsResource()) {
          this.lastResource.caption = text;
        } else {
          this.flushCaption();
          this.pendingCaption = text;
        }
        return;
      }
    }
    if (target.kind === 'calloutTitle') {
      if (this.explicitDepth > 0) {
        // Inside a fence the box is already open: the title is a paragraph.
        target = { kind: 'body' };
      } else {
        this.closeGroup();
        this.flushCaption();
        // A callout title is plain text.
        this.group = { kind: 'callout', key: target.type, title: plain || undefined, chunks: [] };
        this.emitImages(images);
        return;
      }
    }

    if (target.kind === 'callout') {
      if (!(this.group?.kind === 'callout' && this.group.key === target.type)) this.openGroup('callout', target.type);
    } else if (target.kind === 'paragraphs') {
      this.openGroup('paragraphs', target.style);
    } else if (this.group) {
      this.closeGroup();
    }
    this.flushCaption();

    if (rendered.length) {
      if (p.list) {
        const { indent, marker } = this.listMarker(p);
        this.out({ kind: 'list', text: indent + marker + rendered.join(' ') });
      } else if (target.kind === 'quote') {
        for (const line of rendered) this.out({ kind: 'block', text: `> ${line}` });
      } else {
        for (const line of rendered) this.out({ kind: 'block', text: guardLineStart(line) });
      }
    }
    for (const tex of displayMath) this.out({ kind: 'block', text: `$$${tex}$$` });
    this.emitImages(images);
    if (pageBreak && this.s.template.options.pageBreaks === 'keep') {
      this.closeGroup();
      this.out({ kind: 'block', text: ':::pagebreak' });
    }
    for (const box of p.textBoxes ?? []) this.block(box);
  }

  private lastChunkIsResource(): boolean {
    const list = this.group ? this.group.chunks : this.chunks;
    const last = list[list.length - 1];
    return !!last && last.text.startsWith('::resource{');
  }

  table(t: WordTable): void {
    if (!this.s.template.options.tables) {
      for (const row of t.rows) for (const cell of row) for (const b of cell.blocks) this.block(b);
      return;
    }
    this.closeGroup();
    const model = tableModel(t, (p) => this.cellText(p));
    const id = this.uniqueId(`table-${this.tables.length + 1}`);
    const table: ImportedTable = { id, model };
    if (this.pendingCaption !== undefined) {
      table.caption = this.pendingCaption;
      this.pendingCaption = undefined;
    }
    this.tables.push(table);
    this.lastResource = table;
    this.out({ kind: 'block', text: `::resource{id="${id}"}` });
  }

  private cellText(blocks: WordBlock[]): string {
    const lines: string[] = [];
    let depthBase: number | null = null;
    for (const b of blocks) {
      if (b.type !== 'paragraph') continue;
      const { lines: ls } = this.inlineRuns(b.runs, { inCell: true });
      const text = ls.map((l) => renderInline(l, { collapseSpaces: false, tidy: this.tidy }).replace(/[ \t]+/g, ' ').trim()).join(' ');
      if (!text) continue;
      if (b.list) {
        const num = this.doc.numbering.nums.get(b.list.numId);
        const level = num ? this.doc.numbering.abstracts.get(num.abstractId)?.get(b.list.ilvl) : undefined;
        if (depthBase === null) depthBase = b.list.ilvl;
        const ordered = !!level && level.format !== 'bullet';
        const k = `cell:${b.list.numId}:${b.list.ilvl}`;
        const n = (this.counters.get(k) ?? (level?.start ?? 1) - 1) + 1;
        this.counters.set(k, n);
        lines.push('  '.repeat(Math.max(0, b.list.ilvl - depthBase)) + (ordered ? `${n}. ` : '- ') + text);
      } else lines.push(text);
    }
    return lines.join('\n');
  }

  block(b: WordBlock): void {
    if (b.type === 'table') this.table(b);
    else this.paragraph(b);
  }

  run(): ImportResult {
    for (const b of this.doc.blocks) this.block(b);
    this.flushChapter();
    if (this.chapters.length === 0) this.chapters.push({ title: this.s.untitledChapter, markdown: '' });
    return {
      chapters: this.chapters,
      pictures: this.pictures,
      tables: this.tables,
      skippedPictures: this.skippedPictures,
      droppedHeadingNotes: this.droppedHeadingNotes,
    };
  }
}

/** A Word table as a Postext table model: merged cells as spans (covered
 *  cells point at the cell covering them), the header rows, the column
 *  widths as weights and the cell fills. */
export function tableModel(t: WordTable, text: (blocks: WordBlock[]) => string): TableModel {
  // Lay the Word cells on the grid (a gridSpan takes several columns).
  const grid: Array<Array<{ cell: TableModel['rows'][number][number]; vMerge?: 'restart' | 'continue' }>> = [];
  let columns = 0;
  t.rows.forEach((row, ri) => {
    const out: (typeof grid)[number] = [];
    let col = 0;
    for (const c of row) {
      const cell: TableCell = { content: c.vMerge === 'continue' ? '' : text(c.blocks) };
      if (c.colSpan > 1) cell.colSpan = c.colSpan;
      if (c.shading) cell.background = { hex: c.shading, model: 'hex' };
      if (ri < t.headerRows) cell.isHeader = true;
      out.push({ cell, vMerge: c.vMerge });
      for (let k = 1; k < c.colSpan; k++) out.push({ cell: { content: '', hiddenBy: { row: ri, col } } });
      col += c.colSpan;
    }
    columns = Math.max(columns, col);
    grid.push(out);
  });
  // Vertical merges: the restart cell spans the continue cells under it.
  for (let ri = 0; ri < grid.length; ri++) {
    grid[ri]!.forEach((g, ci) => {
      if (g.vMerge !== 'restart') return;
      let span = 1;
      for (let rj = ri + 1; rj < grid.length; rj++) {
        const below = grid[rj]![ci];
        if (below?.vMerge !== 'continue') break;
        span++;
        below.cell = { content: '', hiddenBy: { row: ri, col: ci } };
        for (let k = 1; k < (g.cell.colSpan ?? 1); k++) {
          const side = grid[rj]![ci + k];
          if (side) side.cell = { content: '', hiddenBy: { row: ri, col: ci } };
        }
      }
      if (span > 1) g.cell.rowSpan = span;
    });
  }
  const rows = grid.map((r) => {
    const cells = r.map((g) => g.cell);
    while (cells.length < columns) cells.push({ content: '' });
    return cells;
  });
  const model: TableModel = { rows };
  if (t.headerRows > 0) model.headerRowCount = t.headerRows;
  if (t.widths && t.widths.length === columns) {
    const min = Math.min(...t.widths);
    model.columnWidths = t.widths.map((w) => Math.round((w / min) * 100) / 100);
  }
  return model;
}

/** Convert a read Word document to Postext chapters and resources. */
export function wordToPostext(doc: WordDocument, settings: ImportSettings): ImportResult {
  return new Converter(doc, settings).run();
}

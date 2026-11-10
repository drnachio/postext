// A story part as paragraphs and runs.
//
// IDML writes a story as `ParagraphStyleRange`s holding
// `CharacterStyleRange`s holding `Content` and `Br`. A range is a stretch
// of text with the same formatting, not a paragraph: one paragraph range
// holds every consecutive paragraph that shares its attributes, and a
// paragraph ends at a `<Br/>` (the last one of a story may have none). So
// paragraphs are cut at `Br`, wherever it stands, and a paragraph takes
// the attributes of the paragraph range it started in.
//
// Between and inside the ranges stand wrappers that mark a stretch of
// text without formatting it: a hyperlink or cross-reference source, an
// XML element, a tracked change, hidden conditional text. InDesign nests
// them at whichever level the stretch allows (around character ranges
// when it covers several, inside one when it covers part of it), so the
// walk carries them as context and reads the same content under them.

import { isElement, isInstruction, localName, type XmlElement } from '../xml/read.js';
import type { IdmlDestination, IdmlParagraph, IdmlRun, IdmlStory, IdmlWarning, Inline, Props, SpecialCharacter } from '../model/document.js';
import { isPageItem, pageItemOf } from './items.js';
import { listTexts, plainName, propsOf, refOf } from './props.js';
import { tableOf } from './tables.js';

export interface StoryContext {
  /** Part being read, for warnings. */
  part?: string;
  warnings: IdmlWarning[];
  /** Text and paragraph destinations met in the story are added here. */
  destinations?: IdmlDestination[];
  /** Instruction codes already reported, so each is reported once. */
  reported?: Set<string>;
}

/** What the wrappers around a stretch of text say about it. */
interface Wrap {
  link?: string;
  crossReference?: { format?: string };
  tags: string[];
  change?: 'inserted' | 'deleted' | 'moved';
  hidden?: boolean;
  endnoteRange?: string;
}

const PLAIN: Wrap = { tags: [] };

// `<?ACE n?>` inside `Content`: the characters InDesign keeps as a code
// of its own instead of a code point.
const ACE: Record<string, SpecialCharacter> = {
  '3': 'endNestedStyle',
  '4': 'footnoteNumber',
  '7': 'indentHere',
  '8': 'rightIndentTab',
  '18': 'pageNumber',
  '19': 'sectionMarker',
};

// Code points that are instructions to the composer rather than text.
const CODE_POINTS: Record<string, SpecialCharacter> = {
  '\u2028': 'forcedLineBreak',
  '\u00ad': 'discretionaryHyphen',
  '\u2011': 'nonbreakingHyphen',
  '\u200b': 'discretionaryLineBreak',
};
const SPECIAL = /[\u2028\u00ad\u2011\u200b]/;
const SPECIAL_SPLIT = /([\u2028\u00ad\u2011\u200b])/;

const CHANGES: Record<string, NonNullable<Wrap['change']>> = { InsertedText: 'inserted', DeletedText: 'deleted', MovedText: 'moved' };

// Children of a story or of a range that hold settings, not text.
const SETTINGS = new Set(['Properties', 'StoryPreference', 'InCopyExportOption', 'MetadataPacketPreference', 'XMLAttribute', 'XMLComment', 'XMLInstruction', 'GridDataInformation']);

const NO_PROPS: Props = { attrs: {}, properties: {} };

/** The conditions of a range: a space-separated attribute (a space of a
 *  condition's own name is written `%20` there) or a list property. */
function conditionsOf(p: Props): string[] {
  const attr = p.attrs.AppliedConditions;
  if (attr !== undefined) return attr.split(/\s+/).filter((s) => s && s !== 'n').map((s) => s.replace(/%20/gi, ' '));
  const list = p.properties.AppliedConditions;
  return list ? listTexts(list).filter((s) => s && s !== 'n') : [];
}

class Builder {
  readonly paragraphs: IdmlParagraph[] = [];
  private para: IdmlParagraph | undefined;
  private run: IdmlRun | undefined;
  private runRange: XmlElement | undefined;
  private runWrap: Wrap | undefined;
  private readonly props = new Map<XmlElement, Props>();

  constructor(private readonly ctx: StoryContext) {}

  private propsOf(el: XmlElement | undefined): Props {
    if (!el) return NO_PROPS;
    let p = this.props.get(el);
    if (!p) this.props.set(el, (p = propsOf(el)));
    return p;
  }

  private paragraph(psr: XmlElement | undefined, wrap: Wrap): IdmlParagraph {
    if (this.para) return this.para;
    const p = this.propsOf(psr);
    const style = refOf(p.attrs.AppliedParagraphStyle);
    const para: IdmlParagraph = { attrs: p.attrs, properties: p.properties, runs: [] };
    if (style) para.paragraphStyle = style;
    if (wrap.endnoteRange) para.endnoteRange = wrap.endnoteRange;
    this.para = para;
    this.run = undefined;
    return para;
  }

  /** The run text goes to now: a new one when the character range or the
   *  wrappers changed, or a paragraph began. */
  private current(psr: XmlElement | undefined, csr: XmlElement | undefined, wrap: Wrap): IdmlRun {
    const para = this.paragraph(psr, wrap);
    if (this.run && this.runRange === csr && this.runWrap === wrap) return this.run;
    const p = this.propsOf(csr);
    const style = refOf(p.attrs.AppliedCharacterStyle);
    const run: IdmlRun = { attrs: p.attrs, properties: p.properties, content: [], conditions: conditionsOf(p), tags: wrap.tags };
    if (style) run.characterStyle = style;
    if (wrap.link) run.linkSource = wrap.link;
    if (wrap.crossReference) run.crossReference = wrap.crossReference;
    if (wrap.change) run.change = wrap.change;
    if (wrap.hidden) run.hidden = true;
    para.runs.push(run);
    this.run = run;
    this.runRange = csr;
    this.runWrap = wrap;
    return run;
  }

  inline(psr: XmlElement | undefined, csr: XmlElement | undefined, wrap: Wrap, inline: Inline): void {
    this.current(psr, csr, wrap).content.push(inline);
  }

  text(psr: XmlElement | undefined, csr: XmlElement | undefined, wrap: Wrap, text: string): void {
    if (!text) return;
    const content = this.current(psr, csr, wrap).content;
    const add = (t: string): void => {
      if (!t) return;
      const last = content[content.length - 1];
      if (last && last.kind === 'text') last.text += t;
      else content.push({ kind: 'text', text: t });
    };
    if (!SPECIAL.test(text)) return add(text);
    for (const piece of text.split(SPECIAL_SPLIT)) {
      const char = CODE_POINTS[piece];
      if (char) content.push({ kind: 'special', char });
      else add(piece);
    }
  }

  instruction(psr: XmlElement | undefined, csr: XmlElement | undefined, wrap: Wrap, code: string): void {
    const char = ACE[code];
    if (char) return this.inline(psr, csr, wrap, { kind: 'special', char });
    this.inline(psr, csr, wrap, { kind: 'special', char: 'unknown', code });
    const reported = (this.ctx.reported ??= new Set());
    if (reported.has(code)) return;
    reported.add(code);
    this.ctx.warnings.push({ code: 'unknownSpecialCharacter', message: `Special character <?ACE ${code.slice(0, 20)}?> is not one the reader knows`, ...(this.ctx.part ? { part: this.ctx.part } : {}) });
  }

  /** `<Br/>`: the paragraph ends here, empty or not. */
  end(psr: XmlElement | undefined, csr: XmlElement | undefined, wrap: Wrap): void {
    const para = this.paragraph(psr, wrap);
    // The break a range asks for after its paragraphs (next column, next
    // frame, next page…) is an attribute of the character range.
    const kind = this.propsOf(csr).attrs.ParagraphBreakType ?? this.propsOf(psr).attrs.ParagraphBreakType;
    if (kind && kind !== 'None') para.breakAfter = kind;
    this.paragraphs.push(para);
    this.para = undefined;
    this.run = undefined;
  }

  finish(): IdmlParagraph[] {
    if (this.para && this.para.runs.length) this.paragraphs.push(this.para);
    this.para = undefined;
    this.run = undefined;
    return this.paragraphs;
  }
}

function contentOf(el: XmlElement, b: Builder, psr: XmlElement | undefined, csr: XmlElement | undefined, wrap: Wrap): void {
  for (const n of el.children) {
    if (typeof n === 'string') b.text(psr, csr, wrap, n);
    else if (isInstruction(n)) {
      if (n.pi === 'ACE') b.instruction(psr, csr, wrap, n.data.trim());
    }
  }
}

// The depth of the walk is the depth of the XML, which the parser limits.
function walk(el: XmlElement, b: Builder, ctx: StoryContext, psr: XmlElement | undefined, csr: XmlElement | undefined, wrap: Wrap): void {
  for (const c of el.children) {
    if (!isElement(c)) continue;
    const name = localName(c.name);
    switch (name) {
      case 'ParagraphStyleRange':
        walk(c, b, ctx, c, undefined, wrap);
        break;
      case 'CharacterStyleRange':
        walk(c, b, ctx, psr, c, wrap);
        break;
      case 'Content':
        contentOf(c, b, psr, csr, wrap);
        break;
      case 'Br':
        b.end(psr, csr, wrap);
        break;
      case 'HyperlinkTextSource':
        walk(c, b, ctx, psr, csr, { ...wrap, ...(c.attrs.Self ? { link: c.attrs.Self } : {}) });
        break;
      case 'CrossReferenceSource': {
        const format = refOf(c.attrs.AppliedFormat);
        walk(c, b, ctx, psr, csr, { ...wrap, ...(c.attrs.Self ? { link: c.attrs.Self } : {}), crossReference: format ? { format } : {} });
        break;
      }
      case 'XMLElement': {
        const tag = (c.attrs.MarkupTag ?? '').replace(/^XMLTag\//, '');
        walk(c, b, ctx, psr, csr, tag ? { ...wrap, tags: [...wrap.tags, tag] } : wrap);
        break;
      }
      case 'Change': {
        const change = CHANGES[c.attrs.ChangeType ?? ''];
        walk(c, b, ctx, psr, csr, change ? { ...wrap, change } : wrap);
        break;
      }
      case 'HiddenText':
        walk(c, b, ctx, psr, csr, { ...wrap, hidden: true });
        break;
      case 'EndnoteRange': {
        // The text of one endnote, in the story InDesign keeps for them.
        const range = refOf(c.attrs.SourceEndnote) ?? refOf(c.attrs.Self);
        walk(c, b, ctx, psr, csr, range ? { ...wrap, endnoteRange: range } : wrap);
        break;
      }
      case 'Footnote':
        b.inline(psr, csr, wrap, { kind: 'footnote', paragraphs: paragraphsOf(c, ctx) });
        break;
      case 'Endnote':
        b.inline(psr, csr, wrap, { kind: 'endnote', paragraphs: paragraphsOf(c, ctx), ...(c.attrs.Self ? { self: c.attrs.Self } : {}) });
        break;
      case 'Note':
        b.inline(psr, csr, wrap, { kind: 'note', paragraphs: paragraphsOf(c, ctx) });
        break;
      case 'Table':
        b.inline(psr, csr, wrap, { kind: 'table', table: tableOf(c, (cell) => paragraphsOf(cell, ctx)) });
        break;
      case 'TextVariableInstance':
        b.inline(psr, csr, wrap, { kind: 'variable', variable: c.attrs.AssociatedTextVariable ?? '', result: c.attrs.ResultText ?? '' });
        break;
      case 'PageReference': {
        const type = c.attrs.PageReferenceType;
        b.inline(psr, csr, wrap, { kind: 'indexMark', topic: c.attrs.ReferencedTopic ?? '', ...(type ? { type } : {}) });
        break;
      }
      case 'ParagraphDestination':
      case 'HyperlinkTextDestination': {
        const destinationType = name === 'ParagraphDestination' ? 'paragraph' : 'text';
        const self = c.attrs.Self ?? '';
        const dname = c.attrs.Name ?? '';
        b.inline(psr, csr, wrap, { kind: 'destination', self, name: dname, destinationType });
        ctx.destinations?.push({ self, name: dname, kind: destinationType });
        break;
      }
      default:
        if (SETTINGS.has(name)) break;
        if (isPageItem(c)) b.inline(psr, csr, wrap, { kind: 'item', item: pageItemOf(c) });
        // An element the reader has no name for: what it wraps is still
        // text of the story.
        else walk(c, b, ctx, psr, csr, wrap);
    }
  }
}

/** The paragraphs under an element (a story, a footnote, a note, a table
 *  cell), read with the story walk. */
export function paragraphsOf(el: XmlElement, ctx: StoryContext): IdmlParagraph[] {
  const b = new Builder(ctx);
  walk(el, b, ctx, undefined, undefined, PLAIN);
  return b.finish();
}

/** The `<Story>` of a story part (`root` is the part's root element, or
 *  the story itself); undefined when the part holds none. */
export function storyOf(root: XmlElement, ctx: StoryContext): IdmlStory | undefined {
  const isStory = (e: XmlElement): boolean => (localName(e.name) === 'Story' || localName(e.name) === 'XmlStory') && e.attrs.Self !== undefined;
  const el = isStory(root) ? root : root.children.filter(isElement).find(isStory);
  if (!el) return undefined;
  let pref: XmlElement | undefined;
  for (const c of el.children) if (isElement(c) && localName(c.name) === 'StoryPreference') pref = c;
  const own: IdmlDestination[] = [];
  const paragraphs = paragraphsOf(el, { ...ctx, destinations: own, reported: ctx.reported ?? new Set() });
  const self = el.attrs.Self ?? '';
  for (const d of own) ctx.destinations?.push({ ...d, story: self });
  const title = plainName(el.attrs.StoryTitle);
  return {
    self,
    ...(title ? { title } : {}),
    direction: pref?.attrs.StoryDirection === 'RightToLeftDirection' ? 'rtl' : 'ltr',
    orientation: pref?.attrs.StoryOrientation === 'Vertical' ? 'vertical' : 'horizontal',
    paragraphs,
    endnotes: el.attrs.IsEndnoteStory === 'true',
    trackChanges: el.attrs.TrackChanges === 'true',
    opticalMargin: pref?.attrs.OpticalMarginAlignment === 'true',
    ...(ctx.part ? { part: ctx.part } : {}),
  };
}

/** The plain text of paragraphs, notes and tables left out: what a reader
 *  of the page reads in the story's own flow. */
export function plainText(paragraphs: readonly IdmlParagraph[]): string {
  const out: string[] = [];
  for (const p of paragraphs) {
    let s = '';
    for (const r of p.runs) for (const i of r.content) if (i.kind === 'text') s += i.text;
    out.push(s);
  }
  return out.join('\n');
}

// Postext chapters → a `.docx` someone can edit in Word and send back. The
// import template is applied in reverse: headings, paragraph styles,
// callouts, quotes, lists, chips and footnotes become Word styles, numbering
// and notes; what Word cannot say (fences, directives, `:ref`, maths, front
// matter) is kept verbatim in the *Postext Markup* styles. The template
// travels inside the file, so the re-import maps every style back.

import { strToU8, zipSync } from 'fflate';
import type { PostextConfig, Dimension, ColorValue } from '../types';
import { LINE_BREAK, parseInline, type InlineRun } from './inline';
import {
  calloutStylesOf,
  chipStylesOf,
  CHAPTER_STYLE,
  MARKUP_CHAR_STYLE,
  MARKUP_STYLE,
  type CharacterTarget,
  type ParagraphTarget,
  type WordTemplate,
} from './template';
import { TEMPLATE_XML_NS, TEMPLATE_XML_ROOT } from './docxRead';
import { escapeAttr, escapeXml } from './xml';

export interface ExportChapter {
  title: string;
  markdown: string;
}

export interface WordStyleNames {
  /** `Callout: __name__` */
  callout: string;
  /** `Callout: __name__: title` */
  calloutTitle: string;
  /** `Chip: __name__` */
  chip: string;
}

export const DEFAULT_STYLE_NAMES: WordStyleNames = {
  callout: 'Callout: __name__',
  calloutTitle: 'Callout: __name__: title',
  chip: 'Chip: __name__',
};

export interface ExportSettings {
  template: WordTemplate;
  config: PostextConfig;
  /** Several chapters: each opens with a `Postext Chapter` paragraph so the
   *  re-import rebuilds the book. */
  book: boolean;
  title?: string;
  author?: string;
  names?: WordStyleNames;
}

// ---------------------------------------------------------------------------
// Markdown → export blocks
// ---------------------------------------------------------------------------

type Role =
  | { kind: 'body' }
  | { kind: 'paragraphs'; style: string }
  | { kind: 'callout'; type: string }
  | { kind: 'quote' };

type ExBlock =
  | { kind: 'markup'; text: string }
  | { kind: 'chapter'; title: string }
  | { kind: 'heading'; level: number; style?: string; text: string }
  | { kind: 'para'; text: string; role: Role }
  | { kind: 'list'; text: string; depth: number; ordered: boolean; number: number; role: Role; run: number };

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const FENCE_RE = /^:::\s*([a-z][a-z0-9-]*)\s*(?:\{([^}]*)\})?\s*$/;
const CLOSE_RE = /^:::\s*$/;
const CONTAINERS = new Set(['callout', 'paragraphs', 'part', 'columns', 'paper']);
const RAW_BODY = new Set(['references', 'verse', 'page', 'strip']);
const TASK_RE = /^(\s*)([-*+])\s+(\[[ xX]\]\s+.*)$/;
const ORDERED_RE = /^(\s*)([0-9]+)([.)])\s+(.*)$/;
const BULLET_RE = /^(\s*)([-*+])\s+(.*)$/;
const NOTE_DEF_RE = /^\[\^([\p{L}\p{N}_.:-]+)\]:[ \t]*/u;
const RESOURCE_RE = /^::resource\s*\{id="[^"]+"\}\s*$/;
const MATH_SINGLE_RE = /^\s*\$\$[\s\S]+?\$\$\s*$/;
const MATH_FENCE_RE = /^\s*\$\$\s*$/;

/** `key="value"` / `key=value` / flag pairs of an attribute blob. */
function attrPairs(blob: string): Array<[string, string | true]> {
  const out: Array<[string, string | true]> = [];
  const re = /([A-Za-z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob))) out.push([m[1]!, m[2] ?? m[3] ?? m[4] ?? true]);
  return out;
}

/** A paragraph's lines as one text: joined with a space, or with a line
 *  feed after a line that ends in a backslash, a forced line break (#620)
 *  `parseInline` reads. */
function joinLines(parts: readonly string[]): string {
  return parts.reduce((text, part, k) => (k === 0 ? part : `${text}${parts[k - 1]!.endsWith('\\') ? '\n' : ' '}${part}`), '');
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

/** Does a paragraph run end at this line? (blank, heading, list, quote,
 *  fence, maths, resource, note definition) */
function startsBlock(trimmed: string, raw: string): boolean {
  return HEADING_RE.test(trimmed) || trimmed.startsWith('>') || FENCE_RE.test(trimmed) || CLOSE_RE.test(trimmed)
    || TASK_RE.test(raw) || ORDERED_RE.test(raw) || BULLET_RE.test(raw) || RESOURCE_RE.test(trimmed)
    || MATH_SINGLE_RE.test(trimmed) || MATH_FENCE_RE.test(trimmed) || NOTE_DEF_RE.test(trimmed);
}

interface ParsedChapter {
  blocks: ExBlock[];
  /** Note definitions by id (first wins). */
  notes: Map<string, string>;
}

function parseChapter(markdown: string, listRunBase: { n: number }): ParsedChapter {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ExBlock[] = [];
  const notes = new Map<string, string>();
  let i = 0;

  // Front matter: verbatim.
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---');
    if (end > 0) {
      for (let k = 0; k <= end; k++) blocks.push({ kind: 'markup', text: lines[k]! });
      i = end + 1;
    }
  }

  /** Open containers: explicit ones (fences kept verbatim) and the one
   *  implicit `:::paragraphs` group a Word style stands for. */
  const stack: Array<{ name: string; role: Role | null; implicit: boolean }> = [];
  const role = (): Role => {
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k]!.role) return stack[k]!.role!;
    return { kind: 'body' };
  };
  let listStack: number[] = [];
  let listRun = -1;
  let lastImplicitStyle: string | null = null;
  let lastImplicitEnd = -2;

  const endList = (): void => {
    listStack = [];
    listRun = -1;
  };

  // Two verbatim blocks come back joined line to line; a blank line
  // between them in the source travels as an empty markup paragraph.
  let blankBefore = false;
  const pushBlock = (b: ExBlock): void => {
    if (b.kind === 'markup' && blankBefore && blocks[blocks.length - 1]?.kind === 'markup') blocks.push({ kind: 'markup', text: '' });
    blankBefore = false;
    blocks.push(b);
  };

  while (i < lines.length) {
    const raw = lines[i]!;
    const t = raw.trim();
    if (isBlank(raw)) {
      blankBefore = true;
      i++;
      continue;
    }
    const fence = FENCE_RE.exec(t);
    if (fence) {
      endList();
      const name = fence[1]!;
      const attrs = attrPairs(fence[2] ?? '');
      if (RAW_BODY.has(name)) {
        pushBlock({ kind: 'markup', text: raw });
        i++;
        while (i < lines.length && !CLOSE_RE.test(lines[i]!.trim())) blocks.push({ kind: 'markup', text: lines[i++]! });
        if (i < lines.length) blocks.push({ kind: 'markup', text: lines[i++]! });
        continue;
      }
      if (!CONTAINERS.has(name)) {
        pushBlock({ kind: 'markup', text: raw });
        i++;
        continue;
      }
      const style = attrs.find(([k]) => k === 'style')?.[1];
      if (name === 'paragraphs' && stack.length === 0 && attrs.length === 1 && typeof style === 'string' && style) {
        // A Word paragraph style can stand for the fence when the group
        // holds only paragraphs and does not touch another group of the
        // same style (the two would merge on the way back).
        let depth = 1;
        let simple = true;
        let k = i + 1;
        for (; k < lines.length; k++) {
          const lt = lines[k]!.trim();
          if (isBlank(lines[k]!)) continue;
          if (CLOSE_RE.test(lt)) {
            if (--depth === 0) break;
            continue;
          }
          if (FENCE_RE.test(lt)) {
            simple = false;
            depth++;
            continue;
          }
          if (startsBlock(lt, lines[k]!)) simple = false;
        }
        const adjacent = lastImplicitStyle === style && lastImplicitEnd === blocks.length;
        if (simple && k < lines.length && !adjacent) {
          stack.push({ name, role: { kind: 'paragraphs', style }, implicit: true });
          i++;
          continue;
        }
      }
      const fenceRole: Role | null = name === 'callout'
        ? { kind: 'callout', type: (attrs.find(([key]) => key === 'type')?.[1] as string | undefined) ?? '' }
        : name === 'paragraphs' && typeof style === 'string' && style ? { kind: 'paragraphs', style } : null;
      stack.push({ name, role: fenceRole, implicit: false });
      pushBlock({ kind: 'markup', text: raw });
      i++;
      continue;
    }
    if (CLOSE_RE.test(t)) {
      endList();
      const top = stack.pop();
      if (top?.implicit) {
        lastImplicitStyle = top.role?.kind === 'paragraphs' ? top.role.style : null;
        lastImplicitEnd = blocks.length;
      } else pushBlock({ kind: 'markup', text: raw });
      i++;
      continue;
    }
    if (RESOURCE_RE.test(t) || MATH_SINGLE_RE.test(t)) {
      endList();
      pushBlock({ kind: 'markup', text: raw });
      i++;
      continue;
    }
    if (MATH_FENCE_RE.test(t)) {
      endList();
      pushBlock({ kind: 'markup', text: raw });
      i++;
      while (i < lines.length && !MATH_FENCE_RE.test(lines[i]!.trim())) blocks.push({ kind: 'markup', text: lines[i++]! });
      if (i < lines.length) blocks.push({ kind: 'markup', text: lines[i++]! });
      continue;
    }
    const heading = HEADING_RE.exec(t);
    if (heading) {
      endList();
      let text = heading[2]!;
      let style: string | undefined;
      const attrs = /(\s+)\{([^{}]*)\}\s*$/.exec(text);
      if (attrs) {
        const pairs = attrPairs(attrs[2]!);
        const s = pairs.find(([k]) => k === 'style');
        // Only a blob the grammar reads whole is attributes.
        const reconstructed = attrs[2]!.trim();
        if (s && typeof s[1] === 'string' && /^(?:[A-Za-z_][\w-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"']+))?\s*)*$/.test(reconstructed)) {
          style = s[1];
          const rest = reconstructed.replace(/(^|\s)style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"']+)/, '').trim();
          text = text.slice(0, attrs.index) + (rest ? `${attrs[1]}{${rest}}` : '');
        }
      }
      pushBlock({ kind: 'heading', level: heading[1]!.length, ...(style ? { style } : {}), text });
      i++;
      continue;
    }
    if (t.startsWith('>')) {
      endList();
      const parts: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('>')) parts.push(lines[i++]!.trim().replace(/^>\s?/, ''));
      pushBlock({ kind: 'para', text: joinLines(parts).trim(), role: { kind: 'quote' } });
      continue;
    }
    const task = TASK_RE.exec(raw);
    const ordered = task ? null : ORDERED_RE.exec(raw);
    const bullet = task || ordered ? null : BULLET_RE.exec(raw);
    const item = task ?? ordered ?? bullet;
    if (item) {
      const col = item[1]!.replace(/\t/g, '    ').length;
      while (listStack.length && listStack[listStack.length - 1]! + 2 > col) listStack.pop();
      listStack.push(col);
      if (listRun < 0) listRun = listRunBase.n++;
      const depth = Math.min(5, listStack.length);
      pushBlock({
        kind: 'list',
        text: (task ? task[3]! : ordered ? ordered[4]! : bullet![3]!).trim(),
        depth,
        ordered: !!ordered,
        number: ordered ? Number(ordered[2]) : 0,
        role: role(),
        run: listRun,
      });
      i++;
      continue;
    }
    // A paragraph (or a note definition): lines up to the next block.
    endList();
    const parts: string[] = [t];
    i++;
    while (i < lines.length && !isBlank(lines[i]!) && !startsBlock(lines[i]!.trim(), lines[i]!)) parts.push(lines[i++]!.trim());
    const text = joinLines(parts);
    const def = NOTE_DEF_RE.exec(text);
    if (def) {
      const id = def[1]!;
      if (!notes.has(id)) notes.set(id, text.slice(def[0].length));
      pushBlock({ kind: 'markup', text });
      continue;
    }
    pushBlock({ kind: 'para', text, role: role() });
  }
  return { blocks, notes };
}

// ---------------------------------------------------------------------------
// Style registry (the template in reverse)
// ---------------------------------------------------------------------------

type StyleKind = 'paragraph' | 'character';

interface StyleDef {
  id: string;
  name: string;
  kind: StyleKind;
  basedOn?: string;
  pPr?: string;
  rPr?: string;
  builtin?: boolean;
}

const sameTarget = (a: ParagraphTarget | CharacterTarget, b: ParagraphTarget | CharacterTarget): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const BUILTIN_HEADING = (level: number): string => `heading ${level}`;

function halfPoints(d: Dimension | undefined, base = 10): number | undefined {
  if (!d) return undefined;
  const pt = d.unit === 'pt' ? d.value : d.unit === 'px' ? d.value * 0.75 : d.unit === 'mm' ? d.value * 2.8346 : d.unit === 'cm' ? d.value * 28.346 : d.unit === 'in' ? d.value * 72 : d.value * base;
  return pt > 4 && pt < 200 ? Math.round(pt * 2) : undefined;
}

function twips(d: Dimension | undefined, base = 10): number | undefined {
  const hp = halfPoints(d, base);
  return hp !== undefined ? hp * 10 : undefined;
}

const hex = (c: ColorValue | undefined): string | undefined => (c?.hex && /^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex.slice(1).toUpperCase() : undefined);

class Styles {
  readonly defs = new Map<string, StyleDef>();
  private byName = new Map<string, StyleDef>();
  readonly paragraphs: Record<string, ParagraphTarget> = {};
  readonly characters: Record<string, CharacterTarget> = {};

  constructor(private template: WordTemplate, private config: PostextConfig, private names: WordStyleNames) {
    const body = config.bodyText;
    const bodySize = halfPoints(body?.fontSize) ?? 22;
    this.define({ id: 'Normal', name: 'Normal', kind: 'paragraph', builtin: true, pPr: '<w:spacing w:after="120" w:line="276" w:lineRule="auto"/>', rPr: `<w:sz w:val="${bodySize}"/>` });
    const sizes = [40, 32, 28, 26, 24, 22];
    for (let l = 1; l <= 6; l++) {
      this.define({ id: `Heading${l}`, name: BUILTIN_HEADING(l), kind: 'paragraph', builtin: true, basedOn: 'Normal', pPr: `<w:keepNext/><w:spacing w:before="${l === 1 ? 480 : 240}" w:after="120"/><w:outlineLvl w:val="${l - 1}"/>`, rPr: `<w:b/><w:sz w:val="${sizes[l - 1]}"/>` });
    }
    this.define({ id: 'Quote', name: 'Quote', kind: 'paragraph', builtin: true, basedOn: 'Normal', pPr: '<w:ind w:left="720" w:right="720"/>', rPr: '<w:i/><w:color w:val="595959"/>' });
    this.define({ id: 'ListParagraph', name: 'List Paragraph', kind: 'paragraph', builtin: true, basedOn: 'Normal', pPr: '<w:ind w:left="720"/><w:contextualSpacing/>' });
    this.define({ id: 'FootnoteText', name: 'footnote text', kind: 'paragraph', builtin: true, basedOn: 'Normal', pPr: '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', rPr: '<w:sz w:val="18"/>' });
    this.define({ id: 'FootnoteReference', name: 'footnote reference', kind: 'character', builtin: true, rPr: '<w:vertAlign w:val="superscript"/>' });
    this.define({ id: 'Hyperlink', name: 'Hyperlink', kind: 'character', builtin: true, rPr: '<w:color w:val="0563C1"/><w:u w:val="single"/>' });
    const mono = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:color w:val="7F7F7F"/><w:sz w:val="18"/>';
    this.define({ id: 'PostextMarkup', name: MARKUP_STYLE, kind: 'paragraph', basedOn: 'Normal', pPr: '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0"/>', rPr: mono });
    this.define({ id: 'PostextMarkupInline', name: MARKUP_CHAR_STYLE, kind: 'character', rPr: `${mono}<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>` });
    this.define({ id: 'PostextChapter', name: CHAPTER_STYLE, kind: 'paragraph', basedOn: 'Normal', pPr: '<w:pageBreakBefore/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="A6A6A6"/></w:pBdr><w:spacing w:after="240"/>', rPr: '<w:caps/><w:color w:val="7F7F7F"/><w:sz w:val="20"/>' });
    this.paragraphs[MARKUP_STYLE] = { kind: 'markup' };
    this.paragraphs[CHAPTER_STYLE] = { kind: 'chapter' };
    this.characters[MARKUP_CHAR_STYLE] = { kind: 'markup' };
  }

  private define(def: StyleDef): StyleDef {
    const existing = this.byName.get(def.name.toLowerCase());
    if (existing) return existing;
    let id = def.id.replace(/[^A-Za-z0-9]/g, '') || 'Style';
    for (let n = 2; this.defs.has(id); n++) id = `${def.id.replace(/[^A-Za-z0-9]/g, '') || 'Style'}${n}`;
    const d = { ...def, id };
    this.defs.set(id, d);
    this.byName.set(d.name.toLowerCase(), d);
    return d;
  }

  /** The template's own name for a target, when it has one. */
  private templateName<T extends ParagraphTarget | CharacterTarget>(map: Record<string, T>, target: T): string | undefined {
    for (const [name, t] of Object.entries(map)) if (sameTarget(t, target)) return name;
    return undefined;
  }

  private freeName<T extends ParagraphTarget | CharacterTarget>(base: string, kind: StyleKind, target: T, map: Record<string, T>): string {
    let name = base;
    for (let n = 2; ; n++) {
      const taken = this.byName.get(name.toLowerCase());
      if (!taken) return name;
      const meaning = map[taken.name];
      if (taken.kind === kind && (!meaning || sameTarget(meaning, target)) && !(taken.builtin && !meaning)) return name;
      name = `${base} (${n})`;
    }
  }

  /** A paragraph style for a target, defined on first use. */
  paragraph(target: ParagraphTarget, fallbackName: () => string, look: () => Pick<StyleDef, 'basedOn' | 'pPr' | 'rPr'>): string {
    // A name that already means something else (a Postext style called
    // `Quote`, one heading style used at two levels) gets a number.
    const name = this.freeName(this.templateName(this.template.paragraphs, target) ?? fallbackName(), 'paragraph', target, this.paragraphs);
    const def = this.define({ id: name, name, kind: 'paragraph', ...look() });
    this.paragraphs[def.name] = target;
    return def.id;
  }

  character(target: CharacterTarget, fallbackName: () => string, look: () => Pick<StyleDef, 'rPr'>): string {
    const name = this.freeName(this.templateName(this.template.characters, target) ?? fallbackName(), 'character', target, this.characters);
    const def = this.define({ id: name, name, kind: 'character', ...look() });
    this.characters[def.name] = target;
    return def.id;
  }

  heading(level: number, style?: string): string {
    if (!style) {
      const custom = this.templateName(this.template.paragraphs, { kind: 'heading', level });
      if (!custom || custom.toLowerCase() === BUILTIN_HEADING(level)) {
        this.paragraphs[BUILTIN_HEADING(level)] = { kind: 'heading', level };
        return `Heading${level}`;
      }
    }
    const hs = style ? this.config.headingStyles?.find((s) => s.id === style) : undefined;
    return this.paragraph(
      { kind: 'heading', level, ...(style ? { style } : {}) },
      () => (hs ? hs.name ?? hs.id : style ?? BUILTIN_HEADING(level)),
      () => ({ basedOn: `Heading${level}` }),
    );
  }

  paragraphsStyle(style: string): string {
    const ps = this.config.paragraphStyles?.find((s) => s.id === style);
    return this.paragraph({ kind: 'paragraphs', style }, () => ps?.name ?? style, () => {
      let rPr = '';
      let pPr = '';
      if (ps?.fontFamily) rPr += `<w:rFonts w:ascii="${escapeAttr(ps.fontFamily)}" w:hAnsi="${escapeAttr(ps.fontFamily)}"/>`;
      if (ps?.italic) rPr += '<w:i/>';
      if (ps?.smallCaps) rPr += '<w:smallCaps/>';
      const c = hex(ps?.color);
      if (c) rPr += `<w:color w:val="${c}"/>`;
      const sz = halfPoints(ps?.fontSize);
      if (sz) rPr += `<w:sz w:val="${sz}"/>`;
      const jc = ps?.textAlign === 'center' ? 'center' : ps?.textAlign === 'right' || ps?.textAlign === 'end' ? 'right' : ps?.textAlign === 'justify' ? 'both' : ps?.textAlign ? 'left' : undefined;
      // Schema order: ind before jc.
      const ind = twips(ps?.indent);
      if (ind) pPr += `<w:ind w:left="${ind}"/>`;
      if (jc) pPr += `<w:jc w:val="${jc}"/>`;
      return { basedOn: 'Normal', pPr, rPr };
    });
  }

  callout(type: string, title = false): string {
    const cs = calloutStylesOf(this.config).find((s) => s.id === type);
    const label = cs?.name ?? type;
    const fill = (cs?.backgroundEnabled !== false ? hex(cs?.background) : undefined) ?? 'EEF3F8';
    return this.paragraph(
      title ? { kind: 'calloutTitle', type } : { kind: 'callout', type },
      () => (title ? this.names.calloutTitle : this.names.callout).replace('__name__', label),
      () => ({
        basedOn: 'Normal',
        pPr: `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="8EA9C1"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/><w:ind w:left="284" w:right="284"/>`,
        rPr: title ? '<w:b/>' : '',
      }),
    );
  }

  quote(): string {
    const custom = this.templateName(this.template.paragraphs, { kind: 'quote' });
    if (!custom || custom.toLowerCase() === 'quote') {
      this.paragraphs.Quote = { kind: 'quote' };
      return 'Quote';
    }
    return this.paragraph({ kind: 'quote' }, () => custom, () => ({ basedOn: 'Quote' }));
  }

  body(): string {
    this.paragraphs.Normal = { kind: 'body' };
    return 'Normal';
  }

  chip(style: string): string {
    const cs = chipStylesOf(this.config).find((s) => s.id === style);
    const fill = hex(cs?.background) ?? 'E8EEF7';
    return this.character({ kind: 'chip', style }, () => this.names.chip.replace('__name__', cs?.name ?? style), () => ({
      rPr: `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`,
    }));
  }

  xml(): string {
    let out = '';
    for (const d of this.defs.values()) {
      const type = d.kind;
      const isDefault = d.id === 'Normal' ? ' w:default="1"' : '';
      out += `<w:style w:type="${type}" w:styleId="${d.id}"${isDefault}${d.builtin ? '' : ' w:customStyle="1"'}>`;
      out += `<w:name w:val="${escapeAttr(d.name)}"/>`;
      if (d.basedOn) out += `<w:basedOn w:val="${d.basedOn}"/>`;
      if (type === 'paragraph') out += '<w:next w:val="Normal"/>';
      out += '<w:qFormat/>';
      if (d.pPr && type === 'paragraph') out += `<w:pPr>${d.pPr}</w:pPr>`;
      if (d.rPr) out += `<w:rPr>${d.rPr}</w:rPr>`;
      out += '</w:style>';
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// WordprocessingML
// ---------------------------------------------------------------------------

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function textXml(text: string): string {
  // Tabs and newlines inside a verbatim run, and the forced line breaks of
  // a paragraph (#620).
  return text.split(/(\t|\n|\u2028)/).map((piece) => {
    if (piece === '\t') return '<w:tab/>';
    if (piece === '\n' || piece === LINE_BREAK) return '<w:br/>';
    return piece ? `<w:t xml:space="preserve">${escapeXml(piece)}</w:t>` : '';
  }).join('');
}

interface RunContext {
  styles: Styles;
  /** Notes cited here: id → Word note id. */
  noteIds: Map<string, number>;
  linkRel: (url: string) => string;
}

function runsXml(runs: InlineRun[], ctx: RunContext): string {
  let out = '';
  let i = 0;
  while (i < runs.length) {
    const r = runs[i]!;
    if (r.href !== undefined) {
      let j = i;
      let inner = '';
      while (j < runs.length && runs[j]!.href === r.href) {
        inner += runXml({ ...runs[j]!, href: undefined }, ctx, 'Hyperlink');
        j++;
      }
      out += `<w:hyperlink r:id="${ctx.linkRel(r.href)}" w:history="1">${inner}</w:hyperlink>`;
      i = j;
      continue;
    }
    out += runXml(r, ctx);
    i++;
  }
  return out;
}

function runXml(r: InlineRun, ctx: RunContext, charStyle?: string): string {
  if (r.note !== undefined) {
    const id = ctx.noteIds.get(r.note);
    if (id === undefined) return `<w:r><w:rPr><w:rStyle w:val="PostextMarkupInline"/></w:rPr>${textXml(`[^${r.note}]`)}</w:r>`;
    return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;
  }
  if (!r.text) return '';
  let rPr = '';
  const style = r.raw ? 'PostextMarkupInline' : r.chip !== undefined ? ctx.styles.chip(r.chip) : charStyle;
  if (style) rPr += `<w:rStyle w:val="${style}"/>`;
  if (r.bold) rPr += '<w:b/>';
  if (r.italic) rPr += '<w:i/>';
  if (r.smallCaps) rPr += '<w:smallCaps/>';
  if (r.script) rPr += `<w:vertAlign w:val="${r.script === 'sup' ? 'superscript' : 'subscript'}"/>`;
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}${textXml(r.text)}</w:r>`;
}

function paragraphXml(styleId: string, content: string, extraPPr = ''): string {
  return `<w:p><w:pPr><w:pStyle w:val="${styleId}"/>${extraPPr}</w:pPr>${content}</w:p>`;
}

/** Bullets on one abstract list, numbers on another; each run of ordered
 *  items gets its own `w:num` with its first number as the start. */
class Numbering {
  private nums: Array<{ abstract: 0 | 1; ilvl?: number; start?: number }> = [{ abstract: 0 }];
  private open = new Map<string, { numId: number; next: number }>();

  bullet(): number {
    return 1;
  }

  ordered(run: number, depth: number, number: number): number {
    const key = `${run}:${depth}`;
    const cur = this.open.get(key);
    if (cur && cur.next === number) {
      cur.next++;
      return cur.numId;
    }
    this.nums.push({ abstract: 1, ilvl: depth - 1, start: number });
    const numId = this.nums.length;
    this.open.set(key, { numId, next: number + 1 });
    // A shallower item ends the deeper runs under it.
    for (const k of [...this.open.keys()]) {
      const [r, d] = k.split(':').map(Number);
      if (r === run && d! > depth) this.open.delete(k);
    }
    return numId;
  }

  /** A shallower item in a run closes the numbering below it. */
  touch(run: number, depth: number): void {
    for (const k of [...this.open.keys()]) {
      const [r, d] = k.split(':').map(Number);
      if (r === run && d! > depth) this.open.delete(k);
    }
  }

  xml(): string {
    const bullets = ['•', '◦', '▪', '•', '◦', '▪', '•', '◦', '▪'];
    const level = (l: number, fmt: string, text: string): string =>
      `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${escapeAttr(text)}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
    let out = `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${bullets.map((b, l) => level(l, 'bullet', b)).join('')}</w:abstractNum>`;
    out += `<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/>${Array.from({ length: 9 }, (_, l) => level(l, 'decimal', `%${l + 1}.`)).join('')}</w:abstractNum>`;
    this.nums.forEach((n, k) => {
      out += `<w:num w:numId="${k + 1}"><w:abstractNumId w:val="${n.abstract}"/>`;
      if (n.ilvl !== undefined && n.start !== undefined) out += `<w:lvlOverride w:ilvl="${n.ilvl}"><w:startOverride w:val="${n.start}"/></w:lvlOverride>`;
      out += '</w:num>';
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W_NS}>${out}</w:numbering>`;
  }
}

function roleStyle(role: Role, styles: Styles): string {
  switch (role.kind) {
    case 'paragraphs':
      return styles.paragraphsStyle(role.style);
    case 'callout':
      return role.type ? styles.callout(role.type) : styles.body();
    case 'quote':
      return styles.quote();
    default:
      return styles.body();
  }
}

/** Build the `.docx` bytes for chapters. */
export function postextToDocx(chapters: readonly ExportChapter[], settings: ExportSettings): Uint8Array {
  const styles = new Styles(settings.template, settings.config, settings.names ?? DEFAULT_STYLE_NAMES);
  const numbering = new Numbering();
  const links = new Map<string, string>();
  const linkRel = (url: string): string => {
    let id = links.get(url);
    if (!id) {
      id = `rIdL${links.size + 1}`;
      links.set(url, id);
    }
    return id;
  };
  const footnotes: string[] = [];
  let body = '';
  const listRunBase = { n: 0 };

  chapters.forEach((chapter) => {
    if (settings.book) body += paragraphXml('PostextChapter', `<w:r>${textXml(chapter.title)}</w:r>`);
    const { blocks, notes } = parseChapter(chapter.markdown, listRunBase);
    const noteIds = new Map<string, number>();
    const pending = new Set<string>();
    const ctx: RunContext = { styles, noteIds, linkRel };
    const inline = (text: string, heading = false): InlineRun[] =>
      parseInline(text, {
        heading,
        notes: heading ? new Set() : new Set(notes.keys()),
        takeNote: (id) => {
          if (noteIds.has(id) || pending.has(id)) return false;
          pending.add(id);
          return true;
        },
      });
    const citeNotes = (runs: InlineRun[]): void => {
      for (const r of runs) {
        if (r.note === undefined || noteIds.has(r.note)) continue;
        const wordId = footnotes.length + 1;
        noteIds.set(r.note, wordId);
        const noteRuns = parseInline(notes.get(r.note) ?? '', {});
        footnotes.push(`<w:footnote w:id="${wordId}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>${runsXml(noteRuns, ctx)}</w:p></w:footnote>`);
      }
    };
    // Definitions of notes some marker cites leave the flow (they live in
    // the Word note); the others stay verbatim.
    const cited = new Set<string>();
    for (const b of blocks) {
      if (b.kind === 'para' || b.kind === 'list') for (const m of b.text.matchAll(/\[\^([\p{L}\p{N}_.:-]+)\](?!:)/gu)) cited.add(m[1]!);
    }
    for (const b of blocks) {
      switch (b.kind) {
        case 'markup': {
          const def = NOTE_DEF_RE.exec(b.text);
          if (def && cited.has(def[1]!) && notes.get(def[1]!) === b.text.slice(def[0].length)) break;
          body += paragraphXml(styles.paragraph({ kind: 'markup' }, () => MARKUP_STYLE, () => ({})), b.text ? `<w:r>${textXml(b.text)}</w:r>` : '');
          break;
        }
        case 'heading': {
          // Trailing attributes (`{toc="false"}`) travel as markup.
          const attrs = /\s+\{[^{}]*\}\s*$/.exec(b.text);
          const runs = attrs
            ? [...inline(b.text.slice(0, attrs.index), true), { text: attrs[0].trimEnd(), raw: true }]
            : inline(b.text, true);
          body += paragraphXml(styles.heading(b.level, b.style), runsXml(runs, ctx));
          break;
        }
        case 'para': {
          const runs = inline(b.text);
          citeNotes(runs);
          body += paragraphXml(roleStyle(b.role, styles), runsXml(runs, ctx));
          break;
        }
        case 'list': {
          const runs = inline(b.text);
          citeNotes(runs);
          numbering.touch(b.run, b.depth);
          const numId = b.ordered ? numbering.ordered(b.run, b.depth, b.number) : numbering.bullet();
          const style = b.role.kind === 'body' ? 'ListParagraph' : roleStyle(b.role, styles);
          body += paragraphXml(style, runsXml(runs, ctx), `<w:numPr><w:ilvl w:val="${b.depth - 1}"/><w:numId w:val="${numId}"/></w:numPr>`);
          break;
        }
        default:
          break;
      }
    }
  });
  if (!body) body = paragraphXml('Normal', '');

  const template: WordTemplate = {
    ...settings.template,
    paragraphs: { ...settings.template.paragraphs, ...styles.paragraphs },
    characters: { ...settings.template.characters, ...styles.characters },
  };

  const sect = '<w:sectPr><w:footnotePr><w:numFmt w:val="decimal"/></w:footnotePr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W_NS}><w:body>${body}${sect}</w:body></w:document>`;
  const lang = settings.config.locale ?? 'en';
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:eastAsia="Georgia" w:cs="Times New Roman"/><w:sz w:val="22"/><w:lang w:val="${escapeAttr(lang)}"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>${styles.xml()}</w:styles>`;
  const footnotesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes ${W_NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${footnotes.join('')}</w:footnotes>`;
  const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${W_NS}><w:defaultTabStop w:val="709"/><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const linkRels = [...links].map(([url, id]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeAttr(url)}" TargetMode="External"/>`).join('');
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdFootnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdTemplate" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item1.xml"/>${linkRels}</Relationships>`;
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${settings.title ? `<dc:title>${escapeXml(settings.title)}</dc:title>` : ''}${settings.author ? `<dc:creator>${escapeXml(settings.author)}</dc:creator>` : ''}<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Postext</Application></Properties>';
  const templateJson = JSON.stringify({ version: 1, ...template, id: '', updatedAt: 0 });
  const item = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><${TEMPLATE_XML_ROOT} xmlns="${TEMPLATE_XML_NS}">${escapeXml(templateJson)}</${TEMPLATE_XML_ROOT}>`;
  const itemProps = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><ds:datastoreItem ds:itemID="{6E0D2B5A-3F1C-4C8B-9A2D-5F0E7A1B9C30}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${TEMPLATE_XML_NS}"/></ds:schemaRefs></ds:datastoreItem>`;
  const itemRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps1.xml"/></Relationships>';
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  const pkgRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(pkgRels),
    'docProps/core.xml': strToU8(core),
    'docProps/app.xml': strToU8(app),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(stylesXml),
    'word/numbering.xml': strToU8(numbering.xml()),
    'word/footnotes.xml': strToU8(footnotesXml),
    'word/settings.xml': strToU8(settingsXml),
    'word/_rels/document.xml.rels': strToU8(docRels),
    'customXml/item1.xml': strToU8(item),
    'customXml/itemProps1.xml': strToU8(itemProps),
    'customXml/_rels/item1.xml.rels': strToU8(itemRels),
  }, { level: 6 });
}

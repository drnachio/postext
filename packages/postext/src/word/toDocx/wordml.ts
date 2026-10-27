// WordprocessingML for runs and paragraphs, and the numbering part.
import { LINE_BREAK, type InlineRun } from '../inline.js';
import { escapeXml, escapeAttr } from '../xml.js';
import { Styles } from './styles.js';

// ---------------------------------------------------------------------------
// WordprocessingML
// ---------------------------------------------------------------------------

export const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export function textXml(text: string): string {
  // Tabs and newlines inside a verbatim run, and the forced line breaks of
  // a paragraph (#620).
  return text.split(/(\t|\n|\u2028)/).map((piece) => {
    if (piece === '\t') return '<w:tab/>';
    if (piece === '\n' || piece === LINE_BREAK) return '<w:br/>';
    return piece ? `<w:t xml:space="preserve">${escapeXml(piece)}</w:t>` : '';
  }).join('');
}

export interface RunContext {
  styles: Styles;
  /** Notes cited here: id → Word note id. */
  noteIds: Map<string, number>;
  linkRel: (url: string) => string;
}

export function runsXml(runs: InlineRun[], ctx: RunContext): string {
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

export function paragraphXml(styleId: string, content: string, extraPPr = ''): string {
  return `<w:p><w:pPr><w:pStyle w:val="${styleId}"/>${extraPPr}</w:pPr>${content}</w:p>`;
}

/** Bullets on one abstract list, numbers on another; each run of ordered
 *  items gets its own `w:num` with its first number as the start. */
export class Numbering {
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

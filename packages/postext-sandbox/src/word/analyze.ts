// What a Word document brings: the styles in use (with counts and a sample
// of each) and a quality report of the original. A well-styled manuscript
// converts cleanly; one set entirely in Normal with formatting by hand comes
// in as plain paragraphs, and the report says so before the import.

import type { PostextConfig } from 'postext';
import type { WordBlock, WordDocument, WordParagraph, WordTextRun } from './model';
import { paragraphStyleName, paragraphText } from './model';
import type { WordTemplate } from './template';
import { paragraphTargetOf } from './toMarkdown';

export interface StyleUse {
  name: string;
  count: number;
  /** First words of the first paragraph (or run) in the style. */
  sample: string;
}

export type FindingId =
  | 'allNormal'
  | 'directFormatting'
  | 'manualHeadings'
  | 'lineBreaks'
  | 'pageBreaks'
  | 'emptyParagraphs'
  | 'typedNumbering'
  | 'spacing'
  | 'trackedChanges'
  | 'comments'
  | 'textBoxes'
  | 'unsupportedPictures'
  | 'equations'
  | 'hiddenText';

export interface QualityFinding {
  id: FindingId;
  count: number;
  /** A few paragraphs it was found in (first words). */
  examples: string[];
  severity: 'info' | 'warn';
}

export type QualityVerdict = 'clean' | 'mixed' | 'plain';

export interface QualityReport {
  verdict: QualityVerdict;
  /** Paragraphs with text (body and text boxes). */
  paragraphs: number;
  /** Of those, how many are in a style other than the default body ones. */
  styled: number;
  paragraphStyles: StyleUse[];
  characterStyles: StyleUse[];
  pictures: number;
  tables: number;
  footnotes: number;
  findings: QualityFinding[];
}

const SAMPLE_LENGTH = 72;
const sample = (t: string): string => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > SAMPLE_LENGTH ? `${s.slice(0, SAMPLE_LENGTH - 1).trimEnd()}…` : s;
};

/** Style names Word gives ordinary body text. */
const BODY_STYLE_RE = /^(?:normal|default|standard|body text(?: \d)?|text body|list paragraph|no spacing|normal \(web\)|plain text|default paragraph font)$/i;

const TYPED_NUMBERING_RE = /^\s*(?:\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|[•·▪◦‣●○■□–—-])\s+/;

/** Body-level paragraphs (text boxes included, table cells and notes not). */
function* bodyParagraphs(blocks: WordBlock[]): Generator<WordParagraph> {
  for (const b of blocks) {
    if (b.type !== 'paragraph') continue;
    yield b;
    if (b.textBoxes) yield* bodyParagraphs(b.textBoxes);
  }
}

/** Every paragraph, cells and text boxes included. */
function* allParagraphs(blocks: WordBlock[]): Generator<WordParagraph> {
  for (const b of blocks) {
    if (b.type === 'paragraph') {
      yield b;
      if (b.textBoxes) yield* allParagraphs(b.textBoxes);
    } else {
      for (const row of b.rows) for (const cell of row) yield* allParagraphs(cell.blocks);
    }
  }
}

function countTables(blocks: WordBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === 'table') n++;
    else if (b.textBoxes) n += countTables(b.textBoxes);
  }
  return n;
}

export function analyzeDocx(doc: WordDocument, template: WordTemplate, config: PostextConfig): QualityReport {
  const paraStyles = new Map<string, StyleUse>();
  const charStyles = new Map<string, StyleUse>();
  const found = new Map<FindingId, QualityFinding>();
  const note = (id: FindingId, severity: QualityFinding['severity'], example?: string, n = 1): void => {
    const f = found.get(id) ?? { id, count: 0, examples: [], severity };
    f.count += n;
    if (example && f.examples.length < 3 && !f.examples.includes(example)) f.examples.push(example);
    found.set(id, f);
  };

  let paragraphs = 0;
  let styled = 0;
  let pictures = 0;
  let footnotes = 0;
  const unsupported = new Set<string>();

  for (const p of bodyParagraphs(doc.blocks)) {
    const text = paragraphText(p);
    const name = paragraphStyleName(doc, p);
    const ex = sample(text);
    const hasContent = text.trim() !== '' || p.runs.some((r) => r.type === 'image' || r.type === 'math');
    if (!hasContent) {
      if (!p.pageBreakBefore && !p.runs.some((r) => r.type === 'break' && r.kind === 'page')) note('emptyParagraphs', 'warn');
      continue;
    }
    const use = paraStyles.get(name) ?? { name, count: 0, sample: '' };
    use.count++;
    if (!use.sample && ex) use.sample = ex;
    paraStyles.set(name, use);
    if (!text.trim()) continue;
    paragraphs++;
    const target = paragraphTargetOf(doc, p.styleId, template, config);
    const bodyStyle = BODY_STYLE_RE.test(name) || (p.styleId === '' || p.styleId === doc.defaultParagraphStyle);
    if (!bodyStyle) styled++;

    const textRuns = p.runs.filter((r): r is WordTextRun => r.type === 'text');
    if (p.manualLayout || textRuns.some((r) => r.manual)) note('directFormatting', 'warn', ex);
    const t = text.trim();
    if (target.kind === 'body' && !p.list && t.length <= 120 && !/[.:;,]$/.test(t)
      && textRuns.some((r) => r.text.trim())
      && textRuns.filter((r) => r.text.trim()).every((r) => r.bold === true)) {
      note('manualHeadings', 'warn', ex);
    }
    const lineBreaks = p.runs.filter((r) => r.type === 'break' && r.kind === 'line').length;
    if (lineBreaks) note('lineBreaks', 'info', ex, lineBreaks);
    const pageBreaks = p.runs.filter((r) => r.type === 'break' && r.kind === 'page').length + (p.pageBreakBefore ? 1 : 0);
    if (pageBreaks) note('pageBreaks', 'info', ex, pageBreaks);
    if (!p.list && TYPED_NUMBERING_RE.test(text)) note('typedNumbering', 'warn', ex);
    if (p.runs.some((r) => r.type === 'tab') || / {2,}/.test(text) || /^\s+\S/.test(text)) note('spacing', 'info', ex);
    if (textRuns.some((r) => r.hidden)) note('hiddenText', 'info', ex);
    if (p.textBoxes?.length) note('textBoxes', 'info', ex);
  }

  for (const p of allParagraphs(doc.blocks)) {
    for (const r of p.runs) {
      if (r.type === 'text' && r.charStyle && r.text.trim()) {
        const use = charStyles.get(r.charStyle) ?? { name: r.charStyle, count: 0, sample: '' };
        use.count++;
        if (!use.sample) use.sample = sample(r.text);
        charStyles.set(r.charStyle, use);
      } else if (r.type === 'image') {
        pictures++;
        const media = doc.media.get(r.rId);
        if (media && !/^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(media.contentType)) unsupported.add(media.path.split('/').pop() ?? media.path);
      } else if (r.type === 'math') note('equations', 'info', sample(r.tex));
      else if (r.type === 'note') footnotes++;
    }
  }
  if (unsupported.size) {
    const f: QualityFinding = { id: 'unsupportedPictures', count: unsupported.size, examples: [...unsupported].slice(0, 3), severity: 'warn' };
    found.set(f.id, f);
  }
  const revisions = doc.revisions.insertions + doc.revisions.deletions;
  if (revisions) found.set('trackedChanges', { id: 'trackedChanges', count: revisions, examples: [], severity: 'warn' });
  if (doc.revisions.comments) found.set('comments', { id: 'comments', count: doc.revisions.comments, examples: [], severity: 'info' });

  const direct = found.get('directFormatting')?.count ?? 0;
  const manualHeadings = found.get('manualHeadings')?.count ?? 0;
  let verdict: QualityVerdict;
  if (paragraphs > 0 && styled === 0) {
    verdict = 'plain';
    found.set('allNormal', { id: 'allNormal', count: paragraphs, examples: [], severity: 'warn' });
  } else if (manualHeadings === 0 && direct <= Math.max(1, paragraphs * 0.1) && !found.has('typedNumbering')) verdict = 'clean';
  else verdict = 'mixed';

  const order: FindingId[] = ['allNormal', 'manualHeadings', 'directFormatting', 'typedNumbering', 'trackedChanges', 'unsupportedPictures', 'emptyParagraphs', 'lineBreaks', 'pageBreaks', 'spacing', 'textBoxes', 'equations', 'hiddenText', 'comments'];
  const byCount = (a: StyleUse, b: StyleUse): number => b.count - a.count || a.name.localeCompare(b.name);
  return {
    verdict,
    paragraphs,
    styled,
    paragraphStyles: [...paraStyles.values()].sort(byCount),
    characterStyles: [...charStyles.values()].sort(byCount),
    pictures,
    tables: countTables(doc.blocks),
    footnotes,
    findings: order.map((id) => found.get(id)).filter((f): f is QualityFinding => !!f),
  };
}

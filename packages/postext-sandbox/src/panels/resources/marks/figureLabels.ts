import type { ResourceAnchor } from 'postext';
import { parseMarkdown } from 'postext';

// ---------------------------------------------------------------------------
// The `::label` lines of the book's figures (#866), as the anchor editor
// and the Markdown editor read them: which anchors of a picture the text
// sets a label at, which names the text uses that the picture has no anchor
// for yet, and where each label is written. Pure.
// ---------------------------------------------------------------------------

/** A `::label[TEXT]{at=… style=…}` line of a `:::figure{resource=…}`. */
export interface MarkdownLabel {
  chapterId: string;
  resourceId: string;
  /** The anchor it stands at; unset for a label placed by `at="x% y%"`. */
  anchor?: string;
  /** Its point, for a label placed by percentages (fractions). */
  point?: { x: number; y: number };
  /** The plain text of the label (see `plainLabelText`). */
  text: string;
  /** Its own `style="…"`, when it names one. */
  style?: string;
  /** Its own `leader` attribute (#1057): true for `leader`, false for
   *  `leader="none"`; unset when it has none. */
  leader?: boolean;
  /** The label line in the chapter's Markdown. */
  start: number;
  end: number;
  /** The bracketed text. */
  textStart: number;
  textEnd: number;
}

/** A chapter as the readers need it: its id and its text (as typed for
 *  the chapter on screen). */
export interface ChapterText {
  id: string;
  markdown: string;
}

/** A label's text as the lists show it (#1064): the lines of a container
 *  label joined by « / », its inline symbols left out (their placeholders
 *  mean nothing on screen). */
export function plainLabelText(text: string): string {
  return text.replace(/\u2028/g, ' / ').replace(/\u2064/g, '').replace(/\s+/g, ' ').trim();
}

const cache = new Map<string, Omit<MarkdownLabel, 'chapterId'>[]>();
const CACHE_SIZE = 32;

function labelsOfText(markdown: string): Omit<MarkdownLabel, 'chapterId'>[] {
  // A one-line `::label[…]` and the container form `:::label{…}` (#1058).
  if (!markdown.includes('::label')) return [];
  const hit = cache.get(markdown);
  if (hit) return hit;
  const out: Omit<MarkdownLabel, 'chapterId'>[] = [];
  for (const b of parseMarkdown(markdown)) {
    if (b.type !== 'resourceBlock' || !b.figure || !b.resourceId) continue;
    for (const l of b.figure.labels) {
      out.push({
        resourceId: b.resourceId,
        ...('anchor' in l.at ? (l.at.anchor ? { anchor: l.at.anchor } : {}) : { point: { x: l.at.x, y: l.at.y } }),
        text: plainLabelText(l.text),
        ...(l.style ? { style: l.style } : {}),
        ...(l.leader !== undefined ? { leader: l.leader } : {}),
        start: l.sourceStart,
        end: l.sourceEnd,
        textStart: l.textStart,
        textEnd: l.textEnd,
      });
    }
  }
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(markdown, out);
  return out;
}

/** Every figure label of `chapters`, in reading order; only those of
 *  `resourceId` when given. */
export function labelsInChapters(chapters: readonly ChapterText[], resourceId?: string): MarkdownLabel[] {
  const out: MarkdownLabel[] = [];
  for (const c of chapters) {
    for (const l of labelsOfText(c.markdown)) {
      if (resourceId !== undefined && l.resourceId !== resourceId) continue;
      out.push({ ...l, chapterId: c.id });
    }
  }
  return out;
}

/** What the text does with the anchors of one picture. */
export interface AnchorLabelState {
  /** The labels set at each anchor id. */
  byAnchor: Map<string, MarkdownLabel[]>;
  /** Names labels stand at that the picture has no anchor for, in the
   *  order the text first uses them (`labelAnchorUnknown`). */
  waiting: string[];
  /** The first label of each waiting name. */
  waitingLabel: Map<string, MarkdownLabel>;
}

export function anchorLabelState(anchors: readonly ResourceAnchor[], labels: readonly MarkdownLabel[]): AnchorLabelState {
  const ids = new Set(anchors.map((a) => a.id));
  const byAnchor = new Map<string, MarkdownLabel[]>();
  const waiting: string[] = [];
  const waitingLabel = new Map<string, MarkdownLabel>();
  for (const l of labels) {
    if (!l.anchor) continue;
    if (ids.has(l.anchor)) {
      const list = byAnchor.get(l.anchor);
      if (list) list.push(l);
      else byAnchor.set(l.anchor, [l]);
    } else if (!waitingLabel.has(l.anchor)) {
      waiting.push(l.anchor);
      waitingLabel.set(l.anchor, l);
    }
  }
  return { byAnchor, waiting, waitingLabel };
}

/** The resource a `:::figure` fence names (`resource="…"`), when `line` is
 *  one. */
export function figureFenceResource(line: string): string | undefined {
  const m = /^\s*:::\s*figure\s*\{([^}]*)\}\s*$/.exec(line);
  if (!m) return undefined;
  const r = /(?:^|\s)resource\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))/.exec(m[1]!);
  const id = (r?.[1] ?? r?.[2] ?? r?.[3] ?? '').trim();
  return id || undefined;
}

/** The resource of the `:::figure` whose labels line `lineNumber` (1-based)
 *  of `lines` is among: the fence above it with only labels and blank
 *  lines between. */
export function figureOfLine(lineAt: (n: number) => string, lineNumber: number): string | undefined {
  for (let n = lineNumber - 1; n >= 1 && n >= lineNumber - 2000; n--) {
    const t = lineAt(n).trim();
    if (t === '' || t.startsWith('::label[')) continue;
    return figureFenceResource(t);
  }
  return undefined;
}

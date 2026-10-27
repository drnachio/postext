import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { Resource } from 'postext';
import { figureOfLine } from '../../panels/resources/marks/figureLabels.js';

/**
 * Completion for the labels of a figure (#866): inside a `:::figure{resource=…}`,
 * `at="…"` of a `::label[…]{}` line offers the picture's anchors (each with
 * the label style it gives its label, the ones no label of the figure
 * stands at yet first), `style="…"` the design's label styles, and `::la…`
 * at the start of a line writes a label line.
 */

/** A label style the completion offers. */
export interface LabelStyleOption {
  id: string;
  name?: string;
}

export interface LabelCompletionContext {
  resources: readonly Resource[];
  labelStyles: readonly LabelStyleOption[];
  /** The words shown beside an anchor: already labelled in this figure,
   *  and the style an anchor gives. */
  words?: { labelled: string; noStyle: string; label: string };
}

/** A label line up to its attributes: `::label[TEXT]{` (the text may hold
 *  one level of brackets), then the attributes before the caret. */
const LABEL_HEAD = String.raw`^\s*::label\[(?:\\.|\[[^\]\n]*\]|[^\]\\\n])*\]\{[^}\n]*`;
const AT_VALUE_RE = new RegExp(`${LABEL_HEAD}(?<![\\w-])at\\s*=\\s*(["']?)([^"'\\s}]*)$`, 'u');
const STYLE_VALUE_RE = new RegExp(`${LABEL_HEAD}(?<![\\w-])style\\s*=\\s*(["']?)([\\w.-]*)$`, 'u');
/** `::l`, `::la`, `::lab`, `::labe`, `::label` alone on a line. */
const DIRECTIVE_RE = /^\s*::l(?:a(?:b(?:el?)?)?)?$/;
const AT_ATTR_RE = /(?<![\w-])at\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))/;

/** The anchors other label lines of the figure round line `lineNumber`
 *  stand at. */
function labelledInFigure(lineAt: (n: number) => string, lineCount: number, lineNumber: number): Set<string> {
  const out = new Set<string>();
  const take = (t: string) => {
    if (!t.startsWith('::label[')) return;
    const m = AT_ATTR_RE.exec(t.slice(t.lastIndexOf(']{')));
    const v = (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim();
    if (v) out.add(v);
  };
  for (let n = lineNumber - 1; n >= 1; n--) {
    const t = lineAt(n).trim();
    if (t !== '' && !t.startsWith('::label[')) break;
    take(t);
  }
  for (let n = lineNumber + 1; n <= lineCount; n++) {
    const t = lineAt(n).trim();
    if (t !== '' && !t.startsWith('::label[')) break;
    take(t);
  }
  return out;
}

/** The anchors of `resource` as options: unlabelled first, each with its
 *  label style's name. */
export function anchorOptions(resource: Resource | undefined, styles: readonly LabelStyleOption[], labelled: ReadonlySet<string>, quote: string, words?: LabelCompletionContext['words']): Completion[] {
  const anchors = resource?.anchors ?? [];
  const styleName = (id: string | undefined) => {
    if (!id) return words?.noStyle;
    const s = styles.find((x) => x.id === id);
    return s?.name && s.name !== id ? `${s.name} (${id})` : id;
  };
  return anchors
    .map((a, i) => ({ a, i, done: labelled.has(a.id) }))
    .sort((x, y) => Number(x.done) - Number(y.done) || x.i - y.i)
    .map(({ a, done }) => ({
      label: a.id,
      ...(styleName(a.style) ? { detail: styleName(a.style) } : {}),
      ...(done && words ? { caption: words.labelled } : {}),
      boost: done ? -1 : 0,
      apply: quote ? a.id : `"${a.id}"`,
    } as Completion));
}

export function labelCompletionSource(getContext: () => LabelCompletionContext) {
  return (cx: CompletionContext): CompletionResult | null => {
    const line = cx.state.doc.lineAt(cx.pos);
    const before = line.text.slice(0, cx.pos - line.from);
    if (!before.trimStart().startsWith('::l')) return null;
    const doc = cx.state.doc;
    const lineAt = (n: number) => doc.line(n).text;
    const at = AT_VALUE_RE.exec(before);
    const style = at ? null : STYLE_VALUE_RE.exec(before);
    const directive = at || style ? null : DIRECTIVE_RE.exec(before);
    if (!at && !style && !directive) return null;
    const resourceId = figureOfLine(lineAt, line.number);
    if (!resourceId) return null;
    const ctx = getContext();
    if (at) {
      const quote = at[1] ?? '';
      const typed = at[2] ?? '';
      // A place by percentages (`at="62% 48%"`) is no anchor.
      if (/^\d/.test(typed)) return null;
      const resource = ctx.resources.find((r) => r.id === resourceId);
      const options = anchorOptions(resource, ctx.labelStyles, labelledInFigure(lineAt, doc.lines, line.number), quote, ctx.words);
      if (options.length === 0) return null;
      return { from: cx.pos - typed.length, to: cx.pos, options, validFor: /^[\p{L}\p{N}_.-]*$/u };
    }
    if (style) {
      const quote = style[1] ?? '';
      const typed = style[2] ?? '';
      const options: Completion[] = ctx.labelStyles.map((s) => ({
        label: s.id,
        ...(s.name && s.name !== s.id ? { detail: s.name } : {}),
        apply: quote ? s.id : `"${s.id}"`,
      }));
      if (options.length === 0) return null;
      return { from: cx.pos - typed.length, to: cx.pos, options, validFor: /^[\w.-]*$/ };
    }
    const start = cx.pos - directive![0].trimStart().length;
    return {
      from: start,
      to: cx.pos,
      filter: false,
      options: [{
        label: '::label[…]{at="…"}',
        detail: ctx.words?.label,
        apply: (view, _c, from, to) => {
          view.dispatch({ changes: { from, to, insert: '::label[]{at=""}' }, selection: { anchor: from + '::label['.length } });
        },
      }],
    };
  };
}

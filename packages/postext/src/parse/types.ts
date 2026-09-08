export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'blockquote'
  | 'listItem'
  | 'mathDisplay'
  | 'resourceBlock'
  | 'directive'
  | 'containerStart'
  | 'containerEnd';

/** Attributes parsed from a `:::name{key="v" other=bare flag}` directive.
 *  Values are kept as strings; directive consumers validate/coerce. A bare
 *  `flag` becomes `{ flag: '' }`. */
export type DirectiveAttrs = Record<string, string>;

/** Recognized directive names. Unknown names are not parsed as directives —
 *  they fall through to the paragraph branch and surface via warnings. */
export type DirectiveName = 'pagebreak' | 'numbering' | 'columnbreak';

/** Recognized fenced-container names. A container opens with a
 *  `:::name{attrs}` line and closes with a bare `:::` line; the blocks in
 *  between are parsed as usual and bracketed by a `containerStart` /
 *  `containerEnd` marker pair sharing a `containerId`. */
export type ContainerName = 'callout' | 'paragraphs' | 'part';

/** Letter-case transform applied to the computed label of an inline `:ref`
 *  (never to the number, never to a `text=` override). */
export type RefCase = 'lower' | 'upper' | 'capitalize';

/** Metadata attached to an `InlineSpan` when it represents a math formula.
 *  The span's `text` is a single `\uFFFC` (object replacement character)
 *  acting as a one-char-wide atomic placeholder in the plain text. */
export interface MathMeta {
  tex: string;
  /** Absolute source offset of the opening `$` in the original markdown. */
  sourceStart: number;
  /** Absolute source offset just past the closing `$`. */
  sourceEnd: number;
}

export interface InlineSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  /** Marks this span as a resource caption's numbered label (e.g. "Figure 1.")
   *  so renderers can paint it in the configured label colour. Flows span →
   *  token → segment, mirroring {@link ref}. */
  captionLabel?: boolean;
  /** Present when this span carries an inline math formula. The `text` is
   *  a single `\uFFFC` placeholder that layout treats atomically. */
  math?: MathMeta;
  /** Resolved math render — populated by the pipeline before measurement
   *  so the parser remains free of MathJax dependencies. */
  mathRender?: import('../math/types').MathRender;
  /** Present when this span is an inline reference to a `Resource`. The
   *  `text` carries placeholder/fallback content; the pipeline resolves the
   *  reference to its computed number/label. */
  ref?: {
    /** The referenced `Resource.id`. */
    resourceId: string;
    /** Rendering style: `'default'` uses the type short label + number,
     *  `'number'` is the bare number, `'full'` is the full caption prefix +
     *  number. */
    style?: 'default' | 'number' | 'full';
    /** Optional override text to display instead of the computed label. */
    text?: string;
    /** Optional letter-case transform for the label part (`Fig.` /
     *  `Figure`) of the computed label. Ignored when `text` is set. */
    case?: RefCase;
  };
}

/** Convenience discriminants for inline span iteration. */
export type TextSpan = InlineSpan & { math?: undefined };
export type MathSpan = InlineSpan & { math: MathMeta };

export type ListKind = 'unordered' | 'ordered' | 'task';

export type ParseIssueKind = 'unclosedMath' | 'unclosedMathBlock' | 'unclosedContainer';

interface ParseIssueBase {
  kind: ParseIssueKind;
  delimiter: '$' | '$$' | ':::';
  /** Absolute source offset of the unmatched opening delimiter. */
  sourceStart: number;
  /** End of the scanned region (usually the line or block end). */
  sourceEnd: number;
}

/** An inline `$…` or display `$$…` formula whose closing delimiter is
 *  missing. */
export interface UnclosedMathIssue extends ParseIssueBase {
  kind: 'unclosedMath' | 'unclosedMathBlock';
  delimiter: '$' | '$$';
  /** Raw TeX captured up to the end of the scanned region, for warning
   *  messages — may be empty. */
  tex: string;
}

/** A `:::name` container fence that was still open at end of input. The
 *  parser auto-closes it; `sourceStart`/`sourceEnd` cover the opening line. */
export interface UnclosedContainerIssue extends ParseIssueBase {
  kind: 'unclosedContainer';
  delimiter: ':::';
  containerName: ContainerName;
  containerId: number;
}

export type ParseIssue = UnclosedMathIssue | UnclosedContainerIssue;

export interface ContentBlock {
  type: ContentBlockType;
  text: string;
  spans: InlineSpan[];
  level?: number; // heading level 1-6
  /** For `heading` blocks: attributes parsed from a trailing
   *  `{key="value" other=bare}` on the heading line (e.g.
   *  `# Title {author="I. Zango"}`). The braces and their content are
   *  removed from `text`. Absent when the heading carries no attributes. */
  attrs?: DirectiveAttrs;
  /** Absolute source range of each quoted attribute value, so editors can
   *  map text rendered from `{attr.<key>}` back to the markdown. */
  attrSources?: Record<string, { start: number; end: number }>;
  /** Plain-text indices of forced title breaks (`\\` in the source). */
  titleBreaks?: number[];
  /** Depth (1-based) for listItem blocks. Level 1 = outermost. */
  depth?: number;
  /** Discriminator for listItem blocks. Defaults to 'unordered' when absent. */
  listKind?: ListKind;
  /** First number literal from the source (ordered lists only). */
  startNumber?: number;
  /** Checkbox state for task list items. */
  checked?: boolean;
  /** TeX source for `mathDisplay` blocks. */
  tex?: string;
  /** For `directive` blocks: the directive name (e.g. `'pagebreak'`). */
  directiveName?: DirectiveName;
  /** For `directive` blocks: parsed attributes. */
  directiveAttrs?: DirectiveAttrs;
  /** For `resourceBlock` blocks: the referenced `Resource.id`. */
  resourceId?: string;
  /** For `containerStart` / `containerEnd` marker blocks: the container
   *  name (`'callout'`, `'paragraphs'`, `'part'`). */
  containerName?: ContainerName;
  /** For `containerStart` blocks: attributes parsed from the opening fence.
   *  Always present on a start marker (empty object when the fence carries
   *  no `{…}`). */
  containerAttrs?: DirectiveAttrs;
  /** For container marker blocks: identifier shared by the matching
   *  start/end pair. Ids start at 1 and increase per parse. */
  containerId?: number;
  /** Character offset of the first source character of this block in the original markdown */
  sourceStart: number;
  /** Character offset just past the last source character of this block */
  sourceEnd: number;
  /**
   * Per-plain-character map: sourceMap[i] = absolute source offset (in the
   * original markdown) of the i-th character of `text`. `sourceMap.length`
   * equals `text.length`.
   */
  sourceMap: number[];
}

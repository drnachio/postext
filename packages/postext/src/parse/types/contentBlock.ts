// ContentBlock, the parser's output, with its block types, directive and
// container names, the parse options and the issues a parse reports
// (#1276: split out of types.ts).
import type { ComicPageSource } from '../../comics/types.js';
import type { SourceRange } from '../../composed/types.js';
import type { VerseInfo, TocBlockInfo, IndexBlockInfo, IndexMark, AnchorMark, CodeBlockInfo, ScoreBlockInfo, FigureInfo, ComposedPageFence, ComposedModuleFence, BlockSlot } from './blockInfo.js';
import type { InlineSpan } from './inlineSpan.js';

export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'blockquote'
  | 'listItem'
  | 'mathDisplay'
  | 'resourceBlock'
  | 'directive'
  | 'containerStart'
  | 'containerEnd'
  /** A code listing (#624): a ```` ``` ```` or `~~~` fence, or indented
   *  code under `codeStyle.indentedCode` (see {@link CodeBlockInfo}). */
  | 'code'
  /** A music score (#1172): a ```` ```abc ```` / ```` ```musicxml ```` /
   *  ```` ```mei ```` / ```` ```humdrum ```` fence (see {@link ScoreBlockInfo}).
   *  The build expands it into one block per engraved system. */
  | 'score';

/** Attributes parsed from a `:::name{key="v" other=bare flag}` directive.
 *  Values are kept as strings; directive consumers validate/coerce. A bare
 *  `flag` becomes `{ flag: '' }`. */
export type DirectiveAttrs = Record<string, string>;

/** Recognized directive names. Unknown names are not parsed as directives —
 *  they fall through to the paragraph branch and surface via warnings. */
export type DirectiveName = 'pagebreak' | 'numbering' | 'columnbreak' | 'space' | 'toc' | 'index' | 'bibliography' | 'references' | 'verse' | 'page' | 'strip' | 'figure'
  /** Where an exercise's solutions print (#1229): `:::solutions{scope=…}`. */
  | 'solutions'
  /** An exercise's word bank (#1225): a `::bank[sun | rain]` line inside a
   *  `:::exercise`; its words are added to the bank as distractors. */
  | 'bank';

/** Recognized fenced-container names. A container opens with a
 *  `:::name{attrs}` line and closes with a bare `:::` line; the blocks in
 *  between are parsed as usual and bracketed by a `containerStart` /
 *  `containerEnd` marker pair sharing a `containerId`. */
export type ContainerName = 'callout' | 'paragraphs' | 'part' | 'columns' | 'paper' | 'frame'
  /** An exercise (#1225): `:::exercise{type=…}` … `:::` (see
   *  `exercises/model.ts`), with its `:::solution` and `:::hint` inside. */
  | 'exercise' | 'solution' | 'hint'
  /** A module of a composed page (#1062): `:::module{template="…"
   *  name="…"}` … `:::` inside a page fence (see {@link ComposedModuleFence}). */
  | 'module'
  /** A composed page (#854): `::::page{template=…}` … `::::`, four or
   *  more colons (see {@link ComposedPageFence}). Not in
   *  `KNOWN_CONTAINERS`: a three-colon `:::page` is a comic page. */
  | 'composedPage'
  /** Only named by an `unclosedContainer` issue: a `:::figure` (#854) is
   *  read whole into one `resourceBlock` (see {@link FigureInfo}). */
  | 'figure';

export type ListKind = 'unordered' | 'ordered' | 'task';

export type ParseIssueKind = 'unclosedMath' | 'unclosedMathBlock' | 'unclosedContainer' | 'unclosedCodeBlock' | 'strayFence';

interface ParseIssueBase {
  kind: ParseIssueKind;
  delimiter: '$' | '$$' | ':::' | '```' | '~~~';
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

/** A ```` ``` ```` or `~~~` code fence still open at the end of the text
 *  (#624): the listing runs to the end; `sourceStart`/`sourceEnd` cover
 *  the opening fence line. */
export interface UnclosedCodeBlockIssue extends ParseIssueBase {
  kind: 'unclosedCodeBlock';
  delimiter: '```' | '~~~';
  /** The fence's language, when it names one. */
  lang?: string;
}

/** A bare `:::` right after a one-line directive (`:::toc`, `:::index`,
 *  `:::pagebreak`, `:::space`…) with no `:::` container open to close
 *  (#1125): those directives take no closing fence, so the line is
 *  dropped instead of printed. `sourceStart`/`sourceEnd` cover the fence
 *  line. */
export interface StrayFenceIssue extends ParseIssueBase {
  kind: 'strayFence';
  delimiter: ':::';
  /** The directive the fence follows. */
  directiveName: DirectiveName;
}

export type ParseIssue = UnclosedMathIssue | UnclosedContainerIssue | UnclosedCodeBlockIssue | StrayFenceIssue;

/** How a text is read (see `parseMarkdownWithIssues`). */
export interface ParseOptions {
  /** Read ```` ``` ```` / `~~~` fences as code blocks (#624). Default
   *  `true`; `false` reads their lines as Markdown, as postext 1.22 did. */
  fences?: boolean;
  /** Read indented code (four spaces or a tab after a blank line) as a
   *  code block. Default `false`. */
  indentedCode?: boolean;
  /** Read a fence in a notation language (```` ```abc ````, ```` ```musicxml ````,
   *  ```` ```mei ````, ```` ```humdrum ````) as a music score (#1172), not
   *  a listing. Default `true`; a fence with `{listing}` stays code. */
  scores?: boolean;
}

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
  /** A paragraph, quotation or list item with forced line breaks (#620): a
   *  backslash ending a source line, or `\\`, which its text holds as
   *  `BREAK_PLACEHOLDER` (U+2028). This is the block as postext 1.22 read
   *  it, every such backslash printed and the lines joined with a space,
   *  which a configuration stored before #620 lays out instead
   *  (`bodyText.hardLineBreaks: false`, see `literalBreaksFor`). Absent on
   *  a block with no forced break. */
  literalBreaks?: { text: string; spans: InlineSpan[]; sourceMap: number[] };
  /** A numbered heading whose level or style sets `numberPosition:
   *  'replace'`: its title is emptied before layout and the generated
   *  number is printed (and listed) as the whole title (#401). */
  numberIsTitle?: true;
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
  /** For `paragraph` blocks: the paragraph continues the one a display
   *  formula interrupted — the formula sits right under that paragraph's
   *  text and this paragraph's first line right under the formula's
   *  closing `$$`, with no blank line on either side — so it is set with no
   *  first-line indent, as TeX sets the text after a display. */
  continuesParagraph?: boolean;
  /** For `paragraph` blocks: the block is the definition of the footnote
   *  with this id (`[^id]: text`, the `[^id]:` left out of `text`). The
   *  layout takes it out of the flow and sets it as a note. */
  footnoteDef?: string;
  /** Set on the paragraphs the layout builds to set a note (`chapterEnd`
   *  placement): the id of the note. */
  footnoteNote?: string;
  /** The block ends with its callout style's end mark (a proof's ∎,
   *  #530), the last character of its text: the layout sets it flush
   *  right on the last line. */
  endMark?: string;
  /** Set on a bibliography entry (#269): the key of the work it lists. The
   *  entry is the anchor `ref-<key>` citations link to. */
  bibEntry?: string;
  /** For `directive` blocks: the directive name (e.g. `'pagebreak'`). */
  directiveName?: DirectiveName;
  /** For `directive` blocks: parsed attributes. */
  directiveAttrs?: DirectiveAttrs;
  /** For a `:::verse` block (#378): the poem's fence attributes. The
   *  block's `type` is `'paragraph'`; its text holds the hemistichs, a tab
   *  (`\t`) where a bayt's two hemistichs meet (the source's `||`) and a
   *  line feed (`\n`) between bayts, so the plain text and the source map
   *  read the poem as written (see `pipeline/text/verse.ts`). A poem in the line
   *  layout (#620) is one such block per stanza, its lines joined by line
   *  feeds (`VerseInfo.stanza`, `pipeline/text/verseLines.ts`). */
  verse?: VerseInfo;
  /** For a `:::page` block (a comic page, #555) or a `:::strip` block (a
   *  comic in the text flow, #566): its split, panels and script, read
   *  whole by `parseComicFence`. The block's `type` is `'directive'` and
   *  its `directiveName` `'page'` or `'strip'`. */
  comic?: ComicPageSource;
  /** For a `:::references` block (#268): its body as written — BibTeX,
   *  CSL-JSON or CSL-YAML — up to the closing `:::`, not parsed as
   *  Markdown. */
  rawBody?: string;
  /** Present on the blocks a `:::toc` directive expands into (see
   *  `pipeline/contents/toc.ts`): what the entry lists. The block's `type` is
   *  `'paragraph'` and its text the entry title, so it flows and maps back
   *  to the directive line like ordinary content. */
  toc?: TocBlockInfo;
  /** Present on the blocks a `:::index` directive expands into (see
   *  `pipeline/contents/indexDirective.ts`). */
  index?: IndexBlockInfo;
  /** The index marks set in this block's text, in source order. */
  indexMarks?: IndexMark[];
  /** The anchors set in this block's text (`:anchor{#id}`, `[text]{#id}`),
   *  in source order (#261). */
  anchorMarks?: AnchorMark[];
  /** For a `code` block (#624): the listing (see {@link CodeBlockInfo}). */
  code?: CodeBlockInfo;
  /** Present on `score` blocks (#1172). */
  score?: ScoreBlockInfo;
  /** The inline code spans (`` `x` ``) of a paragraph, a heading, a
   *  quotation or a list item, as source ranges of their text (between the
   *  backticks, absolute offsets into the markdown), in order: a layout
   *  with `codeStyle.inline` sets the characters mapped into them in the
   *  code face (#624). Absent when the block has none. */
  inlineCode?: Array<{ start: number; end: number }>;
  /** For `resourceBlock` blocks: the referenced `Resource.id`. */
  resourceId?: string;
  /** For a `resourceBlock` written as `:::figure{resource=…}` (#854): the
   *  fence's attributes and its `::label` lines. */
  figure?: FigureInfo;
  /** For the `containerStart` of a composed page (`containerName:
   *  'composedPage'`, #854): its fence. */
  composedPage?: ComposedPageFence;
  /** For the `containerStart` of a `:::module` inside a composed page
   *  (#1062): the module. */
  module?: ComposedModuleFence;
  /** The slot the block names (#854): where a composed page pours it.
   *  Absent when it names none (it goes to the template's flow frame).
   *  Inside a `:::module` (#1062) its `name` is `<module>.<slot>`. */
  slot?: BlockSlot;
  /** For `containerStart` / `containerEnd` marker blocks: the container
   *  name (`'callout'`, `'paragraphs'`, `'part'`). */
  containerName?: ContainerName;
  /** For `containerStart` blocks: attributes parsed from the opening fence.
   *  Always present on a start marker (empty object when the fence carries
   *  no `{…}`). */
  containerAttrs?: DirectiveAttrs;
  /** For `containerStart` blocks with attributes: the absolute source
   *  range of each attribute's value (a `:::frame{label="…"}`'s tab text
   *  maps back to it, #857). */
  containerAttrSources?: Record<string, SourceRange>;
  /** For container marker blocks: identifier shared by the matching
   *  start/end pair. Ids start at 1 and increase per parse. */
  containerId?: number;
  /** The block's base direction when the source sets one (#367): a
   *  heading's own `{dir=ltr}` / `{dir=rtl}`, or that of the `:::`
   *  container it sits in (the innermost that sets one; the container's
   *  start marker carries it too). Absent when nothing sets it: the block
   *  follows the document's `direction`. */
  direction?: 'ltr' | 'rtl';
  /** The language a `:::` container names for its blocks (`lang=en`),
   *  the innermost that names one (#401). Absent when none does: the block
   *  is in the document's language. Its ordered lists number in that
   *  language's digits. */
  lang?: string;
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

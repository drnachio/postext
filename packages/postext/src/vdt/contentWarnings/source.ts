// Content warnings about the source: unknown ids and names, unreadable
// blocks, exercises and the fences of composed pages and modules.

/** Members of `ContentWarning` (`../contentWarnings.ts`). */
export type SourceWarning =
  /** A `::resource{id}` embed, an inline `:ref{id}` or a table cell's
   *  image names a resource id no resource has: the embed is left out, the
   *  reference prints `?` (or its `text=` label) with no number or link, the
   *  cell stays text-only. `inResource` names the
   *  resource whose caption, note or cell holds the reference. */
  | { kind: 'unknownResourceId'; resourceId: string; usage: 'embed' | 'ref' | 'cellImage'; inResource?: string }
  /** An identifier (`{#id}`, `:anchor{#id}`) set more than once in the
   *  document: references reach its first setting only (#261). */
  | { kind: 'duplicateAnchor'; anchorId: string }
  /** A citation (`[@key]`) names a work no reference of the book defines
   *  (#268): it prints as written, or without that work. */
  | { kind: 'unknownCitationKey'; key: string }
  /** The text cites works but no citation engine is registered
   *  (`postext-citeproc`): citations print as written. */
  | { kind: 'citationsUnavailable' }
  /** A `:::references` block could not be read (malformed JSON or YAML, or
   *  BibTeX without an engine). */
  | { kind: 'referencesUnreadable'; message: string }
  /** The front matter block is not valid YAML (an unclosed quote, text
   *  after a quoted value): the document is set without its metadata.
   *  `message` is the parser's reason, with the line and column. */
  | { kind: 'invalidFrontmatter'; message: string }
  /** A `:::name` line whose name is neither a directive nor a container:
   *  it is set as text. */
  | { kind: 'unknownDirective'; name: string }
  /** A `::name` line that is not a well-formed embed standing alone —
   *  `::resource{id="…"}` with double quotes and no other attribute, after
   *  a blank line: it is set as text. */
  | { kind: 'malformedEmbed'; name: string }
  /** `:::paragraphs{style}` names no paragraph style: the paragraphs are set
   *  as body text. */
  | { kind: 'unknownParagraphStyle'; style: string }
  /** `:::callout{type}` names none of the configured callout styles: the box
   *  takes the first one. Not raised while `calloutStyles` is unset or
   *  empty (every type is then the built-in plain box). */
  | { kind: 'unknownCalloutType'; type: string }
  /** `:::exercise{type}` names no kind of exercise (#1225): the exercise
   *  takes the kind its content tells. */
  | { kind: 'exerciseUnknownType'; type: string }
  /** `:::exercise{style}` names no exercise style: it takes the first. Not
   *  raised while `exerciseStyles` is unset. */
  | { kind: 'exerciseUnknownStyle'; style: string }
  /** A graded exercise with nothing right to check (a choice with no
   *  ticked option, gaps with no `[[…]]`…): `exerciseKind` is its kind. */
  | { kind: 'exerciseNoAnswer'; exerciseKind: string }
  /** An item of an exercise its kind cannot read (a match item with no
   *  `->`, a sort item with no `:`…): it is set as written. */
  | { kind: 'exerciseUnreadItem'; text: string }
  /** An exercise inside another: its blocks are the outer one's. */
  | { kind: 'exerciseNested' }
  /** A word a crossword or a word search could not place: it is left out
   *  of the grid (a crossword needs a letter shared with another word). */
  | { kind: 'exerciseWordUnplaced'; word: string }
  /** A `:::solution` or `:::hint` outside an exercise: it prints nothing. */
  | { kind: 'solutionOutside' }
  /** `:::columns{flow=…}` names neither `'snake'` nor `'parallel'` (#634):
   *  the group takes the default (`'parallel'` with `breaks`, `'snake'`
   *  without). */
  | { kind: 'columnsFlowUnknown'; value: string }
  /** A composed page (`::::page{template=…}`, #854) names a template no
   *  `pageTemplates` entry has (or names none). Until templates are laid
   *  out its content is set in the flow, on pages of its own. */
  | { kind: 'templateUnknown'; template: string; fenceIndex: number }
  /** Content of a composed page names a slot (`slot="…"`,
   *  `:::frame{slot=…}`) that is no frame of the page's template: it goes
   *  to the template's flow frame (`frame`, when the template has one). */
  | { kind: 'slotUnknown'; template: string; slot: string; frame?: string; fenceIndex: number }
  /** A frame of a composed page's template receives no content: nothing
   *  names its slot, it takes no heading, and (the flow frame) no content
   *  is left without a slot. A frame marked `optional` is not reported. */
  | { kind: 'slotEmpty'; template: string; frame: string; fenceIndex: number }
  /** A grid that repeats a frame set (#1061) holds `max` items, and the
   *  page gives it more: item `item` (and every one after it) goes to the
   *  flow frame (`flowFrame`, when the template has one), or after the
   *  page. Points at the item's `slot="…"`. */
  | { kind: 'repeatOverflow'; template: string; group: string; frame: string; item: number; max: number; flowFrame?: string; fenceIndex: number }
  /** A `:::frame{slot="…" look="…"}` piece of a composed page names a look
   *  (#1089) that no `frameLooks` entry has: the frame wears its style and
   *  its template look. `suggestion`: the nearest id. Points at the
   *  `look="…"` value. */
  | { kind: 'lookUnknown'; template: string; frame: string; look: string; suggestion?: string; fenceIndex: number }
  /** A `:::module{template="…"}` of a composed page (#1062) that the page
   *  does not lay: `module` names no template (`'unknown'`), a template
   *  whose `role` is not `'module'` (`'notModule'`), or the page's template
   *  has no modules group (`'noGroup'`). Its content goes to the flow
   *  frame. Points at its `template="…"`. */
  | { kind: 'moduleUnknown'; template: string; module: string; name: string; reason: 'unknown' | 'notModule' | 'noGroup'; fenceIndex: number }
  /** A page fence names a module template (#1062): a module is laid in a
   *  page's modules group, never as a page. The fence's content is set in
   *  the flow. Points at its `template="…"`. */
  | { kind: 'moduleAsPage'; template: string; fenceIndex: number }
  /** A `:::module` inside another module (#1062): not supported; its
   *  blocks are the outer module's. Points at its `template="…"`. */
  | { kind: 'moduleNested'; template: string; module: string; fenceIndex: number }
  /** A module's `name="…"` (#1062) that another module of the page took
   *  (`'taken'`), or that holds a space, `.`, `#`, `[` or `]`
   *  (`'invalid'`): the module is named `used` (`<template>[n]`). Its
   *  slots are addressed under that name. */
  | { kind: 'moduleNameRejected'; template: string; module: string; name: string; used: string; reason: 'taken' | 'invalid'; fenceIndex: number }
  /** A three-colon `:::page` carries `template=`: a composed page needs
   *  four colons (`::::page{template=…}` … `::::`). It is read as a comic
   *  page, as before. */
  | { kind: 'pageFenceLength' };

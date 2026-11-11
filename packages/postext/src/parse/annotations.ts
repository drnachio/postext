/**
 * Chinese and Japanese inline annotations (#193, #194, #195, #421, #430):
 * emphasis dots (`:dots[…]`), the proper-name and book-title marks
 * (`:name[…]`, `:book[…]`), side lines (傍線, `:sideline[…]{style pos}`),
 * kanbun reading marks (訓点, `:kunten[字]{kaeri okuri tate}`), ruby
 * (`:ruby[…]{rt="…" mode align}` and the compact `{紅樓|hóng|lóu}`) and
 * warichu notes (`:warichu[…]{open close}`); and the directional isolates
 * (`:rtl[…]`, `:ltr[…]`, with an optional `{lang=…}`, #367), which set a
 * run in its own direction inside text of the other.
 *
 * They preserve their text, as `:smallcaps[…]` does: the characters between
 * the brackets stay in the paragraph's plain text (search, the contents,
 * index anchors and the source map see them), and the mark becomes a field
 * of the spans that hold them. {@link markAnnotations} replaces each
 * directive by private-use marks around its content, before the emphasis
 * scanners run, and queues its attributes (so `*` or `_` inside a reading
 * never reach them); {@link applyAnnotationMarks} turns the marks into span
 * fields once the spans exist. The content may hold other inline marks,
 * nested annotations included (`:warichu[甲戌側批：:name[寶玉]…]`).
 */



export { ANNOTATION_NAMES, closingBracket, markAnnotations, stripAnnotations, hasAnnotationMarks } from './annotations/scan.js';
export type { AnnotationName, QueuedAnnotation, FoundAnnotation } from './annotations/scan.js';
export { applyAnnotationMarks, annotationFields } from './annotations/apply.js';
export { annotationSourceSkips, findAnnotations, withBookBrackets } from './annotations/source.js';
export type { BracketPair } from './annotations/source.js';

// Option types of the body text (emphasis, tashkil, composition rules,
// paragraph containers) and the blockquote config (#1278: split out of
// bodyText.ts).
import type { ColorValue, Dimension } from '../../page.js';

/** How `*…*` is set (`BodyTextConfig.emphasis`):
 *  - `'italic'`: in the italic face, as postext always did;
 *  - `'bold'`: in the bold face and `boldColor`, as `**…**` is (bold
 *    and italic together stay bold);
 *  - `'color'`: upright, in `italicColor`;
 *  - `'overline'`: upright, in `italicColor`, with a rule over the words
 *    (the Arabic khaṭṭ fawqī).
 *  It applies to the body text and to what is set in its faces: lists,
 *  blockquotes, paragraph styles, callout bodies, notes and headings.
 *  Captions, table cells, the contents and the index keep their own
 *  italic settings. */
export type EmphasisStyle = 'italic' | 'bold' | 'color' | 'overline';

/** What becomes of the Arabic vowel marks of the text
 *  (`BodyTextConfig.tashkil`), for an edition without them made from a
 *  vocalised source:
 *  - `'keep'`: set as written;
 *  - `'strip'`: every vowel and Qurʾānic mark is dropped: fatḥa, ḍamma,
 *    kasra, their tanwīn, sukūn, shadda, the superscript (dagger) alef
 *    U+0670 (هٰذا is set هذا) and the other marks U+0656–U+065F, and the
 *    Qurʾānic annotation signs U+06D6–U+06ED;
 *  - `'strip-vowels'`: as `'strip'`, but the shadda stays, as most modern
 *    books print it.
 *  Hamza and madda are kept in both: أ إ آ ؤ ئ are letters, also when
 *  written with the combining U+0653–U+0655. The marks leave the text the
 *  layout sets (body, headings, notes, the contents); the source keeps
 *  them, and every character set still maps to its place in it. */
export type TashkilMode = 'keep' | 'strip' | 'strip-vowels';

/** The room kept for a list under the colon line that introduces it
 *  (`BodyTextConfig.colonListRoom`). */
export type ColonListRoom = 'item' | 'line';

/** How far a composition rule goes (`BodyTextConfig.shortListSplit`,
 *  `LayoutConfig.openerFloats`, #749): `'allow'` leaves the rule off (the
 *  layout is not changed and nothing is reported), `'warn'` leaves the
 *  layout as it is and reports each case in
 *  `VDTDocument.contentWarnings`, `'avoid'` applies the rule. */
export type CompositionRule = 'allow' | 'warn' | 'avoid';

/** How the space under a `:::paragraphs` container is worked out
 *  (`BodyTextConfig.paragraphContainerSpacing`). */
export type ParagraphContainerSpacing = 'collapse' | 'add';

/** What a paragraph style's unset type fields inherit inside a box
 *  (`BodyTextConfig.paragraphStylesInBoxes`, #1119). */
export type ParagraphStylesInBoxes = 'box' | 'document';

/** The type fields a paragraph style inherits from the body text when it
 *  leaves them unset (`ResolvedParagraphStyleConfig.inheritsBody`). */
export type ParagraphBodyField = 'fontFamily' | 'fontSize' | 'lineHeight' | 'fontWeight' | 'boldFontWeight' | 'color';

/** How Markdown blockquotes (`> …`) are set (`BodyTextConfig.blockquote`).
 *  They take the body's family, size, leading, weights, alignment and
 *  hyphenation. */
export interface BlockquoteConfig {
  /** Text colour. Default `#666666`. A colour linked to a palette entry
   *  (`paletteId`) follows that entry, as everywhere. */
  color?: ColorValue;
  /** Set the text in italics; a `*…*` run inside turns back to upright.
   *  Default `true`. */
  italic?: boolean;
  /** Indent of every line from the left edge of the column or box, the
   *  first-line indent counted from it. `em` is the body's size. Default
   *  `0`. */
  indent?: Dimension;
  /** Indent of the first line of each quoted paragraph, from {@link indent}
   *  (with the body's `hangingIndent`, of every line but the first). Unset:
   *  the body's `firstLineIndent`. */
  firstLineIndent?: Dimension;
}

export interface ResolvedBlockquoteConfig {
  color: ColorValue;
  italic: boolean;
  indent: Dimension;
  /** Unset: the body's `firstLineIndent`. */
  firstLineIndent?: Dimension;
}

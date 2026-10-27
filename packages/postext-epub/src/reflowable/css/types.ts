// The options of a reflowable book's stylesheet, its rules and the
// stylesheet itself (#1276: split out of css.ts).


/** What the walk found that decides the writing mode of the book. */
export interface StylesheetOptions {
  /** Vertical Chinese / Japanese (`layout.writingMode: 'vertical-rl'`). */
  vertical: boolean;
  /** The book sets a `:::verse` poem (its rules are written only then). */
  verse?: boolean;
  /** The book sets a poem line by line (#620): the stanza rules. */
  stanzas?: boolean;
  /** Lines of verse carry their numbers (#621): the margin they stand in. */
  lineNumbers?: boolean;
  /** A line holds a tab at its stop (#622): the tab rows. */
  tabs?: boolean;
  /** The book sets a code listing (#624): the listing's box and lines. */
  code?: boolean;
  /** The drop caps the paragraphs open with (#623), as `lines-sink`. */
  dropCaps?: readonly string[];
  /** A figure or a box text wraps round (#627): the float rules. */
  wraps?: boolean;
  /** A picture carries its labels drawn over it (#955): the box and the
   *  layer they are drawn in. */
  labelLayers?: boolean;
  /** Classes of emphasis marks the text uses beyond `pt-dots` (the
   *  filled dot on the default side): their rules are written only then
   *  (`inline.ts` `dotsClasses`, #428). */
  dots?: readonly string[];
  /** The book sets composed pages (#862): the frame rules, and the
   *  callout styles their frames are set in (their boxes are styled on a
   *  frame's block too). */
  composed?: { frameStyles: readonly string[] };
}

/** A rule of the stylesheet: its selector and declarations
 *  (`property: value`). */
export interface CssRule {
  selector: string;
  decls: string[];
}

/** The book's stylesheet: its text, the families it names, and its rules
 *  (at-rules aside), which {@link stylesheetOverrides} compares. */
export interface Stylesheet {
  css: string;
  families: Set<string>;
  rules: CssRule[];
}

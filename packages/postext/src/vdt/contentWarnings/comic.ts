// Content warnings of comic pages: splits, panels, art and balloons.

/** Members of `ContentWarning` (`../contentWarnings.ts`). */
export type ComicWarning =
  /** A comic page's `split` attribute the grammar cannot read whole (a
   *  stray character, an unclosed `[`, `/` and `|` mixed in one list, a
   *  bracketed list on its parent's axis): the readable part is used, an
   *  unreadable value is one panel. `message` says what is wrong. */
  | { kind: 'comicSplitSyntax'; message: string }
  /** The sizes of a list of a comic page's `split` add up past 100 %: they
   *  are scaled down (a `*` keeps 5 %). */
  | { kind: 'comicSplitOverflow'; total: number }
  /** A comic page has more panels than its split has cells (`panels` >
   *  `cells`: the extra panels are not set) or fewer (the extra cells are
   *  empty panels). */
  | { kind: 'comicPanelCount'; panels: number; cells: number }
  /** Text in a comic page before its first `::panel` line, or a line of a
   *  panel that is not a script line (`key: text`): it is lettered as a
   *  caption of the panel (the first one, for text before it). */
  | { kind: 'comicStrayText'; text: string }
  /** A script line names a balloon style no style defines
   *  (`ben{wisper}: …`): it takes the default style of its key. */
  | { kind: 'comicUnknownBalloonStyle'; style: string }
  /** A panel's `art` or `pop` names no picture resource (an unknown id, or
   *  a resource that is not a bitmap or an SVG): the panel is set empty. */
  | { kind: 'comicUnknownArt'; resourceId: string }
  /** A panel's cell cannot hold the picture's safe area under a cover
   *  crop: the picture is shown with its safe area whole and the bands
   *  left in the panel background. Found by the layout. */
  | { kind: 'comicPanelLetterbox'; resourceId: string; panel: number }
  /** A picture's anchor (a speaker's mouth) lies outside its safe area: a
   *  crop may cut it off, and the tail then points off the panel. An
   *  authoring hint. Points at the panel's `art`. */
  | { kind: 'comicAnchorOutsideSafeArea'; resourceId: string; anchorId: string }
  /** A balloon of a comic panel could not be placed cleanly (#561): it
   *  still covers a speaker's face, another balloon, an avoid zone or a
   *  mouth, or runs outside its panel, after every fallback (`fallbacks`:
   *  crossing the border, covering avoid zones, reshaping the text). The
   *  lettering never shrinks; a shorter line, a bigger panel or an `at=`
   *  pin fixes it. Found by the layout; points at the script line. */
  | { kind: 'comicBalloonOverflow'; panel: number; reasons: ('face' | 'balloon' | 'outside' | 'avoid' | 'anchor')[]; fallbacks: ('breakBorder' | 'coverAvoid' | 'reshape')[] }
  /** A speaker id that no picture of its comic page marks with an anchor
   *  and no `comics.cast` entry names (a slip in the id, most often): its
   *  tails point off the panel. Only raised on pages whose pictures mark
   *  anchors. Informational. Points at the first line of that speaker. */
  | { kind: 'comicUnknownSpeaker'; speaker: string }
  /** A comic panel's frame (#885) cannot do what the panel asks. `reason`:
   *  `'unknownBox'`, its `box` names no callout style (`style`): the panel
   *  keeps its panel style; `'textOverflow'`, a text panel's Markdown does
   *  not fit its frame (`overflowMm` did not): the rest is clipped;
   *  `'strip'`, `'spread'`, `'flow'`, a text panel on a strip, on a
   *  spread, or in a document whose flow is vertical or right to left: its
   *  Markdown is set in the flow after the comic. `panel`: the panel's
   *  place in the page's source (0-based). Points at the panel. */
  | { kind: 'comicPanelFrame'; reason: 'unknownBox' | 'textOverflow' | 'strip' | 'spread' | 'flow'; panel: number; style?: string; overflowMm?: number };

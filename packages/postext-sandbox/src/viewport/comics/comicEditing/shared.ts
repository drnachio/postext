// The comic tools' state shared by every viewer surface: the splitter
// focus to give back after a redraw and the count behind the hint ids
// (#1276: split out of comicEditing.ts).

export const shared = {
  /** The splitter a commit from the keyboard came from: its handle takes the
   *  focus back once the pages are drawn again. */
  refocus: null as { key: string; until: number } | null,
  /** Ids of the keyboard hints, one per viewer surface. */
  hintCount: 0,
};

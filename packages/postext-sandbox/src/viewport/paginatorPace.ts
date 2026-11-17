/** What the background paginator builds next: the pending chapter with
 *  what it inherits (`key`) and its text. */
export interface PaginatorTrigger {
  key: string;
  markdown: string;
}

/** Whether a change of trigger is the paginator's own doing (#1617): the
 *  build of `landedKey` just recorded its chapter, and the pending chapter
 *  moved on from it. Such a change is built at once; any other one (the
 *  reader typing, a control being dragged) waits for the reader to stop.
 *  A book of 68 chapters spent 25 of its 36 s waiting between chapters. */
export function followsLanding(landedKey: string | null, from: PaginatorTrigger | null, to: PaginatorTrigger | null): boolean {
  return landedKey !== null && from?.key === landedKey && to?.key !== landedKey;
}

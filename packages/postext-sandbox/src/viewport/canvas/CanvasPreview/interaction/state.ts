// The running state of the page interaction its modules share (#1276).

/** The bindings the page interaction reassigns and more than one of its
 *  modules reads or writes: fields of one object. */
export interface PageInteractionState {
  offsetChapter: number | undefined;
}

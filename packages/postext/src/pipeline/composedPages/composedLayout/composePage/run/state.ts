// The running state of a page's run its modules share (#1276).

/** The bindings a page's run reassigns and more than one of its modules
 *  reads or writes: fields of one object. */
export interface RunState {
  clipFoot: number | undefined;
  stretchTo: { at: number; foot: number; names: ReadonlySet<string> } | undefined;
}

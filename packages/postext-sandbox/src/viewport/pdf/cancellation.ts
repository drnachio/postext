/** Whether a render failed because its worker was disposed or its build
 *  aborted (the tab left, the viewer closed, a newer render started):
 *  a cancellation, not an error to show (#1434). Workers reject pending
 *  work with a `DOMException` named `AbortError`. */
export function isCancellation(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === 'AbortError';
}

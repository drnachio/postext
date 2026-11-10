// Links between the files of the book: a file's href seen from another's.

/** `to` (relative to the package document) seen from `from`'s folder. */
export function relativeHref(from: string, to: string): string {
  const a = from.split('/').slice(0, -1);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

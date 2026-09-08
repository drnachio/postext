import type { DirectiveAttrs } from './types';

/** Parse the attribute blob inside a `:::name{ ... }` directive, a
 *  `:::container{ ... }` fence or an inline `:ref{ ... }`.
 *  Supports `key="quoted"`, `key='quoted'`, `key=bare`, and bare `key`.
 *  Attributes may appear in any order; a repeated key keeps the last value.
 *
 *  Lives in its own module so the block parser and the inline-formatting
 *  pre-pass can share it without a circular import. */
export function parseDirectiveAttrs(raw: string): DirectiveAttrs {
  const out: DirectiveAttrs = {};
  // Token forms: key="..." | key='...' | key=bare | bare
  const tokenRe = /([A-Za-z_][A-Za-z0-9_-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(raw)) !== null) {
    const key = m[1]!;
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    out[key] = value;
  }
  return out;
}

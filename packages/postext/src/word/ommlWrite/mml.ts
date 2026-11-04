// The slice of MathJax's internal MathML tree (MmlNode) the OMML writer
// reads. Typed structurally, not imported: the engine's MathJax lives in one
// pre-bundled module (src/math/mathjax.ts) and its classes must not be
// imported again from here, so nodes are told apart by `kind`, never by
// `instanceof`.

export interface MmlNode {
  /** `mi`, `mrow`, `mfrac`, `TeXAtom`, `text` (a text leaf) … */
  readonly kind: string;
  readonly childNodes: (MmlNode | null)[];
  readonly isInferred?: boolean;
  /** TeX spacing class (see TEXCLASS). */
  readonly texClass?: number;
  readonly attributes?: {
    getExplicit(name: string): unknown;
    get(name: string): unknown;
  };
  getText?(): string;
  getProperty?(name: string): unknown;
}

/** MathJax's TEXCLASS values. */
export const TEXCLASS = { ORD: 0, OP: 1, BIN: 2, REL: 3, OPEN: 4, CLOSE: 5, PUNCT: 6, INNER: 7, VCENTER: 8, NONE: -1 } as const;

/** Raised for a construct the writer cannot express: the caller falls back
 *  to a picture of the equation. */
export class UnsupportedMath extends Error {}

export const unsupported = (what: string): never => {
  throw new UnsupportedMath(what);
};

/** Child nodes, nulls dropped. */
export function kids(node: MmlNode): MmlNode[] {
  return node.childNodes.filter((c): c is MmlNode => c !== null && c !== undefined);
}

/** The argument at `i` of a fixed-arity node (msub, mfrac …), or null. */
export function argAt(node: MmlNode, i: number): MmlNode | null {
  return node.childNodes[i] ?? null;
}

/** The text of a token node (mi, mn, mo, mtext, ms). */
export function tokenText(node: MmlNode): string {
  if (typeof node.getText === 'function') return node.getText();
  let out = '';
  for (const c of kids(node)) out += c.kind === 'text' ? (c.getText?.() ?? '') : tokenText(c);
  return out;
}

/** An attribute set on the node itself (not inherited), as a string. */
export function explicitAttr(node: MmlNode, name: string): string | undefined {
  const v = node.attributes?.getExplicit(name);
  return v === undefined || v === null ? undefined : String(v);
}

export const isToken = (node: MmlNode): boolean =>
  node.kind === 'mi' || node.kind === 'mn' || node.kind === 'mo' || node.kind === 'mtext' || node.kind === 'ms';

/** A node that only groups its children: rows, TeX atoms, style and padding
 *  wrappers. Their children join the surrounding row. */
export function isGrouping(node: MmlNode): boolean {
  switch (node.kind) {
    case 'mrow':
    case 'inferredMrow':
    case 'TeXAtom':
    case 'mstyle':
    case 'mpadded':
    case 'semantics':
    case 'math':
      return true;
    default:
      return false;
  }
}

/** The single node a grouping wrapper reduces to (`{x}` → x), or the node. */
export function unwrap(node: MmlNode): MmlNode {
  let n = node;
  for (;;) {
    if (!isGrouping(n) || n.kind === 'semantics') return n;
    const c = kids(n);
    if (c.length !== 1) return n;
    n = c[0]!;
  }
}

/** The text of `node` when it is (or wraps) a single `mo`, else undefined. */
export function moText(node: MmlNode | null): string | undefined {
  if (!node) return undefined;
  const n = unwrap(node);
  return n.kind === 'mo' ? tokenText(n) : undefined;
}

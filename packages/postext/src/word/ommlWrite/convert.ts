// MathML (MathJax's internal tree) → Office Math (OMML). One function per
// MathML layout element; rows are read as a list so fences, n-ary operators
// and function names can take in the items that follow them (./rows.ts).

import { escapeAttr } from '../xml.js';
import {
  argAt, explicitAttr, kids, moText, tokenText, unsupported, unwrap, TEXCLASS, type MmlNode,
} from './mml.js';
import { spaceRun, tokenRun, type RunOptions } from './runs.js';
import { convertRow, isNaryChar } from './rows.js';
import { convertTable } from './tables.js';

const val = (name: string, v: string): string => `<m:${name} m:val="${escapeAttr(v)}"/>`;
export const wrap = (name: string, inner: string): string => `<m:${name}>${inner}</m:${name}>`;

/** Over-characters MathJax sets for TeX accents → the combining mark Word's
 *  `m:acc` takes. */
const ACCENTS: Record<string, string> = {
  '^': '̂', 'ˆ': '̂', '̂': '̂',
  '~': '̃', '˜': '̃', '̃': '̃',
  '→': '⃗', '⃗': '⃗',
  '¯': '̄', 'ˉ': '̄', '̄': '̄',
  '˙': '̇', '̇': '̇',
  '¨': '̈', '̈': '̈',
  '´': '́', 'ˊ': '́', '́': '́',
  '`': '̀', 'ˋ': '̀', '̀': '̀',
  '˘': '̆', '̆': '̆',
  'ˇ': '̌', '̌': '̌',
  '˚': '̊', '̊': '̊',
  '←': '⃖', '↔': '⃡',
};

/** Rules over / under (`\overline`, `\underline`). */
const BARS = new Set(['―', '‾', '_', '̲', '─']);

/** Braces and brackets over / under (`\overbrace` …) → `m:groupChr`. */
const GROUP_CHARS = new Set(['⏞', '⏟', '⎴', '⎵', '⏜', '⏝', '←', '→', '↔']);

/** An argument slot (`m:e`, `m:num` …) holding `node`. */
export function slot(name: string, node: MmlNode | null, opts: RunOptions): string {
  return wrap(name, node ? convertRow(rowOf(node), opts) : '');
}

/** The nodes a slot holds: a grouping node's children, or the node. */
export function rowOf(node: MmlNode): MmlNode[] {
  // `\left…\right` stays one item, for the row to read as a delimiter.
  if (node.texClass === TEXCLASS.INNER && (node.kind === 'mrow' || node.kind === 'TeXAtom')) return [node];
  // A style switch (`\displaystyle`) stays one item: its rows are read in
  // that style.
  if (node.kind === 'mstyle') return explicitAttr(node, 'displaystyle') === undefined ? kids(node) : [node];
  // A box that zeroes a dimension (`\vphantom`, `\smash`, `\rlap`) stays
  // one item: it becomes an `m:phant`.
  if (node.kind === 'mpadded') return paddedFlags(node) ? [node] : kids(node);
  if (node.kind === 'mrow' || node.kind === 'inferredMrow' || node.kind === 'math') return kids(node);
  if (node.kind === 'TeXAtom') return kids(node);
  return [node];
}

/** Options for a script, limit, numerator or denominator: text style. */
export const small = (opts: RunOptions): RunOptions => (opts.display === false ? opts : { ...opts, display: false });

/** One MathML node as OMML (a row-level item: rows themselves are read by
 *  convertRow, which calls this for everything it does not take apart). */
export function convertNode(node: MmlNode, opts: RunOptions): string {
  switch (node.kind) {
    case 'mtext':
      // An undefined macro, which MathJax sets as its name in red.
      if (explicitAttr(node, 'mathcolor') !== undefined && tokenText(node).startsWith('\\')) unsupported('undefined macro');
      return tokenRun(node, opts);
    case 'mi':
    case 'mn':
    case 'mo':
    case 'ms':
      return tokenRun(node, opts);
    case 'mspace':
      return spaceRun(node, opts);
    case 'mstyle': {
      const ds = explicitAttr(node, 'displaystyle');
      return convertRow(kids(node), ds === undefined ? opts : { ...opts, display: ds === 'true' });
    }
    case 'mpadded':
      return convertPadded(node, opts);
    case 'mrow':
    case 'inferredMrow':
    case 'TeXAtom':
    case 'math':
      return convertRow(kids(node), opts);
    case 'semantics': {
      const first = kids(node)[0];
      return first ? convertNode(first, opts) : '';
    }
    case 'mfrac':
      return convertFrac(node, opts);
    case 'msqrt':
      return wrap('rad', `<m:radPr>${val('degHide', '1')}</m:radPr><m:deg/>${wrap('e', convertRow(kids(node).flatMap(rowOf), opts))}`);
    case 'mroot':
      return wrap('rad', `${slot('deg', argAt(node, 1), small(opts))}${slot('e', argAt(node, 0), opts)}`);
    case 'msub':
    case 'msup':
    case 'msubsup':
      return convertScripts(node, opts);
    case 'munder':
    case 'mover':
    case 'munderover':
      return convertUnderOver(node, opts);
    case 'mtable':
      return convertTable(node, opts);
    case 'menclose':
      return convertEnclose(node, opts);
    case 'mphantom':
      return wrap('phant', `<m:phantPr>${val('show', '0')}</m:phantPr>${wrap('e', convertRow(kids(node).flatMap(rowOf), opts))}`);
    case 'mmultiscripts':
      return convertMultiscripts(node, opts);
    case 'none':
      return '';
    case 'mfenced':
      return unsupported('mfenced');
    case 'merror':
      return unsupported('merror');
    case 'text':
      return '';
    default:
      return unsupported(node.kind);
  }
}

function convertFrac(node: MmlNode, opts: RunOptions): string {
  const thickness = explicitAttr(node, 'linethickness');
  const noBar = thickness !== undefined && /^0(\.0*)?([a-z]+)?$/.test(thickness.trim());
  const bevelled = explicitAttr(node, 'bevelled') === 'true';
  const type = noBar ? 'noBar' : bevelled ? 'skw' : opts.linearFractions ? 'lin' : undefined;
  const pr = type ? `<m:fPr>${val('type', type)}</m:fPr>` : '';
  return wrap('f', `${pr}${slot('num', argAt(node, 0), small(opts))}${slot('den', argAt(node, 1), small(opts))}`);
}

/** msub / msup / msubsup. An n-ary base is taken by the row (rows.ts). */
function convertScripts(node: MmlNode, opts: RunOptions): string {
  const base = argAt(node, 0);
  if (node.kind === 'msub') return wrap('sSub', `${slot('e', base, opts)}${slot('sub', argAt(node, 1), small(opts))}`);
  if (node.kind === 'msup') return wrap('sSup', `${slot('e', base, opts)}${slot('sup', argAt(node, 1), small(opts))}`);
  return wrap('sSubSup', `${slot('e', base, opts)}${slot('sub', argAt(node, 1), small(opts))}${slot('sup', argAt(node, 2), small(opts))}`);
}

/** The accent character of an `mover` / `munder` script, if it is one. */
function accentOf(script: MmlNode | null): string | undefined {
  const t = moText(script);
  return t !== undefined ? ACCENTS[t] : undefined;
}

/** munder / mover / munderover: accents, bars, braces, then limits. */
function convertUnderOver(node: MmlNode, opts: RunOptions): string {
  const base = argAt(node, 0);
  if (node.kind === 'mover' || node.kind === 'munder') {
    const script = argAt(node, 1);
    const t = moText(script);
    const top = node.kind === 'mover';
    if (t !== undefined && BARS.has(t)) {
      return wrap('bar', `<m:barPr>${val('pos', top ? 'top' : 'bot')}</m:barPr>${slot('e', base, opts)}`);
    }
    if (t !== undefined && GROUP_CHARS.has(t) && !(top && ACCENTS[t])) {
      return wrap('groupChr', `<m:groupChrPr>${val('chr', t)}${val('pos', top ? 'top' : 'bot')}${val('vertJc', top ? 'bot' : 'top')}</m:groupChrPr>${slot('e', base, opts)}`);
    }
    const acc = top ? accentOf(script) : undefined;
    if (acc !== undefined) {
      return wrap('acc', `<m:accPr>${val('chr', acc)}</m:accPr>${slot('e', base, opts)}`);
    }
    return wrap(top ? 'limUpp' : 'limLow', `${slot('e', base, opts)}${slot('lim', script, small(opts))}`);
  }
  // munderover: the lower limit inside, the upper one around it.
  const low = wrap('limLow', `${slot('e', base, opts)}${slot('lim', argAt(node, 1), small(opts))}`);
  return wrap('limUpp', `${wrap('e', low)}${slot('lim', argAt(node, 2), small(opts))}`);
}

function convertEnclose(node: MmlNode, opts: RunOptions): string {
  const notation = (explicitAttr(node, 'notation') ?? 'longdiv').split(/\s+/).filter(Boolean);
  const box = notation.includes('box') || notation.includes('roundedbox')
    || (['top', 'bottom', 'left', 'right'].every((n) => notation.includes(n)));
  const strikes: string[] = [];
  if (notation.includes('horizontalstrike')) strikes.push(val('strikeH', '1'));
  if (notation.includes('verticalstrike')) strikes.push(val('strikeV', '1'));
  // `\cancelto`'s arrow is drawn as the up-diagonal strike.
  if (['updiagonalstrike', 'updiagonalarrow', 'northeastarrow'].some((n) => notation.includes(n))) strikes.push(val('strikeBLTR', '1'));
  if (notation.includes('downdiagonalstrike')) strikes.push(val('strikeTLBR', '1'));
  const known = new Set(['box', 'roundedbox', 'top', 'bottom', 'left', 'right', 'horizontalstrike', 'verticalstrike', 'updiagonalstrike', 'downdiagonalstrike', 'updiagonalarrow', 'northeastarrow']);
  if (notation.some((n) => !known.has(n))) unsupported(`menclose ${notation.join(' ')}`);
  let hide = '';
  if (!box) {
    // Only the sides named are drawn.
    if (!notation.includes('top')) hide += val('hideTop', '1');
    if (!notation.includes('bottom')) hide += val('hideBot', '1');
    if (!notation.includes('left')) hide += val('hideLeft', '1');
    if (!notation.includes('right')) hide += val('hideRight', '1');
  }
  const pr = hide || strikes.length ? `<m:borderBoxPr>${hide}${strikes.join('')}</m:borderBoxPr>` : '';
  return wrap('borderBox', `${pr}${wrap('e', convertRow(kids(node).flatMap(rowOf), opts))}`);
}

const isZero = (v: string | undefined): boolean => v !== undefined && /^\+?0*(\.0*)?([a-z]+)?$/.test(v.trim()) && /0/.test(v);

/** The `m:phantPr` switches for an `mpadded` that zeroes its width, height
 *  or depth (`\vphantom`, `\hphantom`, `\smash`, `\rlap`), or ''. */
function paddedFlags(node: MmlNode): string {
  let flags = '';
  if (isZero(explicitAttr(node, 'width'))) flags += val('zeroWid', '1');
  if (isZero(explicitAttr(node, 'height'))) flags += val('zeroAsc', '1');
  if (isZero(explicitAttr(node, 'depth'))) flags += val('zeroDesc', '1');
  return flags;
}

/** mpadded: a pass-through, or an `m:phant` for the zeroed dimensions. A
 *  phantom inside it (`\vphantom`) is folded into the same `m:phant`. */
function convertPadded(node: MmlNode, opts: RunOptions): string {
  const flags = paddedFlags(node);
  const row = kids(node).flatMap(rowOf);
  if (!flags) return convertRow(row, opts);
  const phantom = row.length === 1 && row[0]!.kind === 'mphantom' ? row[0]! : undefined;
  const content = phantom ? kids(phantom).flatMap(rowOf) : row;
  const show = phantom ? val('show', '0') : '';
  return wrap('phant', `<m:phantPr>${show}${flags}</m:phantPr>${wrap('e', convertRow(content, opts))}`);
}

/** mmultiscripts (`\prescript`, `\sideset`): `m:sPre` around the base and
 *  its scripts. One script pair on each side at most. */
function convertMultiscripts(node: MmlNode, opts: RunOptions): string {
  const k = kids(node);
  const at = k.findIndex((n) => n.kind === 'mprescripts');
  const post = at < 0 ? k.slice(1) : k.slice(1, at);
  const pre = at < 0 ? [] : k.slice(at + 1);
  if (post.length > 2 || pre.length > 2 || post.length % 2 || pre.length % 2) unsupported('mmultiscripts');
  const script = (n: MmlNode | undefined): MmlNode | null => (n && n.kind !== 'none' ? n : null);
  const s = small(opts);
  let inner = k[0] ? convertRow(rowOf(k[0]), opts) : '';
  const [sub, sup] = [script(post[0]), script(post[1])];
  if (sub && sup) inner = wrap('sSubSup', `${wrap('e', inner)}${slot('sub', sub, s)}${slot('sup', sup, s)}`);
  else if (sub) inner = wrap('sSub', `${wrap('e', inner)}${slot('sub', sub, s)}`);
  else if (sup) inner = wrap('sSup', `${wrap('e', inner)}${slot('sup', sup, s)}`);
  const [psub, psup] = [script(pre[0]), script(pre[1])];
  if (!psub && !psup) return inner;
  return wrap('sPre', `${slot('sub', psub, s)}${slot('sup', psup, s)}${wrap('e', inner)}`);
}

/** The n-ary character of a scripted base or bare operator, if any. */
export function naryBase(node: MmlNode): { chr: string; base: MmlNode } | undefined {
  const n = unwrap(node);
  if (n.kind === 'mo') {
    const t = tokenText(n);
    return isNaryChar(t) ? { chr: t, base: n } : undefined;
  }
  if (['msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover'].includes(n.kind)) {
    const b = argAt(n, 0);
    const t = moText(b);
    if (t !== undefined && isNaryChar(t)) return { chr: t, base: n };
  }
  return undefined;
}

/** `m:nary` for an n-ary operator (bare or scripted) over `body`. */
export function convertNary(node: MmlNode, chr: string, body: string, opts: RunOptions): string {
  let sub: MmlNode | null = null;
  let sup: MmlNode | null = null;
  let under = false;
  switch (node.kind) {
    case 'msub': sub = argAt(node, 1); break;
    case 'msup': sup = argAt(node, 1); break;
    case 'msubsup': sub = argAt(node, 1); sup = argAt(node, 2); break;
    case 'munder': sub = argAt(node, 1); under = true; break;
    case 'mover': sup = argAt(node, 1); under = true; break;
    case 'munderover': sub = argAt(node, 1); sup = argAt(node, 2); under = true; break;
    default: under = !isIntegral(chr);
  }
  // In text style a sum's limits move beside it, unless `\limits` says
  // otherwise.
  if (under && opts.display === false && node.kind !== 'mo') {
    const mo = unwrap(argAt(node, 0)!);
    // The operator dictionary's value: true for ∑, false for ∫ and after
    // `\limits`.
    const movable = mo.attributes?.get('movablelimits');
    if (movable === true || movable === 'true') under = false;
  }
  let pr = val('chr', chr) + val('limLoc', under ? 'undOvr' : 'subSup');
  if (!sub) pr += val('subHide', '1');
  if (!sup) pr += val('supHide', '1');
  return wrap('nary', `<m:naryPr>${pr}</m:naryPr>${slot('sub', sub, small(opts))}${slot('sup', sup, small(opts))}${wrap('e', body)}`);
}

const isIntegral = (chr: string): boolean => /[∫-∳⨋-⨜]/.test(chr);

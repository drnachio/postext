// The units of a paragraph built from its spans, notes included
// (#1276: split out of cjkCompose.ts).
import type { InlineSpan, InlineWarichu } from '../../../parse/index.js';
import { getMeasureLanguage, setMeasureLanguage, measureTextWidth } from '../../canvas.js';
import { spanShapingLanguage } from '../../spanLanguage.js';
import { setsObject, refLabelTokens, atomicSpanToken, textWidth, URL_LIKE_RE, stackedScriptPairs, scriptMetrics, pickSpanFont } from '../../rich.js';
import { cjkClassOf, isCjkGrapheme } from '../cjkClasses.js';
import { graphemesOf, graphemeCount } from '../../graphemes.js';
import { isBreakingSpace } from '../../spaces.js';
import { fontEm, cellAdvance, verticalTrackCount, getMeasureRegion } from '../../vertical.js';
import { withFontSize } from '../cjkAnnotate.js';
import { type MarkRouting, emOfFont, combineMarkPairs, routeSharedMarks } from './prepareUnits.js';
import { rubyBaseUnit, attachKunten } from './ruby.js';
import { type Fonts, type Unit, type UnitStyle, orientedUnits, styleOf, numberCellEdges, isCjkHere, pairable } from './units.js';

/** The units of a paragraph's spans, the characters of each warichu note
 *  (#195) measured at the note's size and flagged with it, between the
 *  note's brackets (added text at the body size, in the note's colour). */
export function buildAllUnits(spans: readonly InlineSpan[], fonts: Fonts, letterSpacingPx: number, vertical: boolean, route: MarkRouting): Unit[] {
  if (!spans.some((s) => s.warichu)) return buildUnits(spans, fonts, letterSpacingPx, vertical, route);
  const out: Unit[] = [];
  let i = 0;
  while (i < spans.length) {
    const note = spans[i]!.warichu;
    let j = i + 1;
    while (j < spans.length && spans[j]!.warichu === note) j++;
    const group = spans.slice(i, j);
    if (!note) out.push(...buildUnits(group, fonts, letterSpacingPx, vertical, route));
    else out.push(...noteUnits(group, note, fonts, vertical));
    i = j;
  }
  return out;
}

/** The units of one warichu note: its characters at the note's size (a
 *  word space inside it is a character of the note), its brackets. */
function noteUnits(spans: readonly InlineSpan[], note: InlineWarichu, fonts: Fonts, vertical: boolean): Unit[] {
  const size = note.fontString ? fontEm(note.fontString) : emOfFont(fonts.normal) / 2;
  const noteFonts: Fonts = {
    normal: withFontSize(fonts.normal, size),
    bold: withFontSize(fonts.bold, size),
    italic: withFontSize(fonts.italic, size),
    boldItalic: withFontSize(fonts.boldItalic, size),
  };
  const inner = buildUnits(spans, noteFonts, 0, vertical, false);
  for (const u of inner) {
    u.note = note;
    if (u.kind === 'space') {
      u.kind = 'text';
      u.firstCjk = u.lastCjk = false;
      u.noteSpace = true;
    }
  }
  const bracket = (text: string): Unit => {
    const g = graphemesOf(text);
    const cls = cjkClassOf(g[0] ?? '');
    const style: UnitStyle = {
      key: `ins|${note.color ?? ''}|${fonts.normal}`,
      bold: false,
      italic: false,
      font: fonts.normal,
      inserted: true,
      ...(note.color ? { color: note.color } : {}),
    };
    let width = 0;
    for (const c of g) width += cellAdvance(c, fonts.normal, vertical, cjkClassOf(c));
    return {
      kind: 'text',
      text,
      width,
      graphemes: g.length,
      first: cls,
      last: cjkClassOf(g[g.length - 1] ?? ''),
      firstCjk: isCjkGrapheme(g[0] ?? ''),
      lastCjk: isCjkGrapheme(g[g.length - 1] ?? ''),
      style,
      at: 0,
    };
  };
  return [...(note.open ? [bracket(note.open)] : []), ...inner, ...(note.close ? [bracket(note.close)] : [])];
}

/**
 * The units of a paragraph's spans, in order. `letterSpacingPx` (the
 * block's tracking) is measured into every width, per grapheme. In
 * `vertical` text a CJK character advances by its cell (`cellAdvance`).
 */
export function buildUnits(spans: readonly InlineSpan[], fonts: Fonts, letterSpacingPx: number, vertical = false, route: MarkRouting = false): Unit[] {
  const units: Unit[] = [];
  const track = (n: number): number => (letterSpacingPx === 0 ? 0 : letterSpacingPx * n);
  let zwsp = false;
  // A word joiner (U+2060) before the next unit: no break there, in one
  // span or across two (`**①**⁠文`). It takes no room and is left out.
  let wj = false;
  const glue = (): { glueBefore?: true } => {
    const g = wj;
    wj = false;
    return g ? { glueBefore: true } : {};
  };
  // Which units open a span and hold all of it (the candidates for stacked
  // scripts), by index.
  const wholeSpan = new Set<number>();
  // Where each span's units start, for the kanbun marks (#430).
  const spanStarts: number[] = [];

  for (let si = 0; si < spans.length; si++) {
    // A run that names its language is measured in it (#764).
    const ownLanguage = spanShapingLanguage(spans[si]!);
    const languageBefore = getMeasureLanguage();
    if (ownLanguage !== undefined) setMeasureLanguage(ownLanguage);
    try {
    const span = spans[si]!;
    spanStarts.push(units.length);
    // A ruby base: one unit, sized with its reading once its neighbours
    // are known (`sizeRubies`).
    if (span.ruby && span.text.length > 0) {
      units.push({ ...rubyBaseUnit(span, fonts, letterSpacingPx, vertical), ...(zwsp ? { zwspBefore: true } : {}), ...glue() });
      zwsp = false;
      continue;
    }
    if (vertical && (span.combineUpright || span.orientation) && span.text.length > 0 && !setsObject(span)) {
      const first = units.length;
      orientedUnits(span, styleOf(span, fonts, vertical), letterSpacingPx, zwsp, units);
      if (units.length > first) Object.assign(units[first]!, glue());
      zwsp = false;
      continue;
    }
    // A reference whose label is words (#702): one unit per word and per
    // space, each carrying the reference; only the first is glued to the
    // text before it, so a line may break after a space of the label.
    const whole = refLabelTokens(span, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic, letterSpacingPx)
      ?? atomicSpanToken(span, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic, letterSpacingPx);
    const atomics = whole === undefined ? [] : Array.isArray(whole) ? whole : [whole];
    for (const [k, atomic] of atomics.entries()) {
      const style = styleOf(span, fonts, vertical);
      if (atomic.kind === 'space') {
        units.push({
          kind: 'space',
          text: atomic.text,
          width: atomic.width,
          graphemes: graphemeCount(atomic.text),
          first: 'western',
          last: 'western',
          firstCjk: false,
          lastCjk: false,
          style,
          at: 0,
          token: atomic,
        });
        continue;
      }
      const graphemes = graphemesOf(atomic.text);
      const object = atomic.chip !== undefined || atomic.mathRender !== undefined || atomic.swatch !== undefined;
      const firstG = graphemes[0] ?? '';
      const lastG = graphemes[graphemes.length - 1] ?? '';
      units.push({
        kind: 'atomic',
        text: atomic.text,
        width: atomic.width,
        graphemes: graphemes.length,
        first: object ? 'ideograph' : cjkClassOf(firstG),
        last: object ? 'ideograph' : cjkClassOf(lastG),
        firstCjk: object || isCjkGrapheme(firstG),
        lastCjk: object || isCjkGrapheme(lastG),
        style,
        at: 0,
        token: atomic,
        ...((atomic.refResourceId !== undefined || atomic.footnoteId !== undefined) && k === 0 ? { glueBefore: true } : {}),
        ...(zwsp ? { zwspBefore: true } : {}),
        ...glue(),
      });
      zwsp = false;
    }
    if (atomics.length > 0) continue;
    if (span.text.length === 0) continue;
    const style = styleOf(span, fonts, vertical);
    const graphemes = graphemesOf(span.text);
    const spanFirst = units.length;
    let run: string[] = [];
    let runAt = 0;
    let runLink: string | undefined;
    let space = '';
    let spaceAt = 0;
    // A lone mark that may pair with the next one (—, …), by unit index.
    let pairOpen = -1;
    let at = 0;
    // The link a character at `offset` of the span is part of: its span and
    // range, so two links to one target stay apart.
    const links = span.links;
    const linkAt = (offset: number): string | undefined => {
      if (!links || links.length === 0) return undefined;
      for (let li = 0; li < links.length; li++) {
        const l = links[li]!;
        if (offset >= l.start && offset < l.end) return `${si}:${li}`;
      }
      return undefined;
    };
    const push = (u: Omit<Unit, 'style' | 'glueBefore' | 'zwspBefore'>): void => {
      units.push({
        ...u,
        style,
        ...(zwsp ? { zwspBefore: true } : {}),
        ...(style.script && units.length === spanFirst ? { glueBefore: true } : {}),
        ...glue(),
      });
      zwsp = false;
    };
    const flushRun = (): void => {
      if (run.length === 0) return;
      const text = run.join('');
      const firstG = run[0]!;
      const lastG = run[run.length - 1]!;
      // Vertical text: a short number at either end stands in one upright
      // cell (`cjk.uprightDigits`), and the run is Chinese on that side;
      // tracking follows the cell once.
      const cells = vertical ? numberCellEdges(run) : undefined;
      push({
        kind: 'text',
        text,
        width: textWidth(text, style.font, style.smallCaps) + track(vertical && letterSpacingPx !== 0 ? verticalTrackCount(text) : run.length),
        graphemes: run.length,
        first: cells?.start ? 'ideograph' : cjkClassOf(firstG),
        last: cells?.end ? 'ideograph' : cjkClassOf(lastG),
        firstCjk: cells?.start === true,
        lastCjk: cells?.end === true,
        at: runAt,
        run: true,
        ...(cells?.start ? { cellStart: true } : {}),
        ...(cells?.end ? { cellEnd: true } : {}),
        ...(URL_LIKE_RE.test(text) ? { url: true } : {}),
        ...(runLink !== undefined ? { link: runLink } : {}),
      });
      run = [];
      pairOpen = -1;
    };
    const flushSpace = (): void => {
      if (space === '') return;
      units.push({
        kind: 'space',
        text: space,
        width: measureTextWidth(space, style.font) + track(graphemeCount(space)),
        graphemes: graphemeCount(space),
        first: 'western',
        last: 'western',
        firstCjk: false,
        lastCjk: false,
        style,
        at: spaceAt,
      });
      space = '';
      pairOpen = -1;
    };
    for (let i = 0; i < graphemes.length; i++) {
      const g = graphemes[i]!;
      const gAt = at;
      at += g.length;
      if (isBreakingSpace(g[0])) {
        flushRun();
        wj = false;
        if (space === '') spaceAt = gAt;
        space += g;
        continue;
      }
      flushSpace();
      if (g === '\u200B') {
        flushRun();
        zwsp = true;
        pairOpen = -1;
        continue;
      }
      if (g === '\u2060') {
        flushRun();
        wj = true;
        pairOpen = -1;
        continue;
      }
      // A soft hyphen: the composer breaks Western words only when they are
      // wider than the line, so it is left out, and the word stays whole.
      if (g === '\u00AD') continue;
      const link = linkAt(gAt);
      if (!isCjkHere(g, graphemes[i - 1], graphemes[i + 1])) {
        // A link that starts or ends inside a run cuts it: the two parts
        // still never part (neither is CJK) and take no space between them.
        if (run.length > 0 && link !== runLink) flushRun();
        if (run.length === 0) {
          runAt = gAt;
          runLink = link;
        }
        run.push(g);
        continue;
      }
      flushRun();
      // —— and …… are one unit of two ems; a third mark opens another.
      if (pairOpen >= 0 && units[pairOpen]!.text === g && !zwsp && units[pairOpen]!.link === link) {
        const u = units[pairOpen]!;
        u.text += g;
        u.width += cellAdvance(g, style.font, vertical, u.first) + track(1);
        u.graphemes = 2;
        u.first = u.last = g === '\u2026' || g === '\u22EF' ? 'ellipsis' : 'dash';
        pairOpen = -1;
        continue;
      }
      let cls = cjkClassOf(g);
      // A single em dash (or horizontal bar) joins two words as a connector
      // (clreq §6.1.1): never at a line start.
      if (g === '\u2014' || g === '\u2015') cls = 'connector';
      push({
        kind: 'text',
        text: g,
        width: (style.smallCaps && !vertical ? textWidth(g, style.font, true) : cellAdvance(g, style.font, vertical, cls)) + track(1),
        graphemes: 1,
        first: cls,
        last: cls,
        firstCjk: true,
        lastCjk: true,
        at: gAt,
        ...(link !== undefined ? { link } : {}),
      });
      pairOpen = pairable(g) ? units.length - 1 : -1;
    }
    flushRun();
    flushSpace();
    if (units.length === spanFirst + 1 && units[spanFirst]!.kind === 'text') wholeSpan.add(spanFirst);
    } finally {
      if (ownLanguage !== undefined) setMeasureLanguage(languageBefore);
    }
  }

  if (spans.some((s) => s.kunten)) attachKunten(spans, spanStarts, units);

  // A subscript and a superscript that touch are set one over the other
  // (EF-80): the first advances nothing, the second the pair's advance, and
  // the two never part.
  if (units.some((u) => u.style.script)) {
    const scripts = units.map((u, i) => (wholeSpan.has(i) && u.style.script && !u.style.smallCaps ? u.style.script : undefined));
    for (const i of stackedScriptPairs(scripts)) {
      const a = units[i]!;
      const b = units[i + 1]!;
      const sub = a.style.script === 'sub' ? a : b;
      sub.style = {
        ...sub.style,
        key: `${sub.style.key}|stacked`,
        baselineShift: scriptMetrics(pickSpanFont(sub.style.bold, sub.style.italic, fonts.normal, fonts.bold, fonts.italic, fonts.boldItalic), 'sub', true).baselineShift,
      };
      b.width = Math.max(a.width, b.width);
      a.width = 0;
      a.stacked = 'first';
      b.stacked = 'second';
      b.glueBefore = true;
    }
  }
  if (vertical && getMeasureRegion() === 'japan') combineMarkPairs(units, letterSpacingPx);
  if (route) routeSharedMarks(units, letterSpacingPx, vertical, route === 'dashes');
  return units;
}

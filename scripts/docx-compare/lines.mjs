// Text lines of a page for the fidelity check (#1399, #1406): what
// `pdftotext -bbox-layout` gives, normalised and regrouped so the same
// visible line reads as one line in both PDFs. The engine's PDF and
// LibreOffice's split runs, superscripts, leaders and vertical text
// differently; matching compares keys, never the extractor's grouping.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m));

const LIGATURES = { '\uFB00': 'ff', '\uFB01': 'fi', '\uFB02': 'fl', '\uFB03': 'ffi', '\uFB04': 'ffl', '\uFB05': 'st', '\uFB06': 'st' };

/** A line's text as compared: NFKC (ligatures, presentation forms), no
 *  soft hyphens, tatweels or zero-width characters, one space between
 *  words, typographic dashes and quotes as they are. */
export function normaliseLine(s) {
  return s
    .replace(/[\uFB00-\uFB06]/g, (c) => LIGATURES[c])
    .normalize('NFKC')
    .replace(/[\u00AD\u0640\u200B-\u200F\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The match key: no spaces and no combining marks (\p{Mn}), whatever the
 *  script. Extractors emit Arabic harakat, shadda and Indic signs in the
 *  order the font's glyphs come, which differs between two renderings of
 *  the same line. */
export const lineKey = (text) => text.normalize('NFD').replace(/[\s\p{Mn}]/gu, '');

/** A run of three or more periods (spaced or not): a dot leader. */
const LEADER = /(?:\.\s?){2,}\./g;
const WIDE = /^[\u1100-\u11FF\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]+$/u;
const LATIN = /[A-Za-z0-9]/;
const allWide = (l) => WIDE.test(lineKey(l.text));

const box = (items) => ({
  x: Math.min(...items.map((i) => i.x)),
  y: Math.min(...items.map((i) => i.y)),
  x2: Math.max(...items.map((i) => i.x2)),
  y2: Math.max(...items.map((i) => i.y2)),
});

/** One line from its words, in reading order: left to right (pdftotext
 *  gives right-to-left text in visual order too), or top to bottom for a
 *  column. A space where the words stand apart. */
function lineOf(words, orientation = null) {
  const vertical = orientation === 'v';
  const sorted = [...words].sort((a, b) => (vertical ? a.y - b.y : a.x - b.x));
  let text = '';
  sorted.forEach((w, i) => {
    if (i) {
      const p = sorted[i - 1];
      const gap = vertical ? w.y - p.y2 : w.x - p.x2;
      const em = vertical ? Math.min(p.x2 - p.x, w.x2 - w.x) : Math.min(p.y2 - p.y, w.y2 - w.y);
      if (gap > 0.15 * em) text += ' ';
    }
    text += w.text;
  });
  text = normaliseLine(text);
  const b = box(sorted);
  return { text, ...b, words: sorted, orientation: orientation ?? orientationOf(text, b) };
}

/** 'h' for a row of two or more characters, 'v' for a box of three or
 *  more much taller than wide (a drop cap and its period are not a
 *  column), null when the box cannot tell. */
function orientationOf(text, b) {
  const n = [...lineKey(text)].length;
  const w = b.x2 - b.x;
  const h = b.y2 - b.y;
  if (n >= 3 && h > 1.5 * w) return 'v';
  if (n >= 2 && w >= h) return 'h';
  return null;
}

/** Words of a pdftotext line, normalised, cut where a leader stands: the
 *  words before and after it become lines of their own, as the engine's
 *  PDF draws leaders as graphics pdftotext does not read. A glyph
 *  extracted twice at one spot (LibreOffice does this for some joined
 *  Arabic forms) counts once. */
function segments(rawWords) {
  const out = [[]];
  const words = rawWords.map((w) => ({ ...w, text: normaliseLine(w.text) })).filter((w) => w.text);
  // Dots extracted as words of their own: three or more in a row are a
  // leader, joined into one word for the cut below.
  for (let i = 0; i < words.length; i++) {
    let j = i;
    while (j < words.length && /^\.+$/.test(words[j].text)) j++;
    if (words.slice(i, j).reduce((n, w) => n + w.text.length, 0) >= 3) words.splice(i, j - i, { ...words[i], text: '...', x2: words[j - 1].x2 });
  }
  for (const w of words) {
    const text = w.text;
    // Each part of a word cut at a leader keeps its share of the box.
    const step = (w.x2 - w.x) / text.length;
    let at = 0;
    for (const m of [...text.matchAll(LEADER), { index: text.length, 0: '' }]) {
      const t = text.slice(at, m.index).trim();
      const seg = out[out.length - 1];
      const prev = seg[seg.length - 1];
      if (t && !(prev && prev.text === t && Math.abs(w.x - prev.x2) < 1 && w.x2 - w.x < 1)) {
        const whole = at === 0 && m.index === text.length;
        seg.push(whole ? { ...w, text: t } : { ...w, text: t, x: w.x + at * step, x2: w.x + m.index * step });
      }
      if (m[0]) out.push([]);
      at = m.index + m[0].length;
    }
  }
  return out.filter((s) => s.length);
}

/** Lines per page from `pdftotext -bbox-layout`: text, box in points,
 *  words and orientation, regrouped (`regroup`). */
export function parseBboxLayout(html) {
  const pages = [];
  const pageRe = /<page\b[^>]*>([\s\S]*?)<\/page>/g;
  for (let pm = pageRe.exec(html); pm; pm = pageRe.exec(html)) {
    const segs = [];
    const lineRe = /<line xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([\s\S]*?)<\/line>/g;
    for (let lm = lineRe.exec(pm[1]); lm; lm = lineRe.exec(pm[1])) {
      const found = [...lm[5].matchAll(/<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([\s\S]*?)<\/word>/g)].map((w) => ({
        text: decode(w[5]),
        x: Number(w[1]),
        y: Number(w[2]),
        x2: Number(w[3]),
        y2: Number(w[4]),
      }));
      segs.push(...segments(found));
    }
    // A vertical page as LibreOffice writes it: every upright glyph its own
    // word, which pdftotext strings into rows across the columns. Taken
    // glyph by glyph, then joined into columns.
    const glyphWords = segs.flat().map((w) => lineOf([w]));
    pages.push(regroup(isVerticalPage(glyphWords) ? glyphWords : segs.map((seg) => lineOf(seg))));
  }
  return pages;
}

const height = (l) => l.y2 - l.y;
const width = (l) => l.x2 - l.x;
const overlap = (a1, a2, b1, b2) => Math.min(a2, b2) - Math.max(a1, b1);
const glyphs = (l) => [...lineKey(l.text)].length;

/** Whether a page is set vertically as far as the extractor shows: most
 *  lines are single glyphs (LibreOffice writes each upright glyph of a
 *  vertical line on its own). */
export function isVerticalPage(lines) {
  const single = lines.filter((l) => glyphs(l) === 1).length;
  return single >= 2 && single * 2 >= lines.length;
}

/** Single glyphs stacked in one x band, each within about an em below
 *  the one above, joined into column lines. Two glyphs at one height are
 *  two columns (lines set over each other). Columns of glyphs under 0.6
 *  of the page's usual width are ruby, which the engine's PDF does not
 *  give as text, and go. */
function mergeColumns(lines) {
  const singles = lines.filter((l) => glyphs(l) === 1).sort((a, b) => a.y - b.y);
  const rest = lines.filter((l) => glyphs(l) !== 1);
  const columns = [];
  for (const g of singles) {
    const col = columns.find((c) => {
      const last = c[c.length - 1];
      const em = Math.max(height(last), width(last), height(g));
      return overlap(last.x, last.x2, g.x, g.x2) >= 0.3 * Math.min(width(last), width(g)) && g.y - last.y2 <= em && g.y >= last.y2 - 0.5 * em;
    });
    if (col) col.push(g);
    else columns.push([g]);
  }
  const usual = median(singles.map(width));
  for (const c of columns) {
    if (median(c.map(width)) < 0.6 * usual) continue;
    rest.push(c.length > 1 ? lineOf(c.flatMap((l) => l.words), 'v') : c[0]);
  }
  return rest;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

/** Whether two lines stand on one baseline and touch: a run split at a
 *  font change, or the pieces of a display line. Single wide glyphs
 *  (letterspaced CJK titles) join a line of wide glyphs across up to
 *  an em. A piece of three
 *  glyphs or fewer may sit inside the other line and off its baseline
 *  (the letters of an Arabic display face LibreOffice draws one by one;
 *  not Latin, where that is a letterspaced word over another); longer
 *  lines that overlap are two lines set over each other, not one. */
function touching(a, b) {
  if (a.orientation === 'v' || b.orientation === 'v') return false;
  const h = Math.min(height(a), height(b));
  const gap = Math.max(a.x, b.x) - Math.min(a.x2, b.x2);
  if (Math.min(glyphs(a), glyphs(b)) <= 3 && gap < 0 && !LATIN.test(a.text + b.text) && overlap(a.y, a.y2, b.y, b.y2) >= 0.3 * h) return true;
  if (overlap(a.y, a.y2, b.y, b.y2) < 0.5 * h || Math.abs(a.y2 - b.y2) > 0.3 * h || gap < -0.3 * h) return false;
  const wide = Math.min(glyphs(a), glyphs(b)) === 1 && allWide(a) && allWide(b);
  return gap <= (wide ? 1 : 0.3) * h;
}

/** A superscript marker (one or two characters, shorter than the line
 *  beside it) and the line it belongs to, the nearest one it sits on or
 *  just above within half an em. */
function hostOf(m, lines) {
  if (glyphs(m) > 2) return null;
  let best = null;
  let bestGap = Infinity;
  for (const l of lines) {
    if (l === m || glyphs(l) <= 2 || l.orientation === 'v' || height(m) >= 0.8 * height(l)) continue;
    if (overlap(m.y, m.y2, l.y - 0.5 * height(l), l.y2) <= 0) continue;
    const gap = Math.max(0, Math.max(m.x, l.x) - Math.min(m.x2, l.x2));
    if (gap <= 0.5 * height(l) && gap < bestGap) {
      best = l;
      bestGap = gap;
    }
  }
  return best;
}

/** The page's lines as compared: vertical glyphs joined into columns,
 *  touching pieces on one baseline joined, superscript markers joined to
 *  their line. Reading order: top to bottom, or right to left in columns. */
export function regroup(input) {
  let lines = isVerticalPage(input) ? mergeColumns(input) : [...input];
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        if (touching(lines[i], lines[j])) {
          const merged = lineOf([...lines[i].words, ...lines[j].words], 'h');
          lines = lines.filter((_, k) => k !== i && k !== j).concat(merged);
          changed = true;
          break outer;
        }
      }
    }
  }
  for (const m of [...lines]) {
    const host = hostOf(m, lines);
    if (!host) continue;
    const merged = lineOf([...host.words, ...m.words], host.orientation);
    lines = lines.filter((l) => l !== m && l !== host).concat(merged);
  }
  return lines.sort((a, b) => (a.orientation === 'v' && b.orientation === 'v' ? b.x2 - a.x2 : a.y - b.y || a.x - b.x));
}

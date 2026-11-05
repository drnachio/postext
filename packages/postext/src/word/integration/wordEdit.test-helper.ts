// A small Word stand-in for the end-to-end tests: edits document.xml the
// way Word saves typing, whatever runs the writer split the text into.
// The text is read as Word shows it: `w:t` text, `w:br` as '\n' and the
// boundary between two adjacent paragraphs as '¶'. A match may cross runs,
// line breaks and paragraph marks; what it covers is removed (a break or a
// paragraph mark goes with it) and the replacement is typed where it
// started, in that run's formatting. A '¶' in the replacement is Enter.

const PARA = '¶';

type Token =
  | { kind: 't'; open: number; start: number; end: number; text: string }
  | { kind: 'br' | 'para'; start: number; end: number; text: string };

const decode = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const encode = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tokens(xml: string): Token[] {
  const out: Token[] = [];
  const re = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<w:t\/>|<w:br\/>|<\/w:p><w:p>(?:<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*<\/w:pPr>)?/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const s = m[0];
    if (s.startsWith('<w:t')) {
      if (s === '<w:t/>') continue;
      const open = m.index;
      const start = m.index + s.indexOf('>') + 1;
      out.push({ kind: 't', open, start, end: start + m[1]!.length, text: decode(m[1]!) });
    } else if (s === '<w:br/>') out.push({ kind: 'br', start: m.index, end: m.index + s.length, text: '\n' });
    else out.push({ kind: 'para', start: m.index, end: m.index + s.length, text: PARA });
  }
  return out;
}

/** The text Word shows (breaks '\n', paragraph marks between adjacent
 *  paragraphs '¶'). */
export function wordText(xml: string): string {
  return tokens(xml).map((t) => t.text).join('');
}

/** The paragraph properties and run properties at an XML offset. */
function contextAt(xml: string, at: number): { pPr: string; rPr: string } {
  const p = xml.lastIndexOf('<w:p>', at);
  const pPr = /^<w:p>(<w:pPr>(?:(?!<\/w:pPr>)[\s\S])*<\/w:pPr>)?/.exec(xml.slice(p))?.[1] ?? '';
  const r = xml.lastIndexOf('<w:r>', at);
  const rPr = /^<w:r>(<w:rPr>(?:(?!<\/w:rPr>)[\s\S])*<\/w:rPr>)?/.exec(xml.slice(r))?.[1] ?? '';
  return { pPr, rPr };
}

/** Replace the one occurrence of `find` in the text Word shows. Only what
 *  differs is retyped (the common head and tail stay as they are), as a
 *  user selects and types over the changed part. */
export function typeOver(xml: string, find: string, replacement: string): string {
  const toks = tokens(xml);
  const text = toks.map((t) => t.text).join('');
  const at = text.indexOf(find);
  if (at < 0) throw new Error(`"${find}" not in the document text`);
  if (text.indexOf(find, at + 1) >= 0) throw new Error(`"${find}" is in the document text more than once`);
  let head = 0;
  while (head < find.length && head < replacement.length && find[head] === replacement[head]) head++;
  let tail = 0;
  while (tail < find.length - head && tail < replacement.length - head && find[find.length - 1 - tail] === replacement[replacement.length - 1 - tail]) tail++;
  const a = at + head;
  const b = at + find.length - tail;
  const replace = replacement.slice(head, replacement.length - tail);
  if (a === b && !replace) return xml;
  let pos = 0;
  let typed = false;
  const patches: { start: number; end: number; with: string }[] = [];
  for (const t of toks) {
    const t0 = pos;
    const t1 = pos + t.text.length;
    pos = t1;
    if (a === b) {
      // A pure insertion goes inside the text before it (the run the
      // caret follows), or at the start of the next text.
      if (!typed && t.kind === 't' && t0 < a && t1 >= a) {
        const k = a - t0;
        patches.push({ start: t.start, end: t.end, with: encode(t.text.slice(0, k)) + typedXml(xml, t.start, replace) + encode(t.text.slice(k)) });
        typed = true;
      }
      continue;
    }
    if (t1 <= a || t0 >= b) {
      if (t0 === b && !typed && t.kind === 't' && replace) {
        patches.push({ start: t.start, end: t.start, with: typedXml(xml, t.start, replace) });
        typed = true;
      }
      continue;
    }
    if (t.kind !== 't') {
      if (t0 < a || t1 > b) throw new Error('a match cannot cut a break');
      patches.push({ start: t.start, end: t.end, with: '' });
      continue;
    }
    const from = Math.max(a, t0) - t0;
    const to = Math.min(b, t1) - t0;
    const ins: string = !typed && replace ? replace : '';
    typed ||= ins !== '';
    const kept = t.text.slice(0, from) + '\u0000' + t.text.slice(to);
    const content = encode(kept).replace('\u0000', ins ? typedXml(xml, t.start, ins) : '');
    patches.push({ start: t.start, end: t.end, with: content });
  }
  if (replace && !typed) throw new Error('nowhere to type the replacement');
  patches.sort((x, y) => y.start - x.start);
  let out = xml;
  for (const p of patches) out = out.slice(0, p.start) + p.with + out.slice(p.end);
  return out;
}

/** Typed text at an offset inside a `w:t`: '¶' closes the run and the
 *  paragraph and opens new ones with the same properties. */
function typedXml(xml: string, at: number, s: string): string {
  if (!s.includes(PARA)) return encode(s);
  const { pPr, rPr } = contextAt(xml, at);
  return s.split(PARA).map(encode).join(`</w:t></w:r></w:p><w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">`);
}

/** Wrap the one occurrence of `word` (inside a single `w:t`) in its own run
 *  with `props` added to the run properties (`<w:b/>` to bold it). */
export function formatWord(xml: string, word: string, props: string): string {
  return splitRun(xml, word, (rPr) => `<w:r>${addProps(rPr, props)}<w:t xml:space="preserve">${encode(word)}</w:t></w:r>`);
}

/** Tracked replacement of `word` (inside one `w:t`) by `by`, as Word's
 *  Track Changes saves it. */
export function trackReplace(xml: string, word: string, by: string, author = 'Ana'): string {
  const date = '2026-11-04T00:00:00Z';
  return splitRun(xml, word, (rPr) =>
    `<w:del w:id="9001" w:author="${author}" w:date="${date}"><w:r>${rPr}<w:delText xml:space="preserve">${encode(word)}</w:delText></w:r></w:del>` +
    (by ? `<w:ins w:id="9002" w:author="${author}" w:date="${date}"><w:r>${rPr}<w:t xml:space="preserve">${encode(by)}</w:t></w:r></w:ins>` : ''));
}

function addProps(rPr: string, props: string): string {
  if (!rPr) return `<w:rPr>${props}</w:rPr>`;
  // After w:rStyle and w:rFonts, where CT_RPr wants w:b and w:i.
  const m = /^<w:rPr>(<w:rStyle [^>]*\/>)?(<w:rFonts [^>]*\/>)?/.exec(rPr)!;
  return m[0] + props + rPr.slice(m[0].length);
}

function splitRun(xml: string, word: string, middle: (rPr: string) => string): string {
  const toks = tokens(xml).filter((t): t is Extract<Token, { kind: 't' }> => t.kind === 't' && t.text.includes(word));
  if (toks.length !== 1 || toks[0]!.text.indexOf(word) !== toks[0]!.text.lastIndexOf(word)) throw new Error(`"${word}" must stand once inside one w:t (found in ${toks.length})`);
  const t = toks[0]!;
  const r = xml.lastIndexOf('<w:r>', t.open);
  const end = xml.indexOf('</w:r>', t.end) + '</w:r>'.length;
  const { rPr } = contextAt(xml, t.open);
  const i = t.text.indexOf(word);
  const run = (s: string): string => (s ? `<w:r>${rPr}<w:t xml:space="preserve">${encode(s)}</w:t></w:r>` : '');
  return xml.slice(0, r) + run(t.text.slice(0, i)) + middle(rPr) + run(t.text.slice(i + word.length)) + xml.slice(end);
}

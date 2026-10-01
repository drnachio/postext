/**
 * A small BibTeX / BibLaTeX reader: entries, `@string` macros, `#`
 * concatenation, braced and quoted values, name lists, LaTeX accents and
 * dashes — enough for what Zotero, JabRef, Mendeley and Google Scholar
 * export. Entries become CSL-JSON items.
 */

import type { CslDate, CslItem, CslName } from './types';

const TYPES: Readonly<Record<string, string>> = {
  article: 'article-journal',
  book: 'book',
  mvbook: 'book',
  booklet: 'pamphlet',
  inbook: 'chapter',
  incollection: 'chapter',
  inproceedings: 'paper-conference',
  conference: 'paper-conference',
  proceedings: 'book',
  collection: 'book',
  manual: 'book',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  thesis: 'thesis',
  techreport: 'report',
  report: 'report',
  unpublished: 'manuscript',
  misc: 'document',
  online: 'webpage',
  electronic: 'webpage',
  www: 'webpage',
  patent: 'patent',
  dataset: 'dataset',
  software: 'software',
  standard: 'standard',
  periodical: 'periodical',
  legislation: 'legislation',
  jurisdiction: 'legal_case',
};

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** BibLaTeX `langid` / `language` values → BCP 47. */
const LANGUAGES: Readonly<Record<string, string>> = {
  english: 'en', american: 'en-US', british: 'en-GB', spanish: 'es', french: 'fr', german: 'de', ngerman: 'de',
  italian: 'it', portuguese: 'pt', brazilian: 'pt-BR', catalan: 'ca', dutch: 'nl', chinese: 'zh-CN',
  'simplified chinese': 'zh-CN', 'traditional chinese': 'zh-TW', japanese: 'ja', korean: 'ko', russian: 'ru',
};

const ACCENTS: Readonly<Record<string, string>> = {
  "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃', '=': '̄', '.': '̇',
  u: '̆', v: '̌', H: '̋', c: '̧', k: '̨', r: '̊', d: '̣', b: '̱',
};

const SYMBOLS: Readonly<Record<string, string>> = {
  ss: 'ß', o: 'ø', O: 'Ø', aa: 'å', AA: 'Å', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ',
  textendash: '–', textemdash: '—', textquoteleft: '‘', textquoteright: '’', textquotedblleft: '“', textquotedblright: '”',
  dag: '†', ddag: '‡', S: '§', P: '¶', copyright: '©', textregistered: '®', texttrademark: '™', ldots: '…', dots: '…',
  TeX: 'TeX', LaTeX: 'LaTeX', LaTeXe: 'LaTeX2ε', BibTeX: 'BibTeX', XeTeX: 'XeTeX', LuaTeX: 'LuaTeX', ConTeXt: 'ConTeXt',
};

/** LaTeX markup of a field value as plain text: accents composed,
 *  escapes and dashes resolved, braces dropped. */
export function latexToText(value: string): string {
  let s = value;
  // Accents: \'e, \'{e}, {\'e}, \c{c}, \v s…
  s = s.replace(/\\([`'^"~=.]|[uvHckrdb](?![a-zA-Z]))\s*(?:\{\s*(\\?[a-zA-Z])\s*\}|(\\?[a-zA-Z]))/g, (_, accent: string, braced?: string, bare?: string) => {
    let base = (braced ?? bare ?? '').replace(/^\\/, '');
    if (base === 'i') base = 'i';
    return (base + (ACCENTS[accent] ?? '')).normalize('NFC');
  });
  s = s.replace(/\\([a-zA-Z]+)(?:\{\})?\s?/g, (whole: string, name: string) => SYMBOLS[name] ?? whole);
  s = s.replace(/\\([&%$#_{}])/g, '$1');
  s = s.replace(/---/g, '—').replace(/--/g, '–').replace(/(?<!\\)~/g, ' ');
  s = s.replace(/\\(?:emph|textit|textbf|textsc|mkbibemph|mkbibquote|enquote)\{/g, '{');
  s = s.replace(/[{}]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

/** Split `text` at `sep` (a regular expression of one separator) where the
 *  brace depth is zero. */
function splitTopLevel(text: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '{') depth++;
    else if (c === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      sep.lastIndex = 0;
      const m = sep.exec(text.slice(i));
      if (m && m.index === 0) {
        out.push(text.slice(last, i));
        i += m[0].length - 1;
        last = i + 1;
      }
    }
  }
  out.push(text.slice(last));
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

const CJK = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u;

/** One BibTeX name (`Last, First`, `Last, Jr, First`, `First von Last`, a
 *  braced corporate name) as a CSL name. */
function parseName(raw: string): CslName {
  const trimmed = raw.trim();
  if (/^\{.*\}$/.test(trimmed) && splitTopLevel(trimmed.slice(1, -1), /,/g).length >= 1 && !trimmed.slice(1, -1).includes('{')) {
    return { literal: latexToText(trimmed) };
  }
  const parts = splitTopLevel(trimmed, /,/g).map(latexToText);
  if (parts.length >= 2) {
    const [last, ...rest] = parts;
    const given = rest.length === 2 ? rest[1]! : rest[0]!;
    const suffix = rest.length === 2 ? rest[0] : undefined;
    return withParticle({ family: last!, ...(given ? { given } : {}), ...(suffix ? { suffix } : {}) });
  }
  const text = parts[0] ?? '';
  // A Chinese, Japanese or Korean name written whole is one family name.
  if (CJK.test(text) && !/\s/.test(text)) return { family: text };
  const words = splitTopLevel(trimmed, /\s+/g).map(latexToText);
  if (words.length === 1) return { family: words[0]! };
  // `First von Last`: the particle is the run of lower-case words before the last.
  const i = words.length - 1;
  let particleStart = i;
  while (particleStart - 1 > 0 && /^\p{Ll}/u.test(words[particleStart - 1]!)) particleStart--;
  const particle = words.slice(particleStart, i).join(' ');
  const given = words.slice(0, particleStart).join(' ');
  return { family: words[i]!, ...(given ? { given } : {}), ...(particle ? { 'non-dropping-particle': particle } : {}) };
}

/** `Last, First` whose last name opens with a lower-case particle ("van
 *  Gogh, Vincent"). */
function withParticle(name: CslName): CslName {
  const m = /^((?:\p{Ll}+\s+)+)(.+)$/u.exec(name.family ?? '');
  return m ? { ...name, family: m[2]!, 'non-dropping-particle': m[1]!.trim() } : name;
}

function parseNames(value: string): CslName[] {
  return splitTopLevel(value, /\s+and\s+/gi).map(parseName);
}

function parseDate(fields: Readonly<Record<string, string>>): CslDate | undefined {
  const date = fields.date;
  if (date) {
    const m = /^(\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(date);
    if (m) return { 'date-parts': [[Number(m[1]), ...(m[2] ? [Number(m[2])] : []), ...(m[3] ? [Number(m[3])] : [])]] };
    return { literal: latexToText(date) };
  }
  const year = fields.year;
  if (!year) return undefined;
  const y = /^\d{1,4}$/.test(year.trim()) ? Number(year.trim()) : undefined;
  if (y === undefined) return { literal: latexToText(year) };
  const monthRaw = fields.month?.trim().toLowerCase();
  const month = monthRaw ? (MONTHS[monthRaw.slice(0, 3)] ?? (/^\d{1,2}$/.test(monthRaw) ? Number(monthRaw) : undefined)) : undefined;
  return { 'date-parts': [[y, ...(month ? [month] : [])]] };
}

interface RawEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

/** A diagnostic of the reader: what it skipped and where. */
export interface BibtexIssue {
  message: string;
  /** Offset in the source. */
  at: number;
}

/** Read the entries of a BibTeX source (values still in LaTeX). */
function readEntries(source: string, issues: BibtexIssue[]): RawEntry[] {
  const macros: Record<string, string> = {
    jan: 'jan', feb: 'feb', mar: 'mar', apr: 'apr', may: 'may', jun: 'jun', jul: 'jul', aug: 'aug', sep: 'sep', oct: 'oct', nov: 'nov', dec: 'dec',
  };
  const entries: RawEntry[] = [];
  let i = 0;
  const n = source.length;
  const skipSpace = (): void => {
    while (i < n) {
      if (/\s/.test(source[i]!)) i++;
      else if (source[i] === '%') { while (i < n && source[i] !== '\n') i++; }
      else break;
    }
  };
  /** A braced or quoted value, or a bare number / macro name. */
  const readPart = (): string | undefined => {
    skipSpace();
    const c = source[i];
    if (c === '{') {
      let depth = 0;
      const start = i + 1;
      for (; i < n; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) break; }
      }
      const value = source.slice(start, i);
      i++;
      return value;
    }
    if (c === '"') {
      let depth = 0;
      const start = ++i;
      for (; i < n; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        else if (source[i] === '"' && depth === 0) break;
      }
      const value = source.slice(start, i);
      i++;
      return value;
    }
    const m = /^[^\s,#}=)]+/.exec(source.slice(i));
    if (!m) return undefined;
    i += m[0].length;
    return /^\d+$/.test(m[0]) ? m[0] : (macros[m[0].toLowerCase()] ?? m[0]);
  };
  const readValue = (): string => {
    const parts: string[] = [];
    for (;;) {
      const part = readPart();
      if (part !== undefined) parts.push(part);
      skipSpace();
      if (source[i] === '#') { i++; continue; }
      break;
    }
    return parts.join('');
  };
  while (i < n) {
    const at = source.indexOf('@', i);
    if (at < 0) break;
    i = at + 1;
    const typeMatch = /^[A-Za-z]+/.exec(source.slice(i));
    if (!typeMatch) continue;
    const type = typeMatch[0].toLowerCase();
    i += typeMatch[0].length;
    skipSpace();
    const open = source[i];
    if (open !== '{' && open !== '(') continue;
    const close = open === '{' ? '}' : ')';
    i++;
    if (type === 'comment' || type === 'preamble') {
      let depth = 1;
      for (; i < n && depth > 0; i++) {
        if (source[i] === open) depth++;
        else if (source[i] === close) depth--;
      }
      continue;
    }
    if (type === 'string') {
      skipSpace();
      const name = /^[^\s=]+/.exec(source.slice(i))?.[0];
      if (!name) continue;
      i += name.length;
      skipSpace();
      if (source[i] === '=') i++;
      macros[name.toLowerCase()] = readValue();
      skipSpace();
      if (source[i] === close) i++;
      continue;
    }
    skipSpace();
    const key = /^[^\s,]+/.exec(source.slice(i))?.[0];
    if (!key) { issues.push({ message: `@${type} without a key`, at }); continue; }
    i += key.length;
    const fields: Record<string, string> = {};
    for (;;) {
      skipSpace();
      if (source[i] === ',') { i++; skipSpace(); }
      if (i >= n) { issues.push({ message: `@${type}{${key}: unclosed entry`, at }); break; }
      if (source[i] === close) { i++; break; }
      const name = /^[A-Za-z_][\w:.-]*/.exec(source.slice(i))?.[0];
      if (!name) { issues.push({ message: `@${type}{${key}: unreadable field`, at: i }); i++; continue; }
      i += name.length;
      skipSpace();
      if (source[i] !== '=') { issues.push({ message: `@${type}{${key}: field ${name} without =`, at: i }); continue; }
      i++;
      fields[name.toLowerCase()] = readValue();
    }
    entries.push({ type, key, fields });
  }
  return entries;
}

const VERBATIM = new Set(['url', 'doi', 'eprint', 'file']);

/** The CSL-JSON items of a BibTeX / BibLaTeX source. */
export function parseBibtex(source: string, issues: BibtexIssue[] = []): CslItem[] {
  return readEntries(source, issues).map((entry) => {
    const raw = entry.fields;
    const f: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) f[k] = VERBATIM.has(k) ? v.trim() : latexToText(v);
    const type = TYPES[entry.type] ?? (raw.url ? 'webpage' : 'document');
    const item: CslItem = { id: entry.key, type };
    const set = (field: string, value: string | undefined): void => {
      if (value !== undefined && value.length > 0) item[field] = value;
    };
    set('title', f.title);
    // Zotero writes the short title it shows in its own lists; MLA and
    // Chicago print it in a work's later citations (`title-short`).
    set('title-short', f.shorttitle);
    if (raw.author) item.author = parseNames(raw.author);
    if (raw.editor) item.editor = parseNames(raw.editor);
    if (raw.translator) item.translator = parseNames(raw.translator);
    set('container-title', f.journaltitle ?? f.journal ?? f.booktitle);
    set('container-title-short', f.shortjournal);
    set('collection-title', f.series);
    set('publisher', f.publisher ?? f.school ?? f.institution ?? f.organization);
    set('publisher-place', f.location ?? f.address);
    set('volume', f.volume);
    if (type === 'article-journal' || type === 'article-magazine' || type === 'article-newspaper') set('issue', f.number ?? f.issue);
    else set('number', f.number);
    set('page', f.pages?.replace(/\s*[-–]+\s*/g, '–'));
    set('edition', f.edition);
    set('chapter-number', f.chapter);
    set('genre', f.type ?? (entry.type === 'phdthesis' ? 'PhD thesis' : entry.type === 'mastersthesis' ? "Master's thesis" : undefined));
    set('ISBN', f.isbn);
    set('ISSN', f.issn);
    set('DOI', f.doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, ''));
    set('URL', f.url);
    set('note', f.note);
    const language = (f.langid ?? f.language)?.toLowerCase();
    if (language) set('language', LANGUAGES[language] ?? language);
    const issued = parseDate(f);
    if (issued) item.issued = issued;
    if (f.urldate) {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(f.urldate);
      if (m) item.accessed = { 'date-parts': [[Number(m[1]), Number(m[2]), Number(m[3])]] };
    }
    return item;
  });
}

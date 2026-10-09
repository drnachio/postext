// Syntax colouring of code listings (#624): a small tokenizer for the
// languages listings are most often written in, and the hook a host plugs
// its own highlighter into (Shiki, Prism, highlight.js…).
//
// The built-in tokenizer is a scanner of ordered regular-expression rules
// per language, run over the whole listing (so a comment or a string may
// span lines) and cut at the line feeds afterwards. It names a token's kind
// (`CodeTokenKind`), never its colour: `codeStyle.tokens` colours the kinds.
// It aims at the common constructs of each language, not at full grammars;
// a language it does not know is set plain.

import type { CodeTokenKind } from '../types';

/** One run of a listing's line as a highlighter gives it: its text, the
 *  kind of token it is (unset: plain) or a colour of its own (a CSS hex,
 *  which wins over the kind's). */
export interface CodeToken {
  text: string;
  token?: CodeTokenKind;
  color?: string;
}

/** A highlighter: the listing's lines, each as runs whose texts join into
 *  the line (tabs and spaces included). `lang` is the fence's language,
 *  lower-cased. Return undefined to leave the listing to the next
 *  highlighter (or the built-in one). */
export type CodeHighlighter = (code: string, lang: string) => CodeToken[][] | undefined;

const highlighters = new Map<string, CodeHighlighter>();

/**
 * Register a highlighter for listings of `lang` (lower-case, as fences
 * name it: `'js'`, `'python'`), or `'*'` for every language. A highlighter
 * for a language takes precedence over `'*'`, which takes precedence over
 * the built-in tokenizer; `null` removes one. Layout reads the registry
 * when it sets a listing, so register before building; in a web worker
 * (the Sandbox lays out in one) register inside the worker.
 */
export function registerCodeHighlighter(lang: string, fn: CodeHighlighter | null): void {
  const key = lang.trim().toLowerCase();
  if (fn) highlighters.set(key, fn);
  else highlighters.delete(key);
}

/** The languages the built-in tokenizer reads, under every name a fence
 *  may give them. */
const ALIASES: Readonly<Record<string, string>> = {
  js: 'js', javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js', node: 'js',
  ts: 'js', typescript: 'js', tsx: 'js', mts: 'js', cts: 'js',
  json: 'json', jsonc: 'json', json5: 'json',
  py: 'python', python: 'python', python3: 'python', py3: 'python',
  sh: 'bash', bash: 'bash', zsh: 'bash', shell: 'bash', ksh: 'bash',
  console: 'console', 'shell-session': 'console', shellsession: 'console', terminal: 'console',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', xml: 'html', svg: 'html', xhtml: 'html', vue: 'html',
  md: 'markdown', markdown: 'markdown',
  sql: 'sql', psql: 'sql', mysql: 'sql', sqlite: 'sql', postgresql: 'sql',
};

/** Whether the built-in tokenizer reads `lang`. */
export function builtinCodeLanguage(lang: string | undefined): boolean {
  return lang !== undefined && ALIASES[lang.toLowerCase()] !== undefined;
}

/**
 * The tokens of a listing's lines: a registered highlighter's (for its
 * language, then `'*'`), else the built-in tokenizer's when `builtin` and
 * it reads the language. Undefined when nothing colours it. A
 * highlighter's lines that do not join into the listing's own are left
 * out (the listing is then set plain).
 */
export function highlightCode(code: string, lang: string | undefined, builtin: boolean): CodeToken[][] | undefined {
  const key = (lang ?? '').toLowerCase();
  const lines = code.split('\n');
  for (const fn of [key ? highlighters.get(key) : undefined, highlighters.get('*')]) {
    if (!fn) continue;
    let out: CodeToken[][] | undefined;
    try {
      out = fn(code, key);
    } catch {
      out = undefined;
    }
    if (out && out.length === lines.length && out.every((runs, i) => runs.map((r) => r.text).join('') === lines[i])) return out;
  }
  if (!builtin) return undefined;
  const language = ALIASES[key];
  return language ? splitLines(tokenize(code, language)) : undefined;
}

/** Cut a listing's tokens at its line feeds. */
function splitLines(tokens: readonly CodeToken[]): CodeToken[][] {
  const lines: CodeToken[][] = [[]];
  for (const t of tokens) {
    const parts = t.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part.length > 0) lines[lines.length - 1]!.push(t.token ? { text: part, token: t.token } : { text: part });
    });
  }
  return lines;
}

/** One scanner rule: a sticky pattern and the kind of what it matches (a
 *  function to tell kinds apart by the matched text). */
type Rule = [RegExp, CodeTokenKind | undefined | ((text: string, rest: string) => CodeTokenKind | undefined)];

const words = (list: string): ReadonlySet<string> => new Set(list.split(/\s+/).filter(Boolean));

const JS_KEYWORDS = words(`
  break case catch class const continue debugger default delete do else export extends finally for
  from function if import in instanceof let new of return static super switch this throw try typeof
  var void while with yield async await as interface type enum implements private protected public
  readonly declare namespace abstract keyof infer satisfies get set`);
const JS_CONSTANTS = words('true false null undefined NaN Infinity');
const JS_TYPES = words('string number boolean any unknown never object symbol bigint');
const PY_KEYWORDS = words(`
  and as assert async await break class continue def del elif else except finally for from global if
  import in is lambda nonlocal not or pass raise return try while with yield match case`);
const PY_CONSTANTS = words('True False None');
const SH_KEYWORDS = words('if then else elif fi for in do done while until case esac function select time return');
const SH_BUILTINS = words(`
  echo cd export local read set unset shift source alias exit test printf pwd eval exec trap wait
  declare readonly let type umask`);
const SQL_KEYWORDS = words(`
  select from where insert into values update set delete create table drop alter add primary key
  foreign references not null and or in is like join left right inner outer full cross on group by
  order having limit offset as distinct union all case when then else end exists between index view
  default unique check constraint begin commit rollback with returning asc desc if replace`);
const SQL_TYPES = words('int integer bigint smallint serial varchar char text date time timestamp boolean real float double decimal numeric json jsonb blob uuid');

/** An identifier followed by `(`: a call or a definition. */
const calls = (rest: string): boolean => /^\s*\(/.test(rest);

/** Identifiers of a C-like language. */
function cLikeWord(keywords: ReadonlySet<string>, constants: ReadonlySet<string>, types: ReadonlySet<string>, capitalTypes: boolean) {
  return (text: string, rest: string): CodeTokenKind | undefined => {
    if (keywords.has(text)) return 'keyword';
    if (constants.has(text)) return 'number';
    if (types.has(text)) return 'type';
    if (calls(rest)) return 'function';
    if (capitalTypes && /^[A-Z][A-Za-z0-9_]*[a-z][A-Za-z0-9_]*$/.test(text)) return 'type';
    return undefined;
  };
}

const NUMBER = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?(?![\w$])/y;
const SPACE = /\s+/y;
const PUNCTUATION = /[{}()[\];,.@#\\]/y;

const RULES: Readonly<Record<string, readonly Rule[]>> = {
  js: [
    [SPACE, undefined],
    [/\/\/.*/y, 'comment'],
    [/\/\*[\s\S]*?(?:\*\/|$(?![\s\S]))/y, 'comment'],
    [/`(?:\\[\s\S]|[^\\`])*`?/y, 'string'],
    [/"(?:\\.|[^"\\\n])*"?/y, 'string'],
    [/'(?:\\.|[^'\\\n])*'?/y, 'string'],
    [/@[A-Za-z_$][\w$]*/y, 'meta'],
    [NUMBER, 'number'],
    [/[A-Za-z_$][\w$]*/y, cLikeWord(JS_KEYWORDS, JS_CONSTANTS, JS_TYPES, true)],
    [/=>|\.\.\.|[+\-*/%=<>!&|^~?:]+/y, 'operator'],
    [PUNCTUATION, 'punctuation'],
  ],
  json: [
    [SPACE, undefined],
    [/\/\/.*/y, 'comment'],
    [/\/\*[\s\S]*?(?:\*\/|$(?![\s\S]))/y, 'comment'],
    [/"(?:\\.|[^"\\\n])*"?(?=\s*:)/y, 'variable'],
    [/"(?:\\.|[^"\\\n])*"?/y, 'string'],
    [/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y, 'number'],
    [/true|false|null/y, 'number'],
    [/[{}[\],:]/y, 'punctuation'],
  ],
  python: [
    [SPACE, undefined],
    [/#.*/y, 'comment'],
    [/[rRbBuUfF]{0,2}("""|''')[\s\S]*?(?:\1|$(?![\s\S]))/y, 'string'],
    [/[rRbBuUfF]{0,2}"(?:\\.|[^"\\\n])*"?/y, 'string'],
    [/[rRbBuUfF]{0,2}'(?:\\.|[^'\\\n])*'?/y, 'string'],
    [/@[A-Za-z_][\w.]*/y, 'meta'],
    [NUMBER, 'number'],
    [/[A-Za-z_][\w]*/y, (text, rest) => {
      if (PY_KEYWORDS.has(text)) return 'keyword';
      if (PY_CONSTANTS.has(text)) return 'number';
      if (text === 'self' || text === 'cls') return 'variable';
      if (calls(rest)) return 'function';
      if (/^[A-Z][A-Za-z0-9_]*[a-z]/.test(text)) return 'type';
      return undefined;
    }],
    [/->|\*\*|\/\/|[+\-*/%=<>!&|^~:]+/y, 'operator'],
    [PUNCTUATION, 'punctuation'],
  ],
  bash: [
    [/[ \t]+/y, undefined],
    [/\n/y, undefined],
    [/(?:^|(?<=[\s;|&(]))#.*/my, 'comment'],
    [/"(?:\\[\s\S]|[^"\\])*"?/y, 'string'],
    [/'[^']*'?/y, 'string'],
    [/\$(?:\{[^}\n]*\}?|[A-Za-z_][\w]*|[0-9#?@*!$-])/y, 'variable'],
    [/(?:^|(?<=\s))--?[A-Za-z0-9][\w-]*/my, 'meta'],
    [/[0-9]+(?![\w.])/y, 'number'],
    [/[A-Za-z_][\w.-]*/y, (text, rest) => {
      if (SH_KEYWORDS.has(text)) return 'keyword';
      if (SH_BUILTINS.has(text)) return 'function';
      if (/^\s*\(\s*\)/.test(rest)) return 'function';
      return undefined;
    }],
    [/[|&;<>]+|\$\(|[()]/y, 'operator'],
    [/[=[\]{}\\]/y, 'punctuation'],
  ],
  css: [
    [SPACE, undefined],
    [/\/\*[\s\S]*?(?:\*\/|$(?![\s\S]))/y, 'comment'],
    [/"(?:\\.|[^"\\\n])*"?/y, 'string'],
    [/'(?:\\.|[^'\\\n])*'?/y, 'string'],
    [/@[\w-]+/y, 'keyword'],
    [/!important/y, 'keyword'],
    [/#[\da-fA-F]{3,8}(?![\w-])/y, 'number'],
    [/-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?/y, 'number'],
    [/--?[A-Za-z_][\w-]*(?=\s*:)|[A-Za-z_][\w-]*(?=\s*:(?!:))/y, 'variable'],
    [/[A-Za-z_-][\w-]*(?=\()/y, 'function'],
    [/[.#]?[A-Za-z_][\w-]*/y, 'type'],
    [/[{}();,:>+~*[\]=]/y, 'punctuation'],
  ],
  sql: [
    [SPACE, undefined],
    [/--.*/y, 'comment'],
    [/\/\*[\s\S]*?(?:\*\/|$(?![\s\S]))/y, 'comment'],
    [/'(?:''|[^'])*'?/y, 'string'],
    [/"(?:""|[^"])*"?/y, 'variable'],
    [NUMBER, 'number'],
    [/[A-Za-z_][\w]*/y, (text, rest) => {
      const lower = text.toLowerCase();
      if (SQL_KEYWORDS.has(lower)) return 'keyword';
      if (SQL_TYPES.has(lower)) return 'type';
      if (lower === 'true' || lower === 'false') return 'number';
      if (calls(rest)) return 'function';
      return undefined;
    }],
    [/[<>=!]+|[+\-*/%|]/y, 'operator'],
    [/[(),;.]/y, 'punctuation'],
  ],
};

/** Scan `code` by the rules of `language`. A character no rule matches is
 *  plain text. */
function tokenize(code: string, language: string): CodeToken[] {
  if (language === 'console') return consoleTokens(code);
  if (language === 'html') return markupTokens(code);
  if (language === 'markdown') return markdownTokens(code);
  const rules = RULES[language];
  if (!rules) return [{ text: code }];
  const out: CodeToken[] = [];
  const push = (text: string, token?: CodeTokenKind) => {
    const last = out[out.length - 1];
    if (last && last.token === token) last.text += text;
    else out.push(token ? { text, token } : { text });
  };
  let at = 0;
  while (at < code.length) {
    let matched = false;
    for (const [re, kind] of rules) {
      re.lastIndex = at;
      const m = re.exec(code);
      if (!m || m[0].length === 0) continue;
      const text = m[0];
      const k = typeof kind === 'function' ? kind(text, code.slice(at + text.length, at + text.length + 64)) : kind;
      push(text, k);
      at += text.length;
      matched = true;
      break;
    }
    if (!matched) {
      push(code[at]!, undefined);
      at++;
    }
  }
  return out;
}

/** A shell session: a line opening with a prompt (`$ `, `% `, `# `, `> `,
 *  `>>> `, `PS …> `) is what the user typed, every other line is what the
 *  programs printed. */
function consoleTokens(code: string): CodeToken[] {
  const out: CodeToken[] = [];
  code.split('\n').forEach((line, i) => {
    if (i > 0) out.push({ text: '\n' });
    if (line.length === 0) return;
    const prompt = /^(?:\$|%|#|>|>>>|\.\.\.|PS [^>\n]*>|[\w.@-]+[:~][^$#\n]*[$#])(?: |$)/.exec(line);
    out.push({ text: line, token: prompt ? 'prompt' : 'output' });
  });
  return out;
}

/** HTML and XML: tags, attributes, their values, comments, entities. */
function markupTokens(code: string): CodeToken[] {
  const out: CodeToken[] = [];
  const push = (text: string, token?: CodeTokenKind) => { if (text) out.push(token ? { text, token } : { text }); };
  let at = 0;
  while (at < code.length) {
    if (code.startsWith('<!--', at)) {
      const end = code.indexOf('-->', at + 4);
      const stop = end < 0 ? code.length : end + 3;
      push(code.slice(at, stop), 'comment');
      at = stop;
      continue;
    }
    const open = /<[/!?]?[A-Za-z][\w:.-]*/y;
    open.lastIndex = at;
    const tag = open.exec(code);
    if (tag) {
      const lead = /^<[/!?]?/.exec(tag[0])![0];
      push(lead, 'punctuation');
      push(tag[0].slice(lead.length), lead === '<!' || lead === '<?' ? 'meta' : 'keyword');
      at += tag[0].length;
      // Attributes up to the tag's end.
      const attr = /\s+|[A-Za-z_:][\w:.-]*|=|"[^"]*"?|'[^']*'?|\/?>|\?>|[^\s>]/y;
      while (at < code.length) {
        attr.lastIndex = at;
        const m = attr.exec(code);
        if (!m) break;
        const t = m[0];
        if (/^\s/.test(t)) push(t);
        else if (t === '>' || t === '/>' || t === '?>') {
          push(t, 'punctuation');
          at += t.length;
          break;
        } else if (t === '=') push(t, 'operator');
        else if (t[0] === '"' || t[0] === "'") push(t, 'string');
        else if (/^[A-Za-z_:]/.test(t)) push(t, 'variable');
        else push(t, 'punctuation');
        at += t.length;
      }
      continue;
    }
    const entity = /&(?:#\d+|#x[\da-fA-F]+|[A-Za-z]+);/y;
    entity.lastIndex = at;
    const ent = entity.exec(code);
    if (ent) {
      push(ent[0], 'number');
      at += ent[0].length;
      continue;
    }
    const text = /[^<&]+|[<&]/y;
    text.lastIndex = at;
    const t = text.exec(code)![0];
    push(t);
    at += t.length;
  }
  return out;
}

/** Markdown: headings, fences, inline code, list and quote marks, links,
 *  emphasis marks. */
function markdownTokens(code: string): CodeToken[] {
  const out: CodeToken[] = [];
  let fenced = false;
  code.split('\n').forEach((line, i) => {
    if (i > 0) out.push({ text: '\n' });
    if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) {
      fenced = !fenced;
      out.push({ text: line, token: 'meta' });
      return;
    }
    if (fenced) {
      if (line) out.push({ text: line, token: 'string' });
      return;
    }
    if (/^\s{0,3}#{1,6}\s/.test(line)) {
      out.push({ text: line, token: 'keyword' });
      return;
    }
    const lead = /^(\s*)(?:([-*+]|\d+[.)])(\s+)|(>)(\s?))?/.exec(line)!;
    if (lead[1]) out.push({ text: lead[1] });
    const mark = lead[2] ?? lead[4];
    if (mark) {
      out.push({ text: mark, token: lead[4] ? 'comment' : 'punctuation' });
      const gap = lead[3] ?? lead[5];
      if (gap) out.push({ text: gap });
    }
    let rest = line.slice(lead[0].length);
    const inline = /(`[^`]+`)|(!?\[[^\]]*\]\([^)]*\))|(\*\*|__|\*|_)/;
    while (rest.length > 0) {
      const m = inline.exec(rest);
      if (!m) {
        out.push({ text: rest });
        break;
      }
      if (m.index > 0) out.push({ text: rest.slice(0, m.index) });
      out.push({ text: m[0], token: m[1] ? 'string' : m[2] ? 'function' : 'operator' });
      rest = rest.slice(m.index + m[0].length);
    }
  });
  return out;
}

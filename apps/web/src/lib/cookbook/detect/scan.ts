// A lexical scan of the pen's JavaScript: strings, comments, regex
// literals, bracket matching and line lookup.

// ─── A small JavaScript scanner ─────────────────────────────────────────────

export interface JsLiteral {
  kind: "string" | "template" | "regex";
  /** Offsets of the whole literal, delimiters included. */
  start: number;
  end: number;
  /** The literal's text without delimiters; template expressions become "\u0000". */
  text: string;
}

export interface JsScan {
  /** The source with comments blanked (newlines kept, offsets unchanged). */
  code: string;
  /** Also with the insides of strings, templates and regexes blanked. */
  bare: string;
  literals: JsLiteral[];
  comments: { start: number; end: number; text: string }[];
}

const REGEX_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do",
  "else", "await", "yield",
]);

/** Splits JavaScript into code, comments and literals, well enough for
 *  pens: strings, nested template literals and regex literals (told apart
 *  from division by the previous token). */
export function scanJs(src: string): JsScan {
  const code = src.split("");
  const bare = src.split("");
  const literals: JsLiteral[] = [];
  const comments: JsScan["comments"] = [];
  const n = src.length;
  // The previous significant token: "" at the start, "id:<word>", "num", "lit" or a punctuator.
  let prev = "";

  const blank = (chars: string[], from: number, to: number) => {
    for (let k = from; k < to; k++) if (chars[k] !== "\n") chars[k] = " ";
  };

  const regexAllowed = () => {
    if (prev === "") return true;
    if (prev.startsWith("id:")) return REGEX_KEYWORDS.has(prev.slice(3));
    return !(prev === "num" || prev === "lit" || prev === ")" || prev === "]" || prev === "}");
  };

  function scanString(start: number): number {
    const quote = src[start];
    let i = start + 1;
    let text = "";
    while (i < n && src[i] !== quote && src[i] !== "\n") {
      if (src[i] === "\\" && i + 1 < n) {
        text += src[i + 1];
        i += 2;
      } else text += src[i++];
    }
    const end = Math.min(i + 1, n);
    blank(bare, start + 1, end - 1);
    literals.push({ kind: "string", start, end, text });
    prev = "lit";
    return end;
  }

  function scanTemplate(start: number): number {
    let i = start + 1;
    let text = "";
    let quasiStart = i;
    while (i < n && src[i] !== "`") {
      if (src[i] === "\\" && i + 1 < n) {
        text += src.slice(i, i + 2);
        i += 2;
      } else if (src[i] === "$" && src[i + 1] === "{") {
        blank(bare, quasiStart, i);
        text += "\u0000";
        i = scanCode(i + 2, true);
        quasiStart = i;
      } else text += src[i++];
    }
    blank(bare, quasiStart, i);
    const end = Math.min(i + 1, n);
    literals.push({ kind: "template", start, end, text });
    prev = "lit";
    return end;
  }

  function scanRegex(start: number): number {
    let i = start + 1;
    let inClass = false;
    while (i < n && src[i] !== "\n") {
      const c = src[i];
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) break;
      i++;
    }
    const body = src.slice(start + 1, i);
    blank(bare, start + 1, i);
    i++;
    while (i < n && /[a-z]/i.test(src[i])) i++;
    literals.push({ kind: "regex", start, end: i, text: body });
    prev = "lit";
    return i;
  }

  /** Scans code from `i`; with `untilBrace`, stops after the `}` that closes
   *  a template expression and returns the offset after it. */
  function scanCode(start: number, untilBrace: boolean): number {
    let i = start;
    let depth = 0;
    while (i < n) {
      const c = src[i];
      const next = src[i + 1];
      if (c === "/" && next === "/") {
        let j = i;
        while (j < n && src[j] !== "\n") j++;
        comments.push({ start: i, end: j, text: src.slice(i, j) });
        blank(code, i, j);
        blank(bare, i, j);
        i = j;
      } else if (c === "/" && next === "*") {
        const close = src.indexOf("*/", i + 2);
        const j = close === -1 ? n : close + 2;
        comments.push({ start: i, end: j, text: src.slice(i, j) });
        blank(code, i, j);
        blank(bare, i, j);
        i = j;
      } else if (c === "'" || c === '"') {
        i = scanString(i);
      } else if (c === "`") {
        i = scanTemplate(i);
      } else if (c === "/" && regexAllowed()) {
        i = scanRegex(i);
      } else if (/[A-Za-z_$]/.test(c)) {
        let j = i + 1;
        while (j < n && /[\w$]/.test(src[j])) j++;
        prev = `id:${src.slice(i, j)}`;
        i = j;
      } else if (/[0-9]/.test(c)) {
        let j = i + 1;
        while (j < n && /[\w.]/.test(src[j])) j++;
        prev = "num";
        i = j;
      } else if (/\s/.test(c)) {
        i++;
      } else {
        if (c === "{") depth++;
        else if (c === "}") {
          if (untilBrace && depth === 0) {
            prev = "}";
            return i + 1;
          }
          depth--;
        }
        prev = c;
        i++;
      }
    }
    return i;
  }

  scanCode(0, false);
  return { code: code.join(""), bare: bare.join(""), literals, comments };
}

/** The offset of the bracket that closes the one at `open`, counting
 *  brackets in `bare` (comments and literal contents blanked); -1 if none. */
export function matchBracket(bare: string, open: number): number {
  let depth = 0;
  for (let i = open; i < bare.length; i++) {
    const c = bare[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 1-based line of an offset. */
export function lineAt(src: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src.charCodeAt(i) === 10) line++;
  return line;
}

/** A fast `lineAt` for many lookups in the same source. */
export function lineLookup(src: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

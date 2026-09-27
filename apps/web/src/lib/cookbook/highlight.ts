/**
 * Syntax highlighting for the recipe page's code (the whole recipe, the
 * short answer, excerpts and variation diffs), rendered on the server. A
 * token coloured by both themes carries two short classes, one per theme's
 * palette (`hl3 hd7`), whose rules `highlightCss()` writes once per page;
 * the page switches with html.dark / html.light without a second pass. A
 * token with anything else (italic, bold) keeps the themes as inline CSS
 * variables (`--shiki-light`, `--shiki-dark`, plus font-style variants).
 * Classes keep a 700-line recipe's markup (and its RSC copy) a third of the
 * size of inline styles.
 *
 * Server-only. Memoised per process.
 */
import { createHighlighter, type Highlighter } from "shiki";

export type HighlightLang = "js" | "html" | "css" | "markdown" | "json" | "diff";
const LANGS: HighlightLang[] = ["js", "html", "css", "markdown", "json", "diff"];
export const HIGHLIGHT_THEMES = { light: "github-light", dark: "github-dark" } as const;

export interface HighlightToken {
  content: string;
  /** Palette classes of both themes, e.g. `"hl5 hd5"` (see `highlightCss`). */
  className?: string;
  /** CSS custom properties for a React `style` prop, e.g. `{ "--shiki-light": "#D73A49", "--shiki-dark": "#F97583" }`,
   *  when the token carries more than colours. */
  style?: Record<string, string>;
}

export type HighlightedLine = HighlightToken[];

let highlighter: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighter ??= createHighlighter({ themes: Object.values(HIGHLIGHT_THEMES), langs: LANGS });
  return highlighter;
}

/** Each theme's foreground colours, sorted: a colour's index is its class. */
interface Palettes {
  light: string[];
  dark: string[];
}

let palettes: Palettes | null = null;

function themeColors(h: Highlighter, theme: string): string[] {
  const t = h.getTheme(theme);
  const colors = [t.fg, ...t.settings.map((rule) => rule.settings?.foreground)];
  return [...new Set(colors.filter((c): c is string => typeof c === "string").map((c) => c.toUpperCase()))].sort();
}

function getPalettes(h: Highlighter): Palettes {
  palettes ??= { light: themeColors(h, HIGHLIGHT_THEMES.light), dark: themeColors(h, HIGHLIGHT_THEMES.dark) };
  return palettes;
}

/** `hl<i> hd<j>` for a token coloured by both themes and nothing else. */
function paletteClass(style: Record<string, string>, p: Palettes): string | undefined {
  const keys = Object.keys(style);
  if (keys.length !== 2 || !style["--shiki-light"] || !style["--shiki-dark"]) return undefined;
  const l = p.light.indexOf(style["--shiki-light"].toUpperCase());
  const d = p.dark.indexOf(style["--shiki-dark"].toUpperCase());
  return l < 0 || d < 0 ? undefined : `hl${l} hd${d}`;
}

/** The palette classes' rules: the dark theme by default, the light one
 *  under html.light (as the site's theme classes work). Rendered once by
 *  every page that shows highlighted code. */
export async function highlightCss(): Promise<string> {
  const p = getPalettes(await getHighlighter());
  const scope = ".docs-content .cb-code";
  return [
    ...p.dark.map((color, i) => `${scope} .hd${i}{color:${color}}`),
    ...p.light.map((color, i) => `:root.light ${scope} .hl${i}{color:${color}}`),
  ].join("\n");
}

const MEMO_LIMIT = 400;
const memo = new Map<string, HighlightedLine[]>();

function sameStyle(a?: Record<string, string>, b?: Record<string, string>): boolean {
  const ka = Object.keys(a ?? {});
  if (ka.length !== Object.keys(b ?? {}).length) return false;
  return ka.every((key) => a?.[key] === b?.[key]);
}

/** Lines of tokens; adjacent tokens of the same colours (and whitespace)
 *  are merged to keep the DOM small. */
export async function highlightLines(code: string, lang: HighlightLang): Promise<HighlightedLine[]> {
  const key = `${lang}\u0000${code}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const h = await getHighlighter();
  const p = getPalettes(h);
  const { tokens } = h.codeToTokens(code, { lang, themes: HIGHLIGHT_THEMES, defaultColor: false });
  const lines = tokens.map((line) => {
    const merged: { content: string; style?: Record<string, string> }[] = [];
    for (const token of line) {
      const style = token.htmlStyle && Object.keys(token.htmlStyle).length ? { ...token.htmlStyle } : undefined;
      const last = merged[merged.length - 1];
      // Whitespace shows no colour, so it joins the previous token.
      if (last && (sameStyle(last.style, style) || !token.content.trim())) last.content += token.content;
      else merged.push(style ? { content: token.content, style } : { content: token.content });
    }
    return merged.map((token): HighlightToken => {
      if (!token.style) return { content: token.content };
      const className = paletteClass(token.style, p);
      return className ? { content: token.content, className } : token;
    });
  });
  if (memo.size >= MEMO_LIMIT) memo.delete(memo.keys().next().value as string);
  memo.set(key, lines);
  return lines;
}

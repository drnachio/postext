/**
 * The site's code colours: GitHub's light and dark shiki themes with every
 * token colour moved (hue kept, lightness only) until it reaches 7:1 on all
 * the surfaces code sits on (WCAG 1.4.6). Shared by the docs MDX pipeline
 * and the Cookbook highlighter, so both render the same palette.
 */
import githubDark from "shiki/themes/github-dark.mjs";
import githubLight from "shiki/themes/github-light.mjs";
import type { ThemeRegistrationRaw } from "shiki";

/** Code surfaces per theme (globals.css: surface, surface-2, elevated,
 *  background). */
const SURFACES = {
  dark: ["#1c1f26", "#242832", "#20232b", "#15171c"],
  light: ["#f4f2ec", "#ebe8df", "#ffffff", "#fdfcf9"],
} as const;

const TARGET = 7;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

type Lab = [number, number, number];
function toOklab(hex: string): Lab {
  const [r, g, b] = channels(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function fromOklab([L, a, b]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    "#" +
    rgb
      .map((c) => {
        const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
        return Math.round(Math.min(1, Math.max(0, v)) * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

/** `color` (any #rgb / #rrggbb / #rrggbbaa) raised to 7:1 on `surfaces`;
 *  alpha is dropped, since a translucent token cannot promise a ratio. */
export function aaaColor(color: string, surfaces: readonly string[]): string {
  let hex = color.trim().toLowerCase();
  if (/^#[0-9a-f]{3,4}$/.test(hex)) hex = "#" + [...hex.slice(1, 4)].map((c) => c + c).join("");
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) return color;
  hex = hex.slice(0, 7);
  const worst = (c: string) => Math.min(...surfaces.map((s) => ratio(c, s)));
  if (worst(hex) >= TARGET) return hex;
  const lab = toOklab(hex);
  const lighten = luminance(surfaces[0]) < 0.18;
  for (let i = 1; i < 400; i++) {
    const c = fromOklab([lab[0] + (lighten ? 1 : -1) * i * 0.0025, lab[1] * (1 - i * 0.0005), lab[2] * (1 - i * 0.0005)]);
    if (worst(c) >= TARGET) return c;
  }
  return lighten ? "#ffffff" : "#000000";
}

function raise(theme: ThemeRegistrationRaw, name: string, surfaces: readonly string[]): ThemeRegistrationRaw {
  const tokenColors = (theme.tokenColors ?? theme.settings ?? []).map((rule) =>
    rule.settings?.foreground
      ? { ...rule, settings: { ...rule.settings, foreground: aaaColor(rule.settings.foreground, surfaces) } }
      : rule,
  );
  const colors = { ...(theme.colors ?? {}) };
  if (colors["editor.foreground"]) colors["editor.foreground"] = aaaColor(colors["editor.foreground"], surfaces);
  const { settings: _settings, ...rest } = theme;
  return {
    ...rest,
    name,
    colors,
    tokenColors,
    settings: tokenColors,
    ...(theme.fg ? { fg: aaaColor(theme.fg, surfaces) } : {}),
  };
}

export const CODE_THEME_DARK = raise(githubDark as ThemeRegistrationRaw, "github-dark-aaa", SURFACES.dark);
export const CODE_THEME_LIGHT = raise(githubLight as ThemeRegistrationRaw, "github-light-aaa", SURFACES.light);

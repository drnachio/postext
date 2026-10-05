// Static TTF cuts of the brand faces for next/og (Satori reads TTF/OTF,
// not WOFF2): Fraunces 800 for display, Fraunces 600 italic for accents,
// Geist 600 for kickers, Lora italic for leads.
const FRAUNCES_800_URL =
  "https://fonts.gstatic.com/s/fraunces/v38/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58njr1a03gg7S2nfgRYIcNxyjDg.ttf";
// Italic 600 at SOFT 100 / WONK 1, the hero's gilt accent word.
const FRAUNCES_600_ITALIC_URL =
  "https://fonts.gstatic.com/s/fraunces/v38/6NVf8FyLNQOQZAnv9ZwNjucMHVn85Ni7emDWtFKqZTnbB-gzTK0KVBdJdt9vIVYX9G37lod_sPEKsxx664UJf1iVSv7W.ttf";
const GEIST_600_URL = "https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RQuQ4nQ.ttf";
const LORA_ITALIC_URL = "https://fonts.gstatic.com/s/lora/v37/0QI8MX1D_JOuMw_hLdO6T2wV9KnW-MoFkqg.ttf";

const load = (url: string) => fetch(url).then((res) => res.arrayBuffer());

async function fetchOgFonts() {
  const [fraunces, frauncesItalic, geist, lora] = await Promise.all([
    load(FRAUNCES_800_URL),
    load(FRAUNCES_600_ITALIC_URL),
    load(GEIST_600_URL),
    load(LORA_ITALIC_URL),
  ]);
  return [
    { name: "Fraunces", data: fraunces, weight: 800 as const, style: "normal" as const },
    { name: "Fraunces", data: frauncesItalic, weight: 600 as const, style: "italic" as const },
    { name: "Geist", data: geist, weight: 600 as const, style: "normal" as const },
    { name: "Lora", data: lora, weight: 400 as const, style: "italic" as const },
  ];
}

let ogFonts: ReturnType<typeof fetchOgFonts> | null = null;

/** The four cuts, fetched once per process: a build renders a card per
 *  page and locale (every recipe included), which would otherwise mean
 *  hundreds of identical downloads. A failed fetch is not cached. */
export function loadOgFonts() {
  if (!ogFonts) {
    ogFonts = fetchOgFonts();
    ogFonts.catch(() => {
      ogFonts = null;
    });
  }
  return ogFonts;
}

/** Fraunces 800 alone, for the icons. */
export async function loadMarkFont() {
  return [{ name: "Fraunces", data: await load(FRAUNCES_800_URL), weight: 800 as const, style: "normal" as const }];
}

// ─── Chinese and Japanese ───────────────────────────────────────────────────
// The brand cuts have no Chinese or Japanese glyphs. A card with Chinese
// text gets Noto Serif SC (with Fraunces and Lora) and Noto Sans SC (with
// Geist); a text with kana gets Noto Serif JP and Noto Sans JP instead, so
// its kanji take their Japanese forms (直, 骨, 角 differ). Each is cut by
// Google Fonts' `text=` parameter to exactly the characters it draws: a
// whole face is about 10 MB per weight, a card's subset a few kilobytes.

export const CJK_SERIF = "Noto Serif SC";
export const CJK_SANS = "Noto Sans SC";
export const JA_SERIF = "Noto Serif JP";
export const JA_SANS = "Noto Sans JP";

type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: Weight;
  style: "normal" | "italic";
}

/** Han characters, kana (with ー, ・ and the small kana), CJK punctuation
 *  and the full-width and half-width forms (，：（）ｶﾅ). */
const CJK_CHAR = /[\p{Script=Han}⺀-⿟　-〿\u3040-\u30FF\u31F0-\u31FF＀-￯]/gu;

/** Hiragana or katakana (half-width included): a text that holds any is
 *  Japanese. Kanji alone cannot tell Japanese from Chinese, and are drawn
 *  in the Chinese faces. */
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** The distinct Chinese and Japanese characters of a text, in code point
 *  order ("" when none). */
export function cjkChars(text: string | undefined): string {
  return [...new Set(text?.match(CJK_CHAR) ?? [])].sort().join("");
}

/** The CJK face a text is drawn in, serif or sans: the Japanese one when
 *  it holds kana, the Simplified Chinese one otherwise. */
export function cjkFamily(text: string | undefined, kind: "serif" | "sans"): string {
  const japanese = !!text && KANA.test(text);
  if (kind === "serif") return japanese ? JA_SERIF : CJK_SERIF;
  return japanese ? JA_SANS : CJK_SANS;
}

/** Google Fonts sends TTF to an old Safari and WOFF2 to anything newer,
 *  which Satori cannot read. */
const TTF_AGENT =
  "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";
const FETCH_TIMEOUT_MS = 10_000;

async function googleSubset(family: string, weight: Weight, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(url, { headers: { "User-Agent": TTF_AGENT }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!css.ok) throw new Error(`${family} ${weight}: HTTP ${css.status}`);
  const src = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(await css.text())?.[1];
  if (!src) throw new Error(`${family} ${weight}: no TTF in the stylesheet`);
  const res = await fetch(src, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${family} ${weight}: HTTP ${res.status}`);
  return res.arrayBuffer();
}

/** Subsets by family, weight and characters: a build renders the same
 *  kicker and the same site titles on many cards. */
const cjkCuts = new Map<string, Promise<OgFont | null>>();

/** One subset, or null when it cannot be fetched: the card then renders
 *  with the Latin cuts (and Satori's own fallback), never failing the
 *  build. A failure is not cached, so the next card tries again. */
function cjkCut(name: string, weight: Weight, text: string): Promise<OgFont | null> {
  const key = `${name}|${weight}|${text}`;
  let cut = cjkCuts.get(key);
  if (!cut) {
    cut = googleSubset(name, weight, text).then(
      (data): OgFont => ({ name, data, weight, style: "normal" }),
      (error: unknown) => {
        cjkCuts.delete(key);
        console.warn(`og: no ${name} for this card (${(error as Error).message}); drawing it with the Latin fonts`);
        return null;
      },
    );
    cjkCuts.set(key, cut);
  }
  return cut;
}

/** The CJK cuts a card needs, for the characters of each of its texts:
 *  the title in Noto Serif SC or JP 900 (by Fraunces 800), the lead in
 *  Noto Serif SC or JP 400 (by Lora) and the kicker in Noto Sans SC or JP
 *  600 (by Geist), each text in the face `cjkFamily` picks for it. Empty
 *  when the card has no Chinese or Japanese. */
export async function loadCjkOgFonts(texts: { display?: string; lead?: string; kicker?: string }): Promise<OgFont[]> {
  const wanted: [string, Weight, string][] = [
    [cjkFamily(texts.display, "serif"), 900, cjkChars(texts.display)],
    [cjkFamily(texts.lead, "serif"), 400, cjkChars(texts.lead)],
    [cjkFamily(texts.kicker, "sans"), 600, cjkChars(texts.kicker)],
  ];
  const cuts = await Promise.all(wanted.filter(([, , text]) => text).map(([name, weight, text]) => cjkCut(name, weight, text)));
  return cuts.filter((cut): cut is OgFont => cut !== null);
}

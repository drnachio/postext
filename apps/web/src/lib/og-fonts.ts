// Static TTF cuts of the brand faces for next/og (Satori reads TTF/OTF,
// not WOFF2): Fraunces 800 for display, Fraunces 600 italic for accents,
// Geist 600 for kickers, Lora italic for leads.
const FRAUNCES_800_URL =
  "https://fonts.gstatic.com/s/fraunces/v38/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58njr1a03gg7S2nfgRYIcNxyjDg.ttf";
const GEIST_600_URL = "https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RQuQ4nQ.ttf";
const LORA_ITALIC_URL = "https://fonts.gstatic.com/s/lora/v37/0QI8MX1D_JOuMw_hLdO6T2wV9KnW-MoFkqg.ttf";

const load = (url: string) => fetch(url).then((res) => res.arrayBuffer());

export async function loadOgFonts() {
  const [fraunces, geist, lora] = await Promise.all([load(FRAUNCES_800_URL), load(GEIST_600_URL), load(LORA_ITALIC_URL)]);
  return [
    { name: "Fraunces", data: fraunces, weight: 800 as const, style: "normal" as const },
    { name: "Geist", data: geist, weight: 600 as const, style: "normal" as const },
    { name: "Lora", data: lora, weight: 400 as const, style: "italic" as const },
  ];
}

/** Fraunces 800 alone, for the icons. */
export async function loadMarkFont() {
  return [{ name: "Fraunces", data: await load(FRAUNCES_800_URL), weight: 800 as const, style: "normal" as const }];
}

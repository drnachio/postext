const CORMORANT_GARAMOND_700_URL =
  "https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_hg9GnM.ttf";

const FRAUNCES_SEMIBOLD_URL =
  "https://fonts.gstatic.com/s/fraunces/v38/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Wa0K7iN7hzFUPJH58nib1603gg7S2nfgRYIcaRyjDg.ttf";

export async function loadOgFonts() {
  const [cormorantData, frauncesData] = await Promise.all([
    fetch(CORMORANT_GARAMOND_700_URL).then((res) => res.arrayBuffer()),
    fetch(FRAUNCES_SEMIBOLD_URL).then((res) => res.arrayBuffer()),
  ]);

  return [
    { name: "Cormorant Garamond", data: cormorantData, weight: 700 as const },
    { name: "Fraunces", data: frauncesData, weight: 600 as const },
  ];
}

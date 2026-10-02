import { resolveFolioConfig, type FolioConfig, type FolioPaperConfig, type ResolvedFolioConfig } from "postext";

export type ResolvedPaper = ResolvedFolioConfig["paper"];

/** What the renderer needs to know about a sheet of paper. */
export interface PaperSpec {
  paper: ResolvedPaper;
  /** Thickness of one leaf (one sheet, two pages), mm. */
  caliperMm: number;
  /** How wide the leaf rolls as it turns, against a 90 g/m² offset leaf. */
  roll: number;
  /** 0 bends freely … 1 turns as a rigid plate (board). */
  rigidity: number;
  /** 0 … 1: how much of the print on the other side shows through. */
  showThrough: number;
  /** Opacity (ISO 2471 style, 0 … 1). */
  opacity: number;
  /** The page follows the hand this much per frame (heavier = later). */
  follow: number;
  /** Angular frequency (rad/ms) of the spring that settles a leaf let go. */
  spring: number;
  /** PBR surface. */
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  /** Fibre sheen of uncoated stock. */
  sheen: number;
}

/** Light absorbed per g/m² (Kubelka–Munk style), by stock: fillers make
 *  bible paper opaque for its weight; groundwood makes newsprint so too. */
const OPACITY_K: Record<ResolvedPaper["type"], number> = {
  uncoated: 0.031,
  bookWove: 0.035,
  coatedMatte: 0.028,
  coatedSilk: 0.028,
  coatedGloss: 0.028,
  bible: 0.041,
  newsprint: 0.047,
  cardStock: 0.03,
  board: 0.03,
};

/** The reference leaf: 90 g/m² × 1.25 cm³/g. */
const REF_CALIPER_UM = 112.5;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * A paper's behaviour from its stock. Caliper = grammage × bulk. Bending
 * stiffness grows with the cube of the caliper and the leaf's weight with
 * the caliper, so the length over which a leaf bends under its own weight
 * (the elastica's ℓ = (EI / ρg)^⅓) grows as caliper^⅔: that scales the
 * roll a turning leaf makes. Well past card weight the leaf no longer
 * bends at all. Opacity follows 1 − e^(−k·grammage).
 */
export function paperSpec(paper: ResolvedPaper): PaperSpec {
  const caliperUm = paper.grammage * paper.bulk;
  const ratio = Math.pow(caliperUm / REF_CALIPER_UM, 2 / 3);
  const opacity = 1 - Math.exp(-OPACITY_K[paper.type] * paper.grammage);
  const finish = paper.finish;
  return {
    paper,
    caliperMm: caliperUm / 1000,
    roll: Math.min(6, Math.max(0.45, ratio)),
    rigidity: smooth(1.3, 4, ratio),
    opacity,
    showThrough: paper.showThrough ? Math.min(0.4, (1 - opacity) * 1.25) : 0,
    follow: 0.35 / (1 + 0.35 * Math.max(0, Math.log(ratio))),
    spring: 0.0085 * Math.min(1.6, Math.max(0.75, Math.sqrt(ratio))),
    roughness: finish === "gloss" ? 0.32 : finish === "silk" ? 0.5 : finish === "matte" ? 0.7 : 0.88,
    clearcoat: finish === "gloss" ? 1 : finish === "silk" ? 0.45 : finish === "matte" ? 0.12 : 0,
    clearcoatRoughness: finish === "gloss" ? 0.06 : finish === "silk" ? 0.28 : 0.6,
    sheen: finish === "uncoated" ? 0.35 : 0,
  };
}

/** The paper of a page: the book's, with the page's own stock over it (a
 *  page that names a stock takes that stock's defaults, not the book's). */
export function pagePaper(book: FolioConfig | undefined, own: FolioPaperConfig | undefined): ResolvedPaper {
  if (!own) return resolveFolioConfig(book).paper;
  const base = own.type ? {} : book?.paper ?? {};
  return resolveFolioConfig({ paper: { ...base, ...own } }).paper;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

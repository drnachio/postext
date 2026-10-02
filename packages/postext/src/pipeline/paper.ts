import type { ContentBlock, DirectiveAttrs } from '../parse/types';
import type {
  ColorPaletteEntry,
  ColorValue,
  FolioPaperConfig,
  FolioPaperFinish,
  FolioPaperTexture,
  FolioPaperType,
} from '../types';

/** The stocks `:::paper{type=…}` accepts (see {@link FolioPaperType}). */
const PAPER_TYPES: ReadonlySet<string> = new Set<FolioPaperType>([
  'uncoated', 'bookWove', 'coatedMatte', 'coatedSilk', 'coatedGloss', 'bible', 'newsprint', 'cardStock', 'board',
]);
const PAPER_FINISHES: ReadonlySet<string> = new Set<FolioPaperFinish>(['auto', 'uncoated', 'matte', 'silk', 'gloss']);
const PAPER_TEXTURES: ReadonlySet<string> = new Set<FolioPaperTexture>(['auto', 'smooth', 'vellum', 'wove', 'laid', 'linen', 'felt']);

/** An attribute of a `:::paper` fence the engine could not read. */
export interface PaperAttributeIssue {
  key: string;
  value: string;
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function positiveNumber(raw: string): number | undefined {
  const n = Number(raw.trim());
  return raw.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined;
}

function shadeOf(raw: string, palette: readonly ColorPaletteEntry[] | undefined): ColorValue | undefined {
  const v = raw.trim();
  if (HEX_RE.test(v)) {
    const hex = v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
    return { hex: hex.toLowerCase(), model: 'hex' };
  }
  const entry = palette?.find((e) => e.id === v);
  return entry ? { hex: entry.value.hex, model: entry.value.model, paletteId: entry.id } : undefined;
}

/**
 * The paper stock a `:::paper{…}` fence names, as the partial
 * {@link FolioPaperConfig} it writes (unset fields follow the document's
 * `folio.paper` and the stock), and the attributes it could not read:
 * an unknown stock, finish or texture, a weight, bulk or texture strength
 * that is not a positive number (`textureStrength` may be 0 … 2), a shade
 * that is neither a `#rgb` / `#rrggbb` hex nor a palette entry id, a
 * `showThrough` other than `true` / `false`, and any other key.
 */
export function parsePaperAttrs(
  attrs: DirectiveAttrs | undefined,
  palette?: readonly ColorPaletteEntry[],
): { paper: FolioPaperConfig; issues: PaperAttributeIssue[] } {
  const paper: FolioPaperConfig = {};
  const issues: PaperAttributeIssue[] = [];
  for (const [key, value] of Object.entries(attrs ?? {})) {
    const v = value.trim();
    switch (key) {
      case 'id':
        break;
      case 'type':
        if (PAPER_TYPES.has(v)) paper.type = v as FolioPaperType;
        else issues.push({ key, value });
        break;
      case 'finish':
        if (PAPER_FINISHES.has(v)) paper.finish = v as FolioPaperFinish;
        else issues.push({ key, value });
        break;
      case 'texture':
        if (PAPER_TEXTURES.has(v)) paper.texture = v as FolioPaperTexture;
        else issues.push({ key, value });
        break;
      case 'grammage':
      case 'bulk': {
        const n = positiveNumber(v);
        if (n !== undefined) paper[key] = n;
        else issues.push({ key, value });
        break;
      }
      case 'textureStrength': {
        const n = Number(v);
        if (v !== '' && Number.isFinite(n) && n >= 0 && n <= 2) paper.textureStrength = n;
        else issues.push({ key, value });
        break;
      }
      case 'shade': {
        const shade = shadeOf(v, palette);
        if (shade) paper.shade = shade;
        else issues.push({ key, value });
        break;
      }
      case 'showThrough':
        // A bare `showThrough` flag reads as true.
        if (v === '' || v === 'true') paper.showThrough = true;
        else if (v === 'false') paper.showThrough = false;
        else issues.push({ key, value });
        break;
      default:
        issues.push({ key, value });
    }
  }
  return { paper, issues };
}

/**
 * The paper every content block is printed on: the merged config of the
 * `:::paper` containers around it (an inner fence's fields over the outer
 * one's), `undefined` outside any. Indexed like `blocks`; the fence
 * markers themselves carry the paper they open or close.
 */
export function paperByBlock(
  blocks: readonly ContentBlock[],
  palette?: readonly ColorPaletteEntry[],
): (FolioPaperConfig | undefined)[] {
  const out: (FolioPaperConfig | undefined)[] = new Array(blocks.length);
  const stack: { id: number | undefined; paper: FolioPaperConfig }[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'containerStart' && b.containerName === 'paper') {
      const outer = stack[stack.length - 1]?.paper;
      stack.push({ id: b.containerId, paper: { ...outer, ...parsePaperAttrs(b.containerAttrs, palette).paper } });
      out[i] = stack[stack.length - 1]!.paper;
      continue;
    }
    if (b.type === 'containerEnd' && b.containerName === 'paper') {
      out[i] = stack[stack.length - 1]?.paper;
      const at = stack.findIndex((s) => s.id === b.containerId);
      if (at >= 0) stack.length = at;
      continue;
    }
    out[i] = stack[stack.length - 1]?.paper;
  }
  return out;
}

/** A laid-out block, by the source block it comes from. */
interface IndexedBlock {
  contentIndex?: number;
}
interface PaperPage {
  columns: readonly { blocks: readonly IndexedBlock[] }[];
  floats?: readonly IndexedBlock[];
  paper?: FolioPaperConfig;
}

/** The paper of the first block of `blocks` that names its source block;
 *  `null` when none does. */
function firstPaper(
  blocks: readonly IndexedBlock[] | undefined,
  byBlock: readonly (FolioPaperConfig | undefined)[],
): FolioPaperConfig | undefined | null {
  for (const b of blocks ?? []) {
    if (b.contentIndex !== undefined) return byBlock[b.contentIndex];
  }
  return null;
}

/**
 * Stamps `page.paper` on the pages set with content from inside a
 * `:::paper` container (see {@link paperByBlock}). A run starts and ends on
 * a page boundary, so a page's first block decides — its column flow
 * first, then its floats. A page with neither (a parity blank) between two
 * pages of the same run belongs to the run too: it is printed on the same
 * sheets. Pages outside every run are left without the key.
 */
export function stampPagePaper(
  pages: PaperPage[],
  byBlock: readonly (FolioPaperConfig | undefined)[],
): void {
  const found: (FolioPaperConfig | undefined | null)[] = pages.map((page) => {
    for (const col of page.columns) {
      const p = firstPaper(col.blocks, byBlock);
      if (p !== null) return p;
    }
    return firstPaper(page.floats, byBlock);
  });
  for (let i = 0; i < pages.length; i++) {
    let paper = found[i];
    if (paper === null) {
      let before: FolioPaperConfig | undefined | null = null;
      for (let j = i - 1; j >= 0 && before === null; j--) before = found[j]!;
      let after: FolioPaperConfig | undefined | null = null;
      for (let j = i + 1; j < pages.length && after === null; j++) after = found[j]!;
      paper = before && before === after ? before : undefined;
    }
    if (paper) pages[i]!.paper = { ...paper };
    else delete pages[i]!.paper;
  }
}

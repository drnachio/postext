import type {
  ColorValue,
  FolioConfig,
  FolioPaperFinish,
  FolioPaperTexture,
  FolioPaperType,
  ResolvedFolioConfig,
} from '../types';

const hex = (value: string): ColorValue => ({ hex: value, model: 'hex' });

/** A paper stock's trade defaults: weight (g/m²), bulk (cm³/g, so caliper
 *  µm = grammage × bulk), finish, surface texture and shade. */
export interface FolioPaperStock {
  grammage: number;
  bulk: number;
  finish: Exclude<FolioPaperFinish, 'auto'>;
  texture: Exclude<FolioPaperTexture, 'auto'>;
  shade: string;
}

/** Typical values for each stock, from mill data sheets: uncoated
 *  woodfree offset; bulky book wove in natural / cream (the Munken and
 *  Holmen Book kind); coated matte, silk and gloss (art) papers, thinner
 *  for their weight as the coating is calendered; bible (India) paper; and
 *  newsprint; cover card; and rigid board (about 2 mm). */
export const FOLIO_PAPER_STOCKS: Readonly<Record<FolioPaperType, FolioPaperStock>> = {
  uncoated: { grammage: 90, bulk: 1.25, finish: 'uncoated', texture: 'wove', shade: '#fcfbf8' },
  bookWove: { grammage: 80, bulk: 1.6, finish: 'uncoated', texture: 'wove', shade: '#f6efdc' },
  coatedMatte: { grammage: 115, bulk: 1.0, finish: 'matte', texture: 'smooth', shade: '#fdfdfc' },
  coatedSilk: { grammage: 115, bulk: 0.9, finish: 'silk', texture: 'smooth', shade: '#ffffff' },
  coatedGloss: { grammage: 115, bulk: 0.8, finish: 'gloss', texture: 'smooth', shade: '#ffffff' },
  bible: { grammage: 40, bulk: 1.1, finish: 'uncoated', texture: 'vellum', shade: '#f9f6ee' },
  newsprint: { grammage: 48, bulk: 1.5, finish: 'uncoated', texture: 'wove', shade: '#ebe7dc' },
  cardStock: { grammage: 250, bulk: 1.2, finish: 'uncoated', texture: 'vellum', shade: '#fbfaf6' },
  board: { grammage: 1250, bulk: 1.6, finish: 'silk', texture: 'smooth', shade: '#ffffff' },
};

export const DEFAULT_FOLIO_CONFIG: ResolvedFolioConfig = {
  tilt: 22,
  paper: {
    type: 'uncoated',
    grammage: FOLIO_PAPER_STOCKS.uncoated.grammage,
    bulk: FOLIO_PAPER_STOCKS.uncoated.bulk,
    finish: FOLIO_PAPER_STOCKS.uncoated.finish,
    texture: FOLIO_PAPER_STOCKS.uncoated.texture,
    textureStrength: 1,
    shade: hex(FOLIO_PAPER_STOCKS.uncoated.shade),
    showThrough: true,
  },
  binding: { type: 'hardcover', cover: 'case', coverMaterial: 'cloth', coverColor: hex('#2c3e57') },
  surface: { type: 'oak' },
  lighting: { environment: 'studio', intensity: 1, shadows: true },
};

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const finite = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

/** `config.folio` with every setting filled in: a paper's unset fields
 *  follow its stock, `auto` finishes and textures too, and the cover
 *  material follows the binding. */
export function resolveFolioConfig(partial?: FolioConfig): ResolvedFolioConfig {
  const d = DEFAULT_FOLIO_CONFIG;
  const paper = partial?.paper;
  const type = paper?.type && paper.type in FOLIO_PAPER_STOCKS ? paper.type : d.paper.type;
  const stock = FOLIO_PAPER_STOCKS[type];
  const binding = partial?.binding?.type ?? d.binding.type;
  const material = partial?.binding?.coverMaterial;
  return {
    tilt: finite(partial?.tilt) ? clamp(partial.tilt, 0, 40) : d.tilt,
    paper: {
      type,
      grammage: finite(paper?.grammage) && paper.grammage > 0 ? clamp(paper.grammage, 20, 2500) : stock.grammage,
      bulk: finite(paper?.bulk) && paper.bulk > 0 ? clamp(paper.bulk, 0.5, 3) : stock.bulk,
      finish: paper?.finish && paper.finish !== 'auto' ? paper.finish : stock.finish,
      texture: paper?.texture && paper.texture !== 'auto' ? paper.texture : stock.texture,
      textureStrength: finite(paper?.textureStrength) ? clamp(paper.textureStrength, 0, 2) : d.paper.textureStrength,
      shade: paper?.shade ?? hex(stock.shade),
      showThrough: paper?.showThrough ?? d.paper.showThrough,
    },
    binding: {
      type: binding,
      cover: partial?.binding?.cover === 'pages' ? 'pages' : 'case',
      coverMaterial: material && material !== 'auto' ? material : binding === 'hardcover' ? 'cloth' : 'paper',
      coverColor: partial?.binding?.coverColor ?? d.binding.coverColor,
    },
    surface: {
      type: partial?.surface?.type ?? d.surface.type,
      ...(partial?.surface?.color ? { color: partial.surface.color } : {}),
    },
    lighting: {
      environment: partial?.lighting?.environment ?? d.lighting.environment,
      intensity: finite(partial?.lighting?.intensity) ? clamp(partial.lighting.intensity, 0.25, 2) : d.lighting.intensity,
      shadows: partial?.lighting?.shadows ?? d.lighting.shadows,
    },
  };
}

const sameColor = (a: ColorValue | undefined, b: ColorValue) =>
  !!a && a.hex.toLowerCase() === b.hex.toLowerCase() && !a.paletteId;

/** `config.folio` without the settings equal to their defaults (a paper's
 *  against its stock's); undefined when nothing is left. */
export function stripFolioDefaults(folio?: FolioConfig): FolioConfig | undefined {
  if (!folio) return undefined;
  const d = DEFAULT_FOLIO_CONFIG;
  const result: FolioConfig = {};
  if (folio.tilt !== undefined && folio.tilt !== d.tilt) result.tilt = folio.tilt;

  if (folio.paper) {
    const type = folio.paper.type ?? d.paper.type;
    const stock = FOLIO_PAPER_STOCKS[type] ?? FOLIO_PAPER_STOCKS[d.paper.type];
    const p = folio.paper;
    const paper: NonNullable<FolioConfig['paper']> = {};
    if (p.type !== undefined && p.type !== d.paper.type) paper.type = p.type;
    if (p.grammage !== undefined && p.grammage !== stock.grammage) paper.grammage = p.grammage;
    if (p.bulk !== undefined && p.bulk !== stock.bulk) paper.bulk = p.bulk;
    if (p.finish !== undefined && p.finish !== 'auto' && p.finish !== stock.finish) paper.finish = p.finish;
    if (p.texture !== undefined && p.texture !== 'auto' && p.texture !== stock.texture) paper.texture = p.texture;
    if (p.textureStrength !== undefined && p.textureStrength !== d.paper.textureStrength) paper.textureStrength = p.textureStrength;
    if (p.shade !== undefined && !sameColor(p.shade, hex(stock.shade))) paper.shade = p.shade;
    if (p.showThrough !== undefined && p.showThrough !== d.paper.showThrough) paper.showThrough = p.showThrough;
    if (Object.keys(paper).length) result.paper = paper;
  }

  if (folio.binding) {
    const b = folio.binding;
    const binding: NonNullable<FolioConfig['binding']> = {};
    if (b.type !== undefined && b.type !== d.binding.type) binding.type = b.type;
    if (b.cover !== undefined && b.cover !== d.binding.cover) binding.cover = b.cover;
    if (b.coverMaterial !== undefined && b.coverMaterial !== 'auto') binding.coverMaterial = b.coverMaterial;
    if (b.coverColor !== undefined && !sameColor(b.coverColor, d.binding.coverColor)) binding.coverColor = b.coverColor;
    if (Object.keys(binding).length) result.binding = binding;
  }

  if (folio.surface) {
    const surface: NonNullable<FolioConfig['surface']> = {};
    if (folio.surface.type !== undefined && folio.surface.type !== d.surface.type) surface.type = folio.surface.type;
    if (folio.surface.color !== undefined) surface.color = folio.surface.color;
    if (Object.keys(surface).length) result.surface = surface;
  }

  if (folio.lighting) {
    const l = folio.lighting;
    const lighting: NonNullable<FolioConfig['lighting']> = {};
    if (l.environment !== undefined && l.environment !== d.lighting.environment) lighting.environment = l.environment;
    if (l.intensity !== undefined && l.intensity !== d.lighting.intensity) lighting.intensity = l.intensity;
    if (l.shadows !== undefined && l.shadows !== d.lighting.shadows) lighting.shadows = l.shadows;
    if (Object.keys(lighting).length) result.lighting = lighting;
  }

  return Object.keys(result).length ? result : undefined;
}

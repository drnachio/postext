/**
 * The templates the gallery ships with: a few book designs to start from.
 * They set the page, the type and the colours (and, for the two-colour
 * book, the print settings); their typefaces are Google Fonts, so they
 * carry no files. After them, the composition conventions: a language's
 * typesetting rules alone. Names and descriptions come from the labels.
 */

import type { ColorValue, PostextConfig } from 'postext';
import type { SandboxLabels } from '../../types/index.js';
import type { DesignPart } from './designTemplate.js';
import { COMPOSITION_CONVENTIONS } from './compositionConventions.js';

export interface BuiltinTemplate {
  id: string;
  nameKey: keyof SandboxLabels;
  descriptionKey: keyof SandboxLabels;
  parts: DesignPart[];
  config: PostextConfig;
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });
const cm = (value: number) => ({ value, unit: 'cm' as const });
const linked = (id: string, hex: string): ColorValue => ({ hex, model: 'hex', paletteId: id });

const NOVEL: PostextConfig = {
  page: {
    sizePreset: 'custom',
    width: cm(13),
    height: cm(20),
    margins: { top: mm(18), bottom: mm(22), left: mm(16), right: mm(20), mirror: true },
  },
  layout: { layoutType: 'single' },
  colorPalette: [{ id: 'ink', name: 'Ink', value: { hex: '#1c1b19', model: 'hex' } }],
  bodyText: {
    fontFamily: 'EB Garamond',
    fontSize: pt(11),
    lineHeight: pt(14.5),
    textAlign: 'justify',
    firstLineIndent: { value: 1, unit: 'em' },
    paragraphSpacing: false,
    color: linked('ink', '#1c1b19'),
  },
  headings: { fontFamily: 'EB Garamond', fontWeight: 400, textAlign: 'center', color: linked('ink', '#1c1b19') },
};

const MANUAL: PostextConfig = {
  page: {
    sizePreset: '17x24',
    margins: { top: mm(20), bottom: mm(22), left: mm(18), right: mm(18), mirror: true },
  },
  layout: { layoutType: 'oneAndHalf', gutterWidth: mm(6) },
  colorPalette: [
    { id: 'ink', name: 'Ink', value: { hex: '#1f2328', model: 'hex' } },
    { id: 'accent', name: 'Accent', value: { hex: '#00758f', model: 'hex' } },
  ],
  bodyText: {
    fontFamily: 'Source Serif 4',
    fontSize: pt(9.5),
    lineHeight: pt(13),
    textAlign: 'justify',
    color: linked('ink', '#1f2328'),
  },
  headings: { fontFamily: 'Inter', fontWeight: 700, textAlign: 'start', color: linked('accent', '#00758f') },
};

const MAGAZINE: PostextConfig = {
  page: {
    sizePreset: '21x28',
    margins: { top: mm(18), bottom: mm(20), left: mm(16), right: mm(16), mirror: true },
  },
  layout: { layoutType: 'double', gutterWidth: mm(5) },
  colorPalette: [
    { id: 'ink', name: 'Ink', value: { hex: '#16171a', model: 'hex' } },
    { id: 'accent', name: 'Accent', value: { hex: '#c0452f', model: 'hex' } },
  ],
  bodyText: {
    fontFamily: 'Lora',
    fontSize: pt(9.4),
    lineHeight: pt(13.6),
    textAlign: 'justify',
    color: linked('ink', '#16171a'),
  },
  headings: { fontFamily: 'Fraunces', fontWeight: 700, textAlign: 'start', color: linked('accent', '#c0452f') },
};

/** Black and one Pantone: running text in black, headings, accents and
 *  diagrams on the spot ink's plate, written as PDF/X-4. */
const PANTONE_286: ColorValue = { hex: '#1f3f99', model: 'spot', spot: { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } } };
const TWO_COLOUR: PostextConfig = {
  page: {
    sizePreset: '17x24',
    margins: { top: mm(20), bottom: mm(24), left: mm(18), right: mm(22), mirror: true },
    cutLines: { enabled: true, bleed: mm(3) },
  },
  layout: { layoutType: 'single' },
  colorPalette: [
    { id: 'ink', name: 'Black', value: { hex: '#000000', model: 'cmyk', cmyk: { c: 0, m: 0, y: 0, k: 100 } } },
    { id: 'spot', name: 'PANTONE 286 C', value: PANTONE_286 },
    { id: 'spot-20', name: 'PANTONE 286 C 20 %', value: { hex: '#d3dbee', model: 'spot', spot: { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 }, tint: 20 } } },
  ],
  bodyText: {
    fontFamily: 'Literata',
    fontSize: pt(10),
    lineHeight: pt(14),
    textAlign: 'justify',
    color: { hex: '#000000', model: 'cmyk', paletteId: 'ink' },
  },
  headings: { fontFamily: 'Literata', fontWeight: 600, textAlign: 'start', color: { ...PANTONE_286, paletteId: 'spot' } },
  diagramStyle: { singleInk: true, inkColor: { ...PANTONE_286, paletteId: 'spot' } },
  print: { standard: 'pdfx4' },
};

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [
  { id: 'builtin-novel', nameKey: 'designTemplateNovel', descriptionKey: 'designTemplateNovelDescription', parts: ['page', 'typography', 'colors'], config: NOVEL },
  { id: 'builtin-manual', nameKey: 'designTemplateManual', descriptionKey: 'designTemplateManualDescription', parts: ['page', 'typography', 'colors'], config: MANUAL },
  { id: 'builtin-magazine', nameKey: 'designTemplateMagazine', descriptionKey: 'designTemplateMagazineDescription', parts: ['page', 'typography', 'colors'], config: MAGAZINE },
  { id: 'builtin-two-colour', nameKey: 'designTemplateTwoColour', descriptionKey: 'designTemplateTwoColourDescription', parts: ['page', 'typography', 'colors', 'print'], config: TWO_COLOUR },
  ...COMPOSITION_CONVENTIONS.map(({ id, nameKey, descriptionKey, config }): BuiltinTemplate => ({ id, nameKey, descriptionKey, parts: ['composition'], config })),
];

// The stand-in for a textbook's page 8 (#855's fixture, in the engine's
// tests: a composed page of a tabbed title, running text and three boxes
// with their photos), laid out for the EPUB tests (#862). The fixture is
// read from the engine's tests as it is, outside this package's sources
// (a dynamic import the compiler does not follow); here its photo of the
// spending box becomes a `:::figure` with labels, and the photos get
// alternative text.

import fs from 'node:fs';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, VDTDocument } from 'postext';
import { fontPx } from './fontPx.js';

class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string) {
    const size = Number(fontPx(this.font)?.[1] ?? 16);
    return {
      width: [...s].length * size * 0.5,
      actualBoundingBoxAscent: size * 0.7,
      actualBoundingBoxDescent: size * 0.2,
      fontBoundingBoxAscent: size * 0.8,
      fontBoundingBoxDescent: size * 0.2,
    };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

export type Page8Locale = 'es' | 'en';

interface Page8Fixture {
  markdown: string;
  config: PostextConfig;
  resources: Resource[];
}

const FIXTURES = new URL('../../../postext/src/__tests__/composed/fixtures/', import.meta.url);

/** The labels of the spending photo, in the order written. */
export const PAGE8_LABELS: Record<Page8Locale, string[]> = {
  es: ['Alquiler', 'Luz', 'Comida'],
  en: ['Rent', 'Electricity', 'Food'],
};

const ALT: Record<Page8Locale, Record<string, string>> = {
  es: {
    'foto-dinero': 'Una mano paga con una tarjeta en una tienda',
    'foto-gasto': 'Una familia con la cesta de la compra',
    'foto-ahorro': 'Una hucha junto a unas monedas',
  },
  en: {
    'foto-dinero': 'A hand paying with a card in a shop',
    'foto-gasto': 'A family with a shopping basket',
    'foto-ahorro': 'A piggy bank beside some coins',
  },
};

/** The fixture's Markdown with the spending photo set as a `:::figure`
 *  carrying three labels. */
function withLabels(markdown: string, locale: Page8Locale): string {
  const [rent, light, food] = PAGE8_LABELS[locale];
  const figure = [
    ':::figure{resource="foto-gasto" slot="gasto-fotos"}',
    `::label[${rent}]{at="20% 30%"}`,
    `::label[${light}]{at="70% 25%"}`,
    `::label[${food}]{at="50% 80%"}`,
    ':::',
  ].join('\n');
  const line = '::resource{id="foto-gasto" slot="gasto-fotos"}';
  if (!markdown.includes(line)) throw new Error('page 8 fixture changed: no spending photo line');
  return markdown.replace(line, figure);
}

/** The page 8 stand-in, laid out (`markdown` is the source with labels). */
export async function page8Book(locale: Page8Locale): Promise<{ doc: VDTDocument; markdown: string }> {
  const { page8Fixture } = (await import(/* @vite-ignore */ new URL('page8.ts', FIXTURES).href)) as { page8Fixture: (l: Page8Locale) => Page8Fixture };
  const fixture = page8Fixture(locale);
  const markdown = withLabels(fixture.markdown, locale);
  const resources = fixture.resources.map((r) => (ALT[locale][r.id] ? { ...r, altText: ALT[locale][r.id] } : r));
  const doc = buildDocument({ markdown, metadata: { title: locale === 'es' ? 'El dinero' : 'Money', author: 'Postext' }, resources }, fixture.config);
  return { doc, markdown };
}

/** The fixture's pictures (solid placeholders), by file id. */
export function page8Bytes(fileId: string): { bytes: Uint8Array; mediaType: string } | undefined {
  const file = new URL(`page8/${fileId}`, FIXTURES);
  return fs.existsSync(file) ? { bytes: new Uint8Array(fs.readFileSync(file)), mediaType: 'image/png' } : undefined;
}

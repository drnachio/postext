import { extractToc, getDocSource } from "@/lib/docs";

/** The six capability cards of the home page's chapter 2, in display order.
 *  Each entry expects a `<key>Title` and `<key>Description` pair in the
 *  `Features` namespace of both message files. */
export const FEATURE_KEYS = ["justification", "resources", "tables", "singleInk", "math", "output"] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Where each card is explained in the docs: the doc slug and the text of the
 *  section heading in every locale. The anchor is derived from the heading
 *  with the same slugger the doc page uses, so it survives accents and
 *  punctuation; a renamed heading fails `featureDocPath` loudly (and the unit
 *  test) instead of shipping a dead fragment. */
const FEATURE_DOCS: Record<FeatureKey, { slug: string; heading: Record<string, string> }> = {
  justification: {
    slug: "justification",
    heading: { en: "Knuth-Plass: Seeing the Whole Paragraph", es: "Knuth-Plass: ver el párrafo completo" },
  },
  resources: {
    slug: "document-format",
    heading: { en: "Resources", es: "Recursos" },
  },
  tables: {
    slug: "configuration",
    heading: { en: "Table style", es: "Estilo de tablas" },
  },
  singleInk: {
    slug: "configuration",
    heading: { en: "Diagram style", es: "Estilo de diagramas" },
  },
  math: {
    slug: "document-format",
    heading: { en: "Mathematical formulas", es: "Fórmulas matemáticas" },
  },
  output: {
    slug: "architecture",
    heading: { en: "Backend Interface", es: "Interfaz del backend" },
  },
};

/** Locale-less docs path (`/docs/<slug>#<anchor>`) of the section that
 *  explains a capability card. */
export function featureDocPath(key: FeatureKey, locale: string): string {
  const { slug, heading } = FEATURE_DOCS[key];
  const text = heading[locale] ?? heading.en;
  const doc = getDocSource(slug, locale) ?? getDocSource(slug, "en");
  const item = doc && extractToc(doc.source).find((i) => i.text === text);
  if (!item) throw new Error(`featureDocPath: no "${text}" heading in docs/${slug}-${locale}.mdx`);
  return `/docs/${slug}#${item.id}`;
}

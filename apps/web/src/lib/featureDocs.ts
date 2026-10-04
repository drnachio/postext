import { docAnchorPath } from "@/lib/cookbook/docLinks";
import type { DocAnchor, Locale } from "@/lib/cookbook/types";
import { siteLocale } from "@/i18n/locales";

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
const FEATURE_DOCS: Record<FeatureKey, DocAnchor> = {
  justification: {
    slug: "justification",
    heading: { en: "Knuth-Plass: Seeing the Whole Paragraph", es: "Knuth-Plass: ver el párrafo completo", ca: "Knuth-Plass: veure el paràgraf sencer", zh: "Knuth-Plass：通观整个段落" },
  },
  resources: {
    slug: "document-format",
    heading: { en: "Resources", es: "Recursos", ca: "Recursos", zh: "资源" },
  },
  tables: {
    slug: "configuration",
    heading: { en: "Table style", es: "Estilo de tablas", ca: "Estil de taules", zh: "表格样式" },
  },
  singleInk: {
    slug: "configuration",
    heading: { en: "Diagram style", es: "Estilo de diagramas", ca: "Estil dels diagrames", zh: "图示样式" },
  },
  math: {
    slug: "document-format",
    heading: { en: "Mathematical formulas", es: "Fórmulas matemáticas", ca: "Fórmules matemàtiques", zh: "数学公式" },
  },
  output: {
    slug: "architecture",
    heading: { en: "Backend Interface", es: "Interfaz del backend", ca: "Interfície del backend", zh: "后端接口" },
  },
};

/** Locale-less docs path (`/docs/<slug>#<anchor>`) of the section that
 *  explains a capability card. */
export function featureDocPath(key: FeatureKey, locale: string): string {
  const anchor = FEATURE_DOCS[key];
  // Unknown locales fall back to the English doc.
  const lang: Locale = siteLocale(locale);
  const path = docAnchorPath(anchor, lang);
  if (!path) {
    const text = anchor.heading[lang];
    throw new Error(`featureDocPath: no "${text}" heading in docs/${anchor.slug}-${locale}.mdx`);
  }
  return path;
}

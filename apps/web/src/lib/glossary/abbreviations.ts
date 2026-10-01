/**
 * The abbreviations the site's prose uses, with their expansion in each
 * locale (WCAG 3.1.4). The docs and Cookbook pipelines wrap the first
 * occurrence on a page in `<abbr title="…">` (rehypeAbbr.ts); the glossary
 * lists them all, which covers pages whose text comes from the messages.
 *
 * Isomorphic: no Node or React imports.
 */
import type { SiteLocale } from "@/i18n/locales";

export interface Abbreviation {
  /** Stable anchor on the glossary page: `abbr-<id>`. */
  id: string;
  /** The written form, matched case-sensitively as a whole word. */
  abbr: string;
  /** Other spellings of the same abbreviation in one locale (RGPD for GDPR). */
  forms?: Partial<Record<SiteLocale, string[]>>;
  /** Also matched with a plural "s" (PDFs, APIs). */
  plural?: boolean;
  expansion: Record<SiteLocale, string>;
}

export const ABBREVIATIONS: readonly Abbreviation[] = [
  { id: "api", abbr: "API", plural: true, expansion: { en: "application programming interface", es: "interfaz de programación de aplicaciones", zh: "应用程序编程接口" } },
  { id: "apa", abbr: "APA", expansion: { en: "American Psychological Association (a citation style)", es: "American Psychological Association (un estilo de citas)", zh: "美国心理学会（一种引文格式）" } },
  { id: "ascii", abbr: "ASCII", expansion: { en: "American Standard Code for Information Interchange", es: "American Standard Code for Information Interchange, código estándar estadounidense para el intercambio de información", zh: "美国信息交换标准代码" } },
  { id: "ast", abbr: "AST", plural: true, expansion: { en: "abstract syntax tree", es: "árbol de sintaxis abstracta", zh: "抽象语法树" } },
  { id: "bcp", abbr: "BCP", expansion: { en: "Best Current Practice (BCP 47 defines language tags)", es: "Best Current Practice (la BCP 47 define las etiquetas de idioma)", zh: "最佳现行实践（BCP 47 规定语言标签）" } },
  { id: "cdn", abbr: "CDN", plural: true, expansion: { en: "content delivery network", es: "red de distribución de contenidos", zh: "内容分发网络" } },
  { id: "cff", abbr: "CFF", expansion: { en: "Compact Font Format", es: "Compact Font Format, formato compacto de fuentes", zh: "紧凑字体格式" } },
  { id: "cjk", abbr: "CJK", expansion: { en: "Chinese, Japanese and Korean", es: "chino, japonés y coreano", zh: "中文、日文和韩文" } },
  { id: "cldr", abbr: "CLDR", expansion: { en: "Unicode Common Locale Data Repository", es: "Common Locale Data Repository de Unicode, el repositorio de datos regionales", zh: "Unicode 通用区域数据库" } },
  { id: "cli", abbr: "CLI", expansion: { en: "command-line interface", es: "interfaz de línea de órdenes", zh: "命令行界面" } },
  { id: "clreq", abbr: "clreq", expansion: { en: "Requirements for Chinese Text Layout (W3C)", es: "Requirements for Chinese Text Layout, requisitos de composición del texto chino (W3C)", zh: "中文排版需求（W3C）" } },
  { id: "cm", abbr: "cm", expansion: { en: "centimetres", es: "centímetros", zh: "厘米" } },
  { id: "cmyk", abbr: "CMYK", expansion: { en: "cyan, magenta, yellow and black (key), the four process inks", es: "cian, magenta, amarillo y negro, las cuatro tintas de cuatricromía", zh: "青、品红、黄、黑，印刷四色" } },
  { id: "cors", abbr: "CORS", expansion: { en: "cross-origin resource sharing", es: "intercambio de recursos entre orígenes", zh: "跨源资源共享" } },
  { id: "css", abbr: "CSS", expansion: { en: "Cascading Style Sheets", es: "Cascading Style Sheets, hojas de estilo en cascada", zh: "层叠样式表" } },
  { id: "csv", abbr: "CSV", expansion: { en: "comma-separated values", es: "valores separados por comas", zh: "逗号分隔值" } },
  { id: "din", abbr: "DIN", expansion: { en: "Deutsches Institut für Normung, the German standards body", es: "Deutsches Institut für Normung, el organismo alemán de normalización", zh: "德国标准化学会" } },
  { id: "docx", abbr: "DOCX", expansion: { en: "Word document (Office Open XML)", es: "documento de Word (Office Open XML)", zh: "Word 文档（Office Open XML）" } },
  { id: "dom", abbr: "DOM", expansion: { en: "Document Object Model, the browser's tree of a page", es: "Document Object Model, el árbol con que el navegador representa la página", zh: "文档对象模型，浏览器中页面的节点树" } },
  { id: "dpi", abbr: "DPI", expansion: { en: "dots per inch", es: "puntos por pulgada", zh: "每英寸点数" } },
  { id: "eea", abbr: "EEA", expansion: { en: "European Environment Agency", es: "Agencia Europea de Medio Ambiente", zh: "欧洲环境署" } },
  { id: "eg", abbr: "e.g.", expansion: { en: "for example", es: "por ejemplo", zh: "例如" } },
  { id: "epub", abbr: "EPUB", expansion: { en: "electronic publication, the standard e-book format", es: "publicación electrónica, el formato estándar de libro electrónico", zh: "电子出版物，标准电子书格式" } },
  { id: "esm", abbr: "ESM", expansion: { en: "ECMAScript modules", es: "módulos ECMAScript", zh: "ECMAScript 模块" } },
  { id: "gb-t", abbr: "GB/T", expansion: { en: "recommended national standard of China (Guobiao tuijian)", es: "norma nacional recomendada de China (Guobiao tuijian)", zh: "推荐性国家标准" } },
  { id: "gdp", abbr: "GDP", expansion: { en: "gross domestic product", es: "producto interior bruto", zh: "国内生产总值" } },
  { id: "gdpr", abbr: "GDPR", forms: { es: ["RGPD"] }, expansion: { en: "General Data Protection Regulation (EU)", es: "Reglamento General de Protección de Datos (UE)", zh: "《通用数据保护条例》（欧盟）" } },
  { id: "gfm", abbr: "GFM", expansion: { en: "GitHub Flavored Markdown", es: "GitHub Flavored Markdown, la variante de Markdown de GitHub", zh: "GitHub 风格的 Markdown" } },
  { id: "gif", abbr: "GIF", plural: true, expansion: { en: "Graphics Interchange Format", es: "Graphics Interchange Format, formato de intercambio de gráficos", zh: "图形交换格式" } },
  { id: "gpu", abbr: "GPU", expansion: { en: "graphics processing unit", es: "unidad de procesamiento gráfico", zh: "图形处理器" } },
  { id: "html", abbr: "HTML", expansion: { en: "HyperText Markup Language", es: "HyperText Markup Language, lenguaje de marcado de hipertexto", zh: "超文本标记语言" } },
  { id: "http", abbr: "HTTP", expansion: { en: "Hypertext Transfer Protocol", es: "Hypertext Transfer Protocol, protocolo de transferencia de hipertexto", zh: "超文本传输协议" } },
  { id: "icc", abbr: "ICC", expansion: { en: "International Color Consortium (colour profiles)", es: "International Color Consortium (perfiles de color)", zh: "国际色彩联盟（色彩配置文件）" } },
  { id: "idml", abbr: "IDML", expansion: { en: "InDesign Markup Language", es: "InDesign Markup Language, el formato de intercambio de InDesign", zh: "InDesign 标记语言" } },
  { id: "ie", abbr: "i.e.", expansion: { en: "that is", es: "es decir", zh: "即" } },
  { id: "isbn", abbr: "ISBN", expansion: { en: "International Standard Book Number", es: "International Standard Book Number, número internacional normalizado del libro", zh: "国际标准书号" } },
  { id: "jats", abbr: "JATS", expansion: { en: "Journal Article Tag Suite", es: "Journal Article Tag Suite, el formato XML de artículos científicos", zh: "期刊文章标签集" } },
  { id: "jlreq", abbr: "JLREQ", expansion: { en: "Requirements for Japanese Text Layout (W3C)", es: "Requirements for Japanese Text Layout, requisitos de composición del texto japonés (W3C)", zh: "日文排版需求（W3C）" } },
  { id: "jpeg", abbr: "JPEG", expansion: { en: "Joint Photographic Experts Group, the photo image format", es: "Joint Photographic Experts Group, el formato de imagen fotográfica", zh: "联合图像专家组，常用的照片图像格式" } },
  { id: "json", abbr: "JSON", expansion: { en: "JavaScript Object Notation", es: "JavaScript Object Notation, notación de objetos de JavaScript", zh: "JavaScript 对象表示法" } },
  { id: "jsx", abbr: "JSX", expansion: { en: "JavaScript XML, the tag syntax of React", es: "JavaScript XML, la sintaxis de etiquetas de React", zh: "JavaScript XML，React 的标签语法" } },
  { id: "klreq", abbr: "KLREQ", expansion: { en: "Requirements for Hangul Text Layout (W3C)", es: "Requirements for Hangul Text Layout, requisitos de composición del texto coreano (W3C)", zh: "韩文排版需求（W3C）" } },
  { id: "kp", abbr: "KP", expansion: { en: "Knuth–Plass, the line-breaking algorithm", es: "Knuth-Plass, el algoritmo de corte de líneas", zh: "Knuth-Plass 断行算法" } },
  { id: "llm", abbr: "LLM", plural: true, expansion: { en: "large language model", es: "modelo de lenguaje de gran tamaño", zh: "大语言模型" } },
  { id: "mdx", abbr: "MDX", expansion: { en: "Markdown with JSX components", es: "Markdown con componentes JSX", zh: "可嵌入 JSX 组件的 Markdown" } },
  { id: "mit", abbr: "MIT", expansion: { en: "Massachusetts Institute of Technology, which wrote the MIT License", es: "Massachusetts Institute of Technology, origen de la licencia MIT", zh: "麻省理工学院，MIT 许可证出自该校" } },
  { id: "mm", abbr: "mm", expansion: { en: "millimetres", es: "milímetros", zh: "毫米" } },
  { id: "npm", abbr: "npm", expansion: { en: "the Node.js package registry and its command-line client", es: "el registro de paquetes de Node.js y su cliente de línea de órdenes", zh: "Node.js 包注册表及其命令行客户端" } },
  { id: "ocr", abbr: "OCR", expansion: { en: "optical character recognition", es: "reconocimiento óptico de caracteres", zh: "光学字符识别" } },
  { id: "odt", abbr: "ODT", expansion: { en: "OpenDocument text document", es: "documento de texto OpenDocument", zh: "OpenDocument 文本文档" } },
  { id: "ofl", abbr: "OFL", expansion: { en: "SIL Open Font License", es: "SIL Open Font License, licencia abierta de fuentes", zh: "SIL 开放字体许可证" } },
  { id: "otf", abbr: "OTF", expansion: { en: "OpenType font file", es: "archivo de fuente OpenType", zh: "OpenType 字体文件" } },
  { id: "pdf", abbr: "PDF", plural: true, expansion: { en: "Portable Document Format", es: "Portable Document Format, formato de documento portátil", zh: "便携式文档格式" } },
  { id: "pdf-ua", abbr: "PDF/UA", expansion: { en: "PDF/Universal Accessibility, the ISO 14289 standard for accessible PDF", es: "PDF/Universal Accessibility, la norma ISO 14289 de PDF accesible", zh: "PDF/通用无障碍，无障碍 PDF 的 ISO 14289 标准" } },
  { id: "pdf-x", abbr: "PDF/X", expansion: { en: "the ISO 15930 family of PDF standards for print exchange", es: "la familia de normas ISO 15930 de PDF para imprenta", zh: "用于印刷交换的 ISO 15930 系列 PDF 标准" } },
  { id: "png", abbr: "PNG", plural: true, expansion: { en: "Portable Network Graphics", es: "Portable Network Graphics, formato de imagen sin pérdida", zh: "便携式网络图形" } },
  { id: "pptx", abbr: "PPTX", expansion: { en: "PowerPoint presentation (Office Open XML)", es: "presentación de PowerPoint (Office Open XML)", zh: "PowerPoint 演示文稿（Office Open XML）" } },
  { id: "pt", abbr: "pt", expansion: { en: "points (1/72 inch)", es: "puntos (1/72 de pulgada)", zh: "点（1/72 英寸）" } },
  { id: "px", abbr: "px", expansion: { en: "CSS pixels", es: "píxeles CSS", zh: "CSS 像素" } },
  { id: "rae", abbr: "RAE", expansion: { en: "Real Academia Española", es: "Real Academia Española", zh: "西班牙皇家语言学院" } },
  { id: "rgb", abbr: "RGB", expansion: { en: "red, green and blue, the screen colour channels", es: "rojo, verde y azul, los canales de color de la pantalla", zh: "红、绿、蓝，屏幕的颜色通道" } },
  { id: "roc", abbr: "ROC", expansion: { en: "Republic of China (Minguo calendar)", es: "República de China (calendario Minguo)", zh: "中华民国（民国纪年）" } },
  { id: "ssr", abbr: "SSR", expansion: { en: "server-side rendering", es: "renderizado en el servidor", zh: "服务器端渲染" } },
  { id: "svg", abbr: "SVG", plural: true, expansion: { en: "Scalable Vector Graphics", es: "Scalable Vector Graphics, gráficos vectoriales escalables", zh: "可缩放矢量图形" } },
  { id: "toc", abbr: "TOC", expansion: { en: "table of contents", es: "índice general (tabla de contenidos)", zh: "目录" } },
  { id: "tsv", abbr: "TSV", expansion: { en: "tab-separated values", es: "valores separados por tabuladores", zh: "制表符分隔值" } },
  { id: "ttf", abbr: "TTF", expansion: { en: "TrueType font file", es: "archivo de fuente TrueType", zh: "TrueType 字体文件" } },
  { id: "uax", abbr: "UAX", expansion: { en: "Unicode Standard Annex", es: "Unicode Standard Annex, anexo del estándar Unicode", zh: "Unicode 标准附件" } },
  { id: "ui", abbr: "UI", plural: true, expansion: { en: "user interface", es: "interfaz de usuario", zh: "用户界面" } },
  { id: "uri", abbr: "URI", plural: true, expansion: { en: "Uniform Resource Identifier", es: "Uniform Resource Identifier, identificador uniforme de recursos", zh: "统一资源标识符" } },
  { id: "url", abbr: "URL", plural: true, expansion: { en: "Uniform Resource Locator, a web address", es: "Uniform Resource Locator, una dirección web", zh: "统一资源定位符，即网址" } },
  { id: "utc", abbr: "UTC", expansion: { en: "Coordinated Universal Time", es: "tiempo universal coordinado", zh: "协调世界时" } },
  { id: "vdt", abbr: "VDT", expansion: { en: "Virtual Document Tree, Postext's laid-out document", es: "Virtual Document Tree, el documento maquetado de Postext", zh: "虚拟文档树，Postext 排好版的文档" } },
  { id: "w3c", abbr: "W3C", expansion: { en: "World Wide Web Consortium", es: "World Wide Web Consortium, el consorcio que publica los estándares web", zh: "万维网联盟" } },
  { id: "wai", abbr: "WAI", expansion: { en: "Web Accessibility Initiative (W3C)", es: "Web Accessibility Initiative, la iniciativa de accesibilidad web del W3C", zh: "W3C 网页无障碍倡议" } },
  { id: "wcag", abbr: "WCAG", expansion: { en: "Web Content Accessibility Guidelines", es: "Web Content Accessibility Guidelines, pautas de accesibilidad para el contenido web", zh: "网页内容无障碍指南" } },
  { id: "woff", abbr: "WOFF", expansion: { en: "Web Open Font Format", es: "Web Open Font Format, formato de fuentes para la web", zh: "Web 开放字体格式" } },
  { id: "woff2", abbr: "WOFF2", expansion: { en: "Web Open Font Format 2, compressed with Brotli", es: "Web Open Font Format 2, comprimido con Brotli", zh: "Web 开放字体格式 2，使用 Brotli 压缩" } },
  { id: "wysiwyg", abbr: "WYSIWYG", expansion: { en: "what you see is what you get", es: "what you see is what you get, lo que ves es lo que obtienes", zh: "所见即所得" } },
  { id: "xmp", abbr: "XMP", expansion: { en: "Extensible Metadata Platform", es: "Extensible Metadata Platform, plataforma de metadatos extensible", zh: "可扩展元数据平台" } },
  { id: "yaml", abbr: "YAML", expansion: { en: "YAML Ain't Markup Language, a plain-text data format", es: "YAML Ain't Markup Language, un formato de datos en texto plano", zh: "YAML 不是标记语言，一种纯文本数据格式" } },
  { id: "zip", abbr: "ZIP", expansion: { en: "a compressed archive format", es: "un formato de archivo comprimido", zh: "一种压缩归档格式" } },
];

export interface AbbreviationEntry {
  id: string;
  /** The form written on the page in this locale. */
  abbr: string;
  title: string;
}

/** The written forms of one locale, each mapped to its entry. */
export function abbreviationsFor(locale: string): Map<string, AbbreviationEntry> {
  const loc = (locale in ABBREVIATIONS[0]!.expansion ? locale : "en") as SiteLocale;
  const map = new Map<string, AbbreviationEntry>();
  for (const a of ABBREVIATIONS) {
    const title = a.expansion[loc];
    for (const form of [a.abbr, ...(a.forms?.[loc] ?? [])]) {
      map.set(form, { id: a.id, abbr: form, title });
      if (a.plural) map.set(`${form}s`, { id: a.id, abbr: form, title });
    }
  }
  return map;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** One regular expression for every written form of a locale, longest first
 *  (PDF/UA before PDF), as whole words: not inside a longer word, a number,
 *  a file name or a hyphenated identifier. */
export function abbreviationPattern(locale: string): RegExp {
  const forms = [...abbreviationsFor(locale).keys()].sort((a, b) => b.length - a.length);
  // A `.` before a form makes it a file extension (`file.pdf`); after a
  // form it ends the sentence and is allowed.
  // Latin letters only: Chinese text runs straight into an abbreviation
  // (生成PDF文件) and still counts as a word boundary.
  return new RegExp(`(?<![A-Za-z0-9\\u00C0-\\u024F_\\-./@#])(?:${forms.map(escape).join("|")})(?![A-Za-z0-9\\u00C0-\\u024F_\\-/@])`, "g");
}

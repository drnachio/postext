/**
 * Writes the designs the Sandbox ships (#1523) as design files, the
 * composition conventions (#1540) among them:
 *
 *   pnpm --filter web designs
 *
 * Each one goes to public/designs/<id>.postext, the same format as a
 * design the reader saves or imports, and the Sandbox reads them the same
 * way (the `designUrls` prop). Their typefaces are Google Fonts, so they
 * carry no font files. Names and descriptions are written in the ten site
 * languages. The files only change when this script or the engine's
 * design format does (a fixed date on every entry).
 *
 * Run by Node's type stripping: erasable TypeScript; needs the built
 * `postext` package (`pnpm --filter postext build`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMPOSITION_CONVENTIONS, extractDesign, type ColorValue, type DesignPart, type PostextConfig } from "postext";
import { createDesignBundle } from "postext/bundle";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../public/designs");
const MTIME = "2026-11-12T00:00:00Z";

const pt = (value: number) => ({ value, unit: "pt" as const });
const mm = (value: number) => ({ value, unit: "mm" as const });
const cm = (value: number) => ({ value, unit: "cm" as const });
const linked = (id: string, hex: string): ColorValue => ({ hex, model: "hex", paletteId: id });

const NOVEL: PostextConfig = {
  page: {
    sizePreset: "custom",
    width: cm(13),
    height: cm(20),
    margins: { top: mm(18), bottom: mm(22), left: mm(16), right: mm(20), mirror: true },
  },
  layout: { layoutType: "single" },
  colorPalette: [{ id: "ink", name: "Ink", value: { hex: "#1c1b19", model: "hex" } }],
  bodyText: {
    fontFamily: "EB Garamond",
    fontSize: pt(11),
    lineHeight: pt(14.5),
    textAlign: "justify",
    firstLineIndent: { value: 1, unit: "em" },
    paragraphSpacing: false,
    color: linked("ink", "#1c1b19"),
  },
  headings: { fontFamily: "EB Garamond", fontWeight: 400, textAlign: "center", color: linked("ink", "#1c1b19") },
};

const MANUAL: PostextConfig = {
  page: {
    sizePreset: "17x24",
    margins: { top: mm(20), bottom: mm(22), left: mm(18), right: mm(18), mirror: true },
  },
  layout: { layoutType: "oneAndHalf", gutterWidth: mm(6) },
  colorPalette: [
    { id: "ink", name: "Ink", value: { hex: "#1f2328", model: "hex" } },
    { id: "accent", name: "Accent", value: { hex: "#00758f", model: "hex" } },
  ],
  bodyText: { fontFamily: "Source Serif 4", fontSize: pt(9.5), lineHeight: pt(13), textAlign: "justify", color: linked("ink", "#1f2328") },
  headings: { fontFamily: "Inter", fontWeight: 700, textAlign: "start", color: linked("accent", "#00758f") },
};

const MAGAZINE: PostextConfig = {
  page: {
    sizePreset: "21x28",
    margins: { top: mm(18), bottom: mm(20), left: mm(16), right: mm(16), mirror: true },
  },
  layout: { layoutType: "double", gutterWidth: mm(5) },
  colorPalette: [
    { id: "ink", name: "Ink", value: { hex: "#16171a", model: "hex" } },
    { id: "accent", name: "Accent", value: { hex: "#c0452f", model: "hex" } },
  ],
  bodyText: { fontFamily: "Lora", fontSize: pt(9.4), lineHeight: pt(13.6), textAlign: "justify", color: linked("ink", "#16171a") },
  headings: { fontFamily: "Fraunces", fontWeight: 700, textAlign: "start", color: linked("accent", "#c0452f") },
};

/** Black and one Pantone: running text in black, headings and diagrams on
 *  the spot ink's plate, written as PDF/X-4 with bleed. */
const PANTONE_286: ColorValue = { hex: "#1f3f99", model: "spot", spot: { name: "PANTONE 286 C", cmyk: { c: 100, m: 66, y: 0, k: 2 } } };
const TWO_COLOUR: PostextConfig = {
  page: {
    sizePreset: "17x24",
    margins: { top: mm(20), bottom: mm(24), left: mm(18), right: mm(22), mirror: true },
    cutLines: { enabled: true, bleed: mm(3) },
  },
  layout: { layoutType: "single" },
  colorPalette: [
    { id: "ink", name: "Black", value: { hex: "#000000", model: "cmyk", cmyk: { c: 0, m: 0, y: 0, k: 100 } } },
    { id: "spot", name: "PANTONE 286 C", value: PANTONE_286 },
    { id: "spot-20", name: "PANTONE 286 C 20 %", value: { hex: "#d3dbee", model: "spot", spot: { name: "PANTONE 286 C", cmyk: { c: 100, m: 66, y: 0, k: 2 }, tint: 20 } } },
  ],
  bodyText: { fontFamily: "Literata", fontSize: pt(10), lineHeight: pt(14), textAlign: "justify", color: { hex: "#000000", model: "cmyk", paletteId: "ink" } },
  headings: { fontFamily: "Literata", fontWeight: 600, textAlign: "start", color: { ...PANTONE_286, paletteId: "spot" } },
  diagramStyle: { singleInk: true, inkColor: { ...PANTONE_286, paletteId: "spot" } },
  print: { standard: "pdfx4" },
};

type Names = Record<string, { name: string; description: string }>;

const NOVEL_NAMES: Names = {
  en: { name: "Novel", description: "13 × 20 cm, one column, justified Garamond with indents." },
  es: { name: "Novela", description: "13 × 20 cm, una columna, Garamond justificada con sangría." },
  ca: { name: "Novel·la", description: "13 × 20 cm, una columna, Garamond justificada amb sagnat." },
  de: { name: "Roman", description: "13 × 20 cm, einspaltig, Garamond im Blocksatz mit Einzügen." },
  fr: { name: "Roman", description: "13 × 20 cm, une colonne, Garamond justifié avec alinéas." },
  it: { name: "Romanzo", description: "13 × 20 cm, una colonna, Garamond giustificato con rientri." },
  pt: { name: "Romance", description: "13 × 20 cm, uma coluna, Garamond justificada com avanço." },
  ja: { name: "小説", description: "13 × 20 cm、1段組、字下げ付きのGaramond両端揃え。" },
  zh: { name: "小说", description: "13 × 20 cm，单栏，两端对齐并首行缩进的Garamond。" },
  ar: { name: "رواية", description: "13 × 20 سم، عمود واحد، خط Garamond مضبوط مع إزاحة أول السطر." },
};

const MANUAL_NAMES: Names = {
  en: { name: "Technical manual", description: "17 × 24 cm with a side column for notes; Source Serif and Inter." },
  es: { name: "Manual técnico", description: "17 × 24 cm con columna lateral para notas; Source Serif e Inter." },
  ca: { name: "Manual tècnic", description: "17 × 24 cm amb columna lateral per a notes; Source Serif i Inter." },
  de: { name: "Technisches Handbuch", description: "17 × 24 cm mit Randspalte für Anmerkungen; Source Serif und Inter." },
  fr: { name: "Manuel technique", description: "17 × 24 cm avec une colonne latérale pour les notes ; Source Serif et Inter." },
  it: { name: "Manuale tecnico", description: "17 × 24 cm con una colonna laterale per le note; Source Serif e Inter." },
  pt: { name: "Manual técnico", description: "17 × 24 cm com coluna lateral para notas; Source Serif e Inter." },
  ja: { name: "技術マニュアル", description: "17 × 24 cm、注用の側注欄付き。Source SerifとInter。" },
  zh: { name: "技术手册", description: "17 × 24 cm，带注释侧栏；Source Serif与Inter。" },
  ar: { name: "دليل تقني", description: "17 × 24 سم مع عمود جانبي للملاحظات؛ Source Serif وInter." },
};

const MAGAZINE_NAMES: Names = {
  en: { name: "Two-column magazine", description: "21 × 28 cm, two columns, Lora and Fraunces with a vermilion accent." },
  es: { name: "Revista a dos columnas", description: "21 × 28 cm, dos columnas, Lora y Fraunces con acento bermellón." },
  ca: { name: "Revista a dues columnes", description: "21 × 28 cm, dues columnes, Lora i Fraunces amb un accent vermelló." },
  de: { name: "Zweispaltiges Magazin", description: "21 × 28 cm, zweispaltig, Lora und Fraunces mit zinnoberrotem Akzent." },
  fr: { name: "Magazine à deux colonnes", description: "21 × 28 cm, deux colonnes, Lora et Fraunces avec une touche vermillon." },
  it: { name: "Rivista a due colonne", description: "21 × 28 cm, due colonne, Lora e Fraunces con un accento vermiglio." },
  pt: { name: "Revista a duas colunas", description: "21 × 28 cm, duas colunas, Lora e Fraunces com um destaque vermelhão." },
  ja: { name: "2段組の雑誌", description: "21 × 28 cm、2段組、LoraとFraunces、朱色のアクセント。" },
  zh: { name: "双栏杂志", description: "21 × 28 cm，双栏，Lora与Fraunces，朱红色点缀。" },
  ar: { name: "مجلة بعمودين", description: "21 × 28 سم، عمودان، Lora وFraunces مع لمسة قرمزية." },
};

const TWO_COLOUR_NAMES: Names = {
  en: { name: "Two-colour book", description: "Black and PANTONE 286 C: headings and diagrams on the spot plate, PDF/X-4 with 3 mm bleed." },
  es: { name: "Libro a dos tintas", description: "Negro y PANTONE 286 C: títulos y diagramas en la plancha de la tinta plana, PDF/X-4 con 3 mm de sangrado." },
  ca: { name: "Llibre a dues tintes", description: "Negre i PANTONE 286 C: títols i diagrames a la planxa de la tinta plana, PDF/X-4 amb 3 mm de sang." },
  de: { name: "Zweifarbiges Buch", description: "Schwarz und PANTONE 286 C: Überschriften und Diagramme auf der Sonderfarbenplatte, PDF/X-4 mit 3 mm Anschnitt." },
  fr: { name: "Livre en deux couleurs", description: "Noir et PANTONE 286 C : titres et schémas sur la plaque du ton direct, PDF/X-4 avec 3 mm de fond perdu." },
  it: { name: "Libro a due colori", description: "Nero e PANTONE 286 C: titoli e diagrammi sulla lastra della tinta piatta, PDF/X-4 con 3 mm di abbondanza." },
  pt: { name: "Livro a duas cores", description: "Preto e PANTONE 286 C: títulos e diagramas na chapa da cor especial, PDF/X-4 com 3 mm de sangria." },
  ja: { name: "2色刷りの本", description: "墨とPANTONE 286 C。見出しと図版は特色版、塗り足し3 mmのPDF/X-4。" },
  zh: { name: "双色书", description: "黑色与PANTONE 286 C：标题和图表使用专色印版，PDF/X-4，出血3 mm。" },
  ar: { name: "كتاب بلونين", description: "الأسود وPANTONE 286 C: العناوين والمخططات على لوح اللون الخاص، PDF/X-4 مع تجاوز قص 3 مم." },
};

/** The composition conventions (#1540): designs holding the composition
 *  part alone, a language's rules from the engine's COMPOSITION_CONVENTIONS. */
const COMPOSITION_SPANISH_NAMES: Names = {
  en: { name: "Spanish (traditional)", description: "Composition rules: no two hyphenated lines in a row, no divided last word, no stacks, no column ending on a hyphen." },
  es: { name: "Español (tradicional)", description: "Reglas de composición: ninguna línea con guion seguida de otra, ni última palabra partida, ni repeticiones en los extremos de línea, ni columna que acabe en guion." },
  ca: { name: "Castellà (tradicional)", description: "Regles de composició: cap línia amb guionet seguida d’una altra, ni última paraula partida, ni repeticions als extrems de línia, ni columna que acabi en guionet." },
  de: { name: "Spanisch (traditionell)", description: "Satzregeln: keine zwei Trennungen in Folge, kein getrenntes letztes Wort, keine Wiederholungen am Zeilenrand, keine Spalte, die mit einer Trennung endet." },
  fr: { name: "Espagnol (traditionnel)", description: "Règles de composition : jamais deux lignes de suite coupées, ni dernier mot coupé, ni répétitions en bout de ligne, ni colonne finissant sur une coupure." },
  it: { name: "Spagnolo (tradizionale)", description: "Regole di composizione: mai due righe di seguito con il trattino, né ultima parola divisa, né ripetizioni ai bordi della riga, né colonna che finisca con un trattino." },
  pt: { name: "Espanhol (tradicional)", description: "Regras de composição: nunca duas linhas seguidas com hífen, nem última palavra dividida, nem repetições nas pontas da linha, nem coluna que termine em hífen." },
  ja: { name: "スペイン語（伝統的）", description: "組版ルール：ハイフンで終わる行を2行続けない、段落最後の語を分割しない、行頭・行末の重複を避ける、段末をハイフンで終えない。" },
  zh: { name: "西班牙语（传统）", description: "排版规则：不允许连续两行以连字符结尾，段末单词不断开，避免行首行尾重复，栏末不以连字符结尾。" },
  ar: { name: "الإسبانية (التقليدية)", description: "قواعد التنضيد: لا سطران متتاليان ينتهيان بواصلة، ولا كلمة أخيرة مقسومة، ولا تكرار في أطراف الأسطر، ولا عمود ينتهي بواصلة." },
};

const COMPOSITION_ENGLISH_US_NAMES: Names = {
  en: { name: "English (US)", description: "Composition rules: at most three hyphenated lines in a row; the last word of a paragraph kept whole." },
  es: { name: "Inglés (EE. UU.)", description: "Reglas de composición: como mucho tres líneas seguidas con guion; la última palabra del párrafo, entera." },
  ca: { name: "Anglès (EUA)", description: "Regles de composició: com a màxim tres línies seguides amb guionet; l’última paraula del paràgraf, sencera." },
  de: { name: "Englisch (USA)", description: "Satzregeln: höchstens drei Trennungen in Folge; das letzte Wort eines Absatzes bleibt ganz." },
  fr: { name: "Anglais (États-Unis)", description: "Règles de composition : trois lignes coupées de suite au plus ; le dernier mot du paragraphe entier." },
  it: { name: "Inglese (USA)", description: "Regole di composizione: al massimo tre righe di seguito con il trattino; l’ultima parola del paragrafo intera." },
  pt: { name: "Inglês (EUA)", description: "Regras de composição: no máximo três linhas seguidas com hífen; a última palavra do parágrafo inteira." },
  ja: { name: "英語（米国）", description: "組版ルール：ハイフンで終わる行は連続3行まで。段落最後の語は分割しない。" },
  zh: { name: "英语（美国）", description: "排版规则：最多连续三行以连字符结尾；段落最后一个单词不断开。" },
  ar: { name: "الإنجليزية (الولايات المتحدة)", description: "قواعد التنضيد: ثلاثة أسطر متتالية بواصلة على الأكثر؛ وتبقى الكلمة الأخيرة من الفقرة كاملة." },
};

const COMPOSITION_ENGLISH_UK_NAMES: Names = {
  en: { name: "English (UK)", description: "Composition rules: at most two hyphenated lines in a row; the last word of a paragraph kept whole." },
  es: { name: "Inglés (Reino Unido)", description: "Reglas de composición: como mucho dos líneas seguidas con guion; la última palabra del párrafo, entera." },
  ca: { name: "Anglès (Regne Unit)", description: "Regles de composició: com a màxim dues línies seguides amb guionet; l’última paraula del paràgraf, sencera." },
  de: { name: "Englisch (Vereinigtes Königreich)", description: "Satzregeln: höchstens zwei Trennungen in Folge; das letzte Wort eines Absatzes bleibt ganz." },
  fr: { name: "Anglais (Royaume-Uni)", description: "Règles de composition : deux lignes coupées de suite au plus ; le dernier mot du paragraphe entier." },
  it: { name: "Inglese (Regno Unito)", description: "Regole di composizione: al massimo due righe di seguito con il trattino; l’ultima parola del paragrafo intera." },
  pt: { name: "Inglês (Reino Unido)", description: "Regras de composição: no máximo duas linhas seguidas com hífen; a última palavra do parágrafo inteira." },
  ja: { name: "英語（英国）", description: "組版ルール：ハイフンで終わる行は連続2行まで。段落最後の語は分割しない。" },
  zh: { name: "英语（英国）", description: "排版规则：最多连续两行以连字符结尾；段落最后一个单词不断开。" },
  ar: { name: "الإنجليزية (المملكة المتحدة)", description: "قواعد التنضيد: سطران متتاليان بواصلة على الأكثر؛ وتبقى الكلمة الأخيرة من الفقرة كاملة." },
};

const COMPOSITION_FRENCH_NAMES: Names = {
  en: { name: "French", description: "Composition rules: at most three hyphenated lines in a row; the last word of a paragraph kept whole." },
  es: { name: "Francés", description: "Reglas de composición: como mucho tres líneas seguidas con guion; la última palabra del párrafo, entera." },
  ca: { name: "Francès", description: "Regles de composició: com a màxim tres línies seguides amb guionet; l’última paraula del paràgraf, sencera." },
  de: { name: "Französisch", description: "Satzregeln: höchstens drei Trennungen in Folge; das letzte Wort eines Absatzes bleibt ganz." },
  fr: { name: "Français", description: "Règles de composition : trois lignes coupées de suite au plus ; le dernier mot du paragraphe entier." },
  it: { name: "Francese", description: "Regole di composizione: al massimo tre righe di seguito con il trattino; l’ultima parola del paragrafo intera." },
  pt: { name: "Francês", description: "Regras de composição: no máximo três linhas seguidas com hífen; a última palavra do parágrafo inteira." },
  ja: { name: "フランス語", description: "組版ルール：ハイフンで終わる行は連続3行まで。段落最後の語は分割しない。" },
  zh: { name: "法语", description: "排版规则：最多连续三行以连字符结尾；段落最后一个单词不断开。" },
  ar: { name: "الفرنسية", description: "قواعد التنضيد: ثلاثة أسطر متتالية بواصلة على الأكثر؛ وتبقى الكلمة الأخيرة من الفقرة كاملة." },
};

const COMPOSITION_GERMAN_NAMES: Names = {
  en: { name: "German", description: "Composition rules: at most three hyphenated lines in a row." },
  es: { name: "Alemán", description: "Reglas de composición: como mucho tres líneas seguidas con guion." },
  ca: { name: "Alemany", description: "Regles de composició: com a màxim tres línies seguides amb guionet." },
  de: { name: "Deutsch", description: "Satzregeln: höchstens drei Trennungen in Folge." },
  fr: { name: "Allemand", description: "Règles de composition : trois lignes coupées de suite au plus." },
  it: { name: "Tedesco", description: "Regole di composizione: al massimo tre righe di seguito con il trattino." },
  pt: { name: "Alemão", description: "Regras de composição: no máximo três linhas seguidas com hífen." },
  ja: { name: "ドイツ語", description: "組版ルール：ハイフンで終わる行は連続3行まで。" },
  zh: { name: "德语", description: "排版规则：最多连续三行以连字符结尾。" },
  ar: { name: "الألمانية", description: "قواعد التنضيد: ثلاثة أسطر متتالية بواصلة على الأكثر." },
};

const CONVENTION_NAMES: Record<string, Names> = {
  "composition-es": COMPOSITION_SPANISH_NAMES,
  "composition-en-us": COMPOSITION_ENGLISH_US_NAMES,
  "composition-en-gb": COMPOSITION_ENGLISH_UK_NAMES,
  "composition-fr": COMPOSITION_FRENCH_NAMES,
  "composition-de": COMPOSITION_GERMAN_NAMES,
};

const TYPE: DesignPart[] = ["page", "colors", "text", "headings"];

const DESIGNS: { id: string; names: Names; parts: DesignPart[]; config: PostextConfig }[] = [
  { id: "novel", names: NOVEL_NAMES, parts: TYPE, config: NOVEL },
  { id: "manual", names: MANUAL_NAMES, parts: TYPE, config: MANUAL },
  { id: "magazine", names: MAGAZINE_NAMES, parts: TYPE, config: MAGAZINE },
  { id: "two-colour", names: TWO_COLOUR_NAMES, parts: [...TYPE, "figures", "output"], config: TWO_COLOUR },
  ...COMPOSITION_CONVENTIONS.map((c) => ({ id: c.id, names: CONVENTION_NAMES[c.id]!, parts: ["composition"] as DesignPart[], config: c.config })),
];

fs.mkdirSync(OUT, { recursive: true });
for (const d of DESIGNS) {
  const { en, ...others } = d.names;
  const made = await createDesignBundle({
    id: d.id,
    name: en!.name,
    description: en!.description,
    locale: "en",
    localized: others,
    design: extractDesign(d.config, d.parts),
    mtime: MTIME,
  });
  if (made.warnings.length > 0) throw new Error(`${d.id}: ${made.warnings.join("; ")}`);
  const file = path.join(OUT, `${d.id}.postext`);
  fs.writeFileSync(file, made.bytes);
  console.log(`${path.relative(process.cwd(), file)} (${made.bytes.byteLength} bytes)`);
}

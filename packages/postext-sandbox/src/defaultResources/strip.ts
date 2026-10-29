// The comic strip of the chapter on comics (#1296): three painted panels
// with no words on them — an editor showing a proof, a designer at the
// screen, a printed book opening. Each edition's Markdown letters them in
// its own language (`:::strip` in the chapter); the pictures, their safe
// areas and their speakers' anchors are the same in every edition.

import type { Resource } from 'postext';
import type { GuideLang } from './lang.js';

/** The ids the strip's `::panel{art=…}` lines name. */
export const GUIDE_STRIP_IDS = ['strip-proof', 'strip-screen', 'strip-book'] as const;
type StripId = (typeof GUIDE_STRIP_IDS)[number];

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

/** Where each picture keeps what matters and where its speakers are, in
 *  fractions of the picture. */
const ART: Record<StripId, Pick<Resource, 'safeArea' | 'anchors'>> = {
  'strip-proof': {
    safeArea: box(0.22, 0.16, 0.57, 0.6),
    anchors: [
      { id: 'editor', x: 0.37, y: 0.34, face: box(0.24, 0.18, 0.22, 0.21) },
      { id: 'designer', x: 0.66, y: 0.35, face: box(0.58, 0.16, 0.19, 0.23) },
    ],
  },
  'strip-screen': {
    safeArea: box(0.13, 0.05, 0.46, 0.6),
    anchors: [
      { id: 'editor', x: 0.23, y: 0.19, face: box(0.15, 0.06, 0.15, 0.16) },
      { id: 'designer', x: 0.48, y: 0.41, face: box(0.41, 0.26, 0.16, 0.19) },
    ],
  },
  'strip-book': {
    safeArea: box(0.3, 0.3, 0.45, 0.5),
    anchors: [{ id: 'sfx', x: 0.45, y: 0.55 }],
  },
};

/** What each picture shows, for readers who cannot see it. */
const ALT: Record<StripId, Record<GuideLang, string>> = {
  'strip-proof': {
    en: 'An editor with grey hair and glasses holds up a printed proof and points at the foot of the page with a red pencil; a young designer leans in to look.',
    es: 'Una editora de pelo gris y gafas sostiene una prueba impresa y señala el pie de la página con un lápiz rojo; un diseñador joven se inclina para mirar.',
    ca: 'Una editora de cabells grisos i ulleres sosté una prova impresa i assenyala el peu de la pàgina amb un llapis vermell; un dissenyador jove s\'inclina per mirar.',
    'pt-BR': 'Uma editora de cabelo grisalho e óculos segura uma prova impressa e aponta o pé da página com um lápis vermelho; um designer jovem se inclina para olhar.',
    fr: 'Une éditrice aux cheveux gris et aux lunettes rondes tient une épreuve imprimée et montre le pied de la page avec un crayon rouge ; un jeune graphiste se penche pour regarder.',
    de: 'Eine Lektorin mit grauem Haar und Brille hält einen gedruckten Korrekturabzug hoch und zeigt mit einem Rotstift auf den Fuß der Seite; ein junger Gestalter beugt sich vor, um zu sehen.',
    it: 'Una redattrice con i capelli grigi e gli occhiali tiene in mano una bozza stampata e indica il piede della pagina con una matita rossa; un giovane grafico si sporge a guardare.',
    ar: 'محرّرة بشعر رمادي ونظارة ترفع بروفة مطبوعة وتشير بقلم أحمر إلى أسفل الصفحة، ومصمّم شاب يميل لينظر.',
    'zh-Hans': '一位灰发戴眼镜的编辑举着一张打印校样，用红铅笔指着页脚；一位年轻的设计师探身过来看。',
    ja: '白髪で眼鏡をかけた編集者が刷り上がった校正紙を掲げ、赤鉛筆でページの下端を指している。若いデザイナーが身を乗り出してのぞき込む。',
  },
  'strip-screen': {
    en: 'The designer sits at a large monitor showing a page in two columns and explains something; the editor stands behind his chair with her arms folded and smiles.',
    es: 'El diseñador, sentado ante un monitor grande que muestra una página a dos columnas, explica algo; la editora, de pie tras su silla y con los brazos cruzados, sonríe.',
    ca: 'El dissenyador, assegut davant d\'un monitor gran que mostra una pàgina a dues columnes, explica alguna cosa; l\'editora, dreta darrere la cadira i amb els braços plegats, somriu.',
    'pt-BR': 'O designer, sentado diante de um monitor grande que mostra uma página em duas colunas, explica algo; a editora, de pé atrás da cadeira e de braços cruzados, sorri.',
    fr: 'Le graphiste, assis devant un grand écran qui montre une page sur deux colonnes, explique quelque chose ; l’éditrice, debout derrière sa chaise, les bras croisés, sourit.',
    de: 'Der Gestalter sitzt vor einem großen Bildschirm mit einer zweispaltigen Seite und erklärt etwas; die Lektorin steht mit verschränkten Armen hinter seinem Stuhl und lächelt.',
    it: 'Il grafico, seduto davanti a un grande monitor che mostra una pagina a due colonne, spiega qualcosa; la redattrice, in piedi dietro la sua sedia a braccia conserte, sorride.',
    ar: 'المصمّم جالس أمام شاشة كبيرة تعرض صفحة من عمودين ويشرح شيئًا، والمحرّرة واقفة خلف كرسيه عاقدةً ذراعيها وتبتسم.',
    'zh-Hans': '设计师坐在一台显示双栏页面的大显示器前讲解着什么；编辑站在他的椅子后面，抱着双臂微笑。',
    ja: '二段組のページを映した大きなモニターの前でデザイナーが説明している。編集者は腕を組んで椅子の後ろに立ち、ほほえんでいる。',
  },
  'strip-book': {
    en: 'Close-up of a table: the editor\'s hands flip open a freshly printed hardback; the designer\'s hand rests on a small stack of the same book.',
    es: 'Primer plano de una mesa: las manos de la editora abren un libro de tapa dura recién impreso; la mano del diseñador descansa sobre una pila pequeña del mismo libro.',
    ca: 'Primer pla d\'una taula: les mans de l\'editora obren un llibre de tapa dura acabat d\'imprimir; la mà del dissenyador reposa sobre una pila petita del mateix llibre.',
    'pt-BR': 'Close de uma mesa: as mãos da editora folheiam um livro de capa dura recém-impresso; a mão do designer descansa sobre uma pequena pilha do mesmo livro.',
    fr: 'Gros plan sur une table : les mains de l’éditrice ouvrent un livre relié tout juste imprimé ; la main du graphiste repose sur une petite pile du même livre.',
    de: 'Nahaufnahme eines Tisches: Die Hände der Lektorin blättern ein frisch gedrucktes gebundenes Buch auf; die Hand des Gestalters ruht auf einem kleinen Stapel desselben Buches.',
    it: 'Primo piano di un tavolo: le mani della redattrice sfogliano un libro rilegato appena stampato; la mano del grafico è appoggiata su una piccola pila dello stesso libro.',
    ar: 'لقطة قريبة لطاولة: يدا المحرّرة تفتحان كتابًا مجلّدًا خرج للتوّ من المطبعة، ويد المصمّم مستندة إلى كومة صغيرة من النسخ نفسها.',
    'zh-Hans': '桌面特写：编辑的双手翻开一本刚印好的精装书；设计师的手搭在一小摞同样的书上。',
    ja: '机の上のクローズアップ。編集者の手が刷り上がったばかりの上製本を開き、デザイナーの手が同じ本の小さな山に置かれている。',
  },
};

/** The blob id each panel's JPEG is stored under (one copy for every
 *  edition: the pictures carry no words). */
export function stripBlobId(id: StripId): string {
  return `default-${id}`;
}

/** The panels' bytes, by blob id (a chunk of their own). */
export async function guideStripArt(): Promise<Record<string, Uint8Array>> {
  const mod = await import('./stripArt.js');
  const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return {
    [stripBlobId('strip-proof')]: bytes(mod.STRIP_PROOF),
    [stripBlobId('strip-screen')]: bytes(mod.STRIP_SCREEN),
    [stripBlobId('strip-book')]: bytes(mod.STRIP_BOOK),
  };
}

/** The three panel pictures of an edition. They are pictures for the strip
 *  only: no caption, never mentioned, so no number. */
export function guideStripResources(lang: GuideLang, now: number): Resource[] {
  return GUIDE_STRIP_IDS.map((id) => ({
    id,
    typeId: 'figure',
    kind: 'bitmap',
    bitmap: { fileId: stripBlobId(id), format: 'jpeg', width: 800, height: 800 },
    ...ART[id],
    caption: '',
    altText: ALT[id][lang],
    createdAt: now,
    updatedAt: now,
  }));
}

/** A pure description of the strip, for the built-in preset's fingerprint. */
export function guideStripSignature(): unknown[] {
  return GUIDE_STRIP_IDS.map((id) => [id, ART[id], ALT[id], 'v1']);
}

// The guide's SVG figures drawn with the kit: the layout pipeline, the
// convergence loop, measurement speed, orphans and widows, Knuth-Plass and
// the baseline grid, and the registry of every figure by its blob fileId
// with its canvas size (#1276: split out of index.ts).
//
// Each generator returns a self-contained SVG string with a `viewBox`,
// `role="img"` and a localised `aria-label`. One blue family, slate
// neutrals and a single amber for points of attention; differences are
// also encoded by value and pattern, so a figure reads in greyscale or
// single ink. Column-span canvases are COLUMN_VW (300) units wide and
// page-span ones PAGE_VW (634), so both render at the same units-per-point
// factor and the FS type scale, strokes and arrowheads come out the same
// size in every figure. A Chinese or Japanese label is about one em per
// character, so their wording is kept to what fits the Latin labels' boxes.
import { coverArtVerticalSvg, coverArtSvg, COVER_VW, COVER_VH, COVER_ZH_VW, COVER_ZH_VH } from './cover.js';
import { byLang, type GuideLang } from './lang.js';
import { P, text, FS, COLUMN_VW, DEFS, node, edge, PAGE_VW, bar, mirrorFragment, localizeFigure, mirrorSvg } from './svgKit.js';
import { cjkCompositionSvg, columnLayoutsSvg, floatSlotsSvg, balancingSvg, bookAnatomySvg, sandboxUiSvg, epubRenditionsSvg, vectorRosetteSvg, vectorChartSvg, vectorClipSvg } from './guideFigures.js';

const PIPELINE = byLang(
  { parse: 'Parse', measure: 'Measure', layout: 'Layout', config: 'Configuration', loop: ['at most', '5 passes'], aria: 'Postext pipeline' },
  { parse: 'Análisis', measure: 'Medición', layout: 'Maquetación', config: 'Configuración', loop: ['hasta', '5 pasadas'], aria: 'tubería de Postext' },
  { parse: '解析', measure: '测量', layout: '排版', config: '配置', loop: ['最多5轮'], aria: 'Postext的处理流水线' },
  { parse: 'Anàlisi', measure: 'Mesura', layout: 'Maquetació', config: 'Configuració', loop: ['fins a', '5 passades'], aria: 'cadena de processament de Postext' },
  { parse: 'التحليل', measure: 'القياس', layout: 'التنضيد', config: 'الإعدادات', loop: ['حتى', '٥ تمريرات'], aria: 'خط معالجة Postext' },
  { parse: '解析', measure: '計測', layout: '組版', config: '設定', loop: ['最大5回'], aria: 'Postextの処理の流れ' },
  { parse: 'Análise', measure: 'Medição', layout: 'Diagramação', config: 'Configuração', loop: ['até', '5 passadas'], aria: 'pipeline do Postext' },
  { parse: 'Analyse', measure: 'Mesure', layout: 'Mise en page', config: 'Configuration', loop: ['jusqu’à', '5 passes'], aria: 'chaîne de traitement de Postext' },
  { parse: 'Parsen', measure: 'Messen', layout: 'Setzen', config: 'Konfiguration', loop: ['höchstens', '5 Läufe'], aria: 'Verarbeitungskette von Postext' },
  { parse: 'Analisi', measure: 'Misura', layout: 'Impaginazione', config: 'Configurazione', loop: ['fino a', '5 passate'], aria: 'catena di elaborazione di Postext' },
);

/** The Postext pipeline: Markdown and configuration → parse → measure →
 *  layout (the convergence loop) → the VDT, read by three renderers. A
 *  column-span figure, so the stages stack vertically and fan out to the
 *  output chips at the foot. The stage fills deepen top to bottom (source →
 *  engine). */
function pipelineSvg(lang: GuideLang): string {
  const { parse, measure, layout, config, loop, aria: ariaLabel } = PIPELINE[lang];
  const chip = (x: number, label: string, dot: string): string =>
    `<rect x="${x}" y="262" width="82" height="26" rx="13" fill="${P.paper}" stroke="${P.edgeSoft}" stroke-width="1.2" />
  <circle cx="${x + 13}" cy="275" r="3.5" fill="${dot}" />
  ${text(x + 22, 279, label, { size: FS.label, weight: 600, anchor: 'start' })}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN_VW} 300" role="img" aria-label="${ariaLabel}">
  ${DEFS}
  ${node(22, 14, 116, 32, 'Markdown', 'neutral')}
  ${node(162, 14, 116, 32, config, 'neutral')}
  ${node(95, 70, 110, 32, parse, 'tint')}
  ${node(95, 122, 110, 32, measure, 'tint')}
  ${node(95, 174, 110, 32, layout, 'solid')}
  ${edge('M205,184 C236,184 236,200 205,200', { color: P.amber, marker: 'ahAmber' })}
  ${loop.map((l, i, all) => text(240, 196 + (i - (all.length - 1) / 2) * 12, l, { size: FS.small, color: P.amberDark, anchor: 'start', italic: true })).join('\n  ')}
  ${edge('M80,46 C80,58 130,56 136,66')}
  ${edge('M220,46 C220,58 170,56 164,66')}
  ${edge('M150,102 L150,118')}
  ${edge('M150,154 L150,170')}
  <rect x="124" y="218" width="52" height="18" rx="9" fill="${P.blueTint}" stroke="${P.blueMid}" />
  ${text(150, 230.5, 'VDT', { size: FS.small, color: P.blueDark, weight: 700 })}
  ${edge('M150,206 L150,214', { marker: null })}
  ${edge('M150,236 C150,248 53,244 53,258')}
  ${edge('M150,236 L150,258')}
  ${edge('M150,236 C150,248 247,244 247,258')}
  ${chip(12, 'Canvas', P.blue)}
  ${chip(109, 'HTML', P.muted)}
  ${chip(206, 'PDF', P.amber)}
</svg>`;
}

const CONVERGENCE = byLang(
  { place: 'Place', check: 'Check', adjust: 'Adjust', done: 'Converged', ok: 'satisfied', conflict: 'conflict', iters: 'at most 5 iterations', aria: 'layout convergence loop', itersWidth: 112 },
  { place: 'Colocar', check: 'Comprobar', adjust: 'Ajustar', done: 'Convergido', ok: 'cumple', conflict: 'conflicto', iters: 'hasta 5 iteraciones', aria: 'bucle de convergencia de la maquetación', itersWidth: 110 },
  { place: '排布', check: '检查', adjust: '调整', done: '收敛', ok: '满足', conflict: '冲突', iters: '最多5轮', aria: '排版的收敛循环', itersWidth: 72 },
  { place: 'Col·locar', check: 'Comprovar', adjust: 'Ajustar', done: 'Convergit', ok: 'compleix', conflict: 'conflicte', iters: 'fins a 5 iteracions', aria: 'bucle de convergència de la maquetació', itersWidth: 110 },
  { place: 'وضع', check: 'تحقق', adjust: 'تعديل', done: 'استقرار', ok: 'مستوفى', conflict: 'تعارض', iters: '٥ تكرارات على الأكثر', aria: 'حلقة تقارب التنضيد', itersWidth: 110 },
  { place: '配置', check: '検査', adjust: '調整', done: '収束', ok: '問題なし', conflict: '衝突', iters: '最大5回', aria: '組版の収束ループ', itersWidth: 72 },
  { place: 'Posicionar', check: 'Verificar', adjust: 'Ajustar', done: 'Convergiu', ok: 'atende', conflict: 'conflito', iters: 'até 5 iterações', aria: 'laço de convergência da diagramação', itersWidth: 104 },
  { place: 'Placer', check: 'Vérifier', adjust: 'Ajuster', done: 'Convergé', ok: 'satisfait', conflict: 'conflit', iters: 'au plus 5 itérations', aria: 'boucle de convergence de la mise en page', itersWidth: 112 },
  { place: 'Platzieren', check: 'Prüfen', adjust: 'Anpassen', done: 'Konvergiert', ok: 'erfüllt', conflict: 'Konflikt', iters: 'höchstens 5 Durchläufe', aria: 'Konvergenzschleife des Layouts', itersWidth: 124 },
  { place: 'Collocare', check: 'Verificare', adjust: 'Regolare', done: 'Convergenza', ok: 'soddisfatto', conflict: 'conflitto', iters: 'fino a 5 iterazioni', aria: 'ciclo di convergenza dell’impaginazione', itersWidth: 110 },
);

/** The convergence loop: place → check → (conflict ⇒ adjust ⇒ back) until the
 *  constraints are satisfied, capped at five iterations. Distinct from the
 *  pipeline figure. */
function convergenceLoopSvg(lang: GuideLang): string {
  const { place, check, adjust, done, ok, conflict, iters, aria: ariaLabel, itersWidth } = CONVERGENCE[lang];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 170" role="img" aria-label="${ariaLabel}">
  ${DEFS}
  ${node(36, 46, 120, 40, place, 'tint')}
  ${node(257, 46, 120, 40, check, 'tint')}
  ${node(478, 46, 120, 40, done, 'solid')}
  ${node(257, 118, 120, 36, adjust, 'accent')}
  ${edge('M160,66 L253,66')}
  ${edge('M381,66 L474,66', { marker: 'ahBlue', color: P.blue })}
  ${text(427, 58, ok, { size: FS.small, color: P.blueDark, italic: true })}
  ${edge('M317,90 L317,114', { color: P.amber, marker: 'ahAmber' })}
  ${text(325, 106, conflict, { size: FS.small, color: P.amberDark, italic: true, anchor: 'start' })}
  ${edge('M253,136 L132,136 Q124,136 124,128 L124,92', { dash: '5 4' })}
  <rect x="${188 - itersWidth / 2}" y="127" width="${itersWidth}" height="18" rx="9" fill="${P.paper}" stroke="${P.hair}" />
  ${text(188, 139.5, iters, { size: FS.small, color: P.muted })}
</svg>`;
}

const SPEED = byLang(
  { withDom: 'DOM-based', withoutDom: 'DOM-free', faster: 'faster', time: 'time', aria: 'speed comparison between DOM-based and DOM-free measurement' },
  { withDom: 'Con DOM', withoutDom: 'Sin DOM', faster: 'más rápido', time: 'tiempo', aria: 'comparación de velocidad entre medición con y sin DOM' },
  { withDom: '借助DOM', withoutDom: '不借助DOM', faster: '更快', time: '耗时', aria: '借助DOM与不借助DOM的测量速度对比' },
  { withDom: 'Amb DOM', withoutDom: 'Sense DOM', faster: 'més ràpid', time: 'temps', aria: 'comparació de velocitat entre la mesura amb DOM i sense DOM' },
  { withDom: 'عبر DOM', withoutDom: 'بلا DOM', faster: 'أسرع', time: 'الزمن', aria: 'مقارنة سرعة القياس عبر DOM وبلا DOM' },
  { withDom: 'DOMを使う', withoutDom: 'DOMを使わない', faster: '高速', time: '時間', aria: 'DOMを使う計測と使わない計測の速度比較' },
  { withDom: 'Com DOM', withoutDom: 'Sem DOM', faster: 'mais rápido', time: 'tempo', aria: 'comparação de velocidade entre a medição com DOM e sem DOM' },
  { withDom: 'Avec DOM', withoutDom: 'Sans DOM', faster: 'plus rapide', time: 'temps', aria: 'comparaison de vitesse entre la mesure avec DOM et sans DOM' },
  { withDom: 'Mit DOM', withoutDom: 'Ohne DOM', faster: 'schneller', time: 'Zeit', aria: 'Geschwindigkeitsvergleich zwischen der Messung mit DOM und ohne DOM' },
  { withDom: 'Con DOM', withoutDom: 'Senza DOM', faster: 'più veloce', time: 'tempo', aria: 'confronto di velocità tra la misura con DOM e quella senza DOM' },
);

/** A two-bar chart contrasting DOM-based measurement with DOM-free measurement,
 *  annotated with the 300–600× speed-up. */
function measurementSpeedSvg(lang: GuideLang): string {
  const { withDom, withoutDom, faster: fasterWord, time: timeAxis, aria: ariaLabel } = SPEED[lang];
  // Bars sit on the axis with rounded tops only.
  const roundTopBar = (x: number, top: number, w: number, fill: string, stroke: string): string =>
    `<path d="M${x},150 L${x},${top + 5} Q${x},${top} ${x + 5},${top} L${x + w - 5},${top} Q${x + w},${top} ${x + w},${top + 5} L${x + w},150 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.2" />`;
  const gridlines = [54, 86, 118]
    .map((y) => `<line x1="36" y1="${y}" x2="276" y2="${y}" stroke="${P.hair}" stroke-width="1" />`)
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN_VW} 190" role="img" aria-label="${ariaLabel}">
  ${DEFS}
  ${gridlines}
  ${text(33, 40, timeAxis, { size: FS.small, color: P.muted, anchor: 'end', italic: true })}
  ${roundTopBar(64, 32, 60, '#c9d4df', '#9aaaba')}
  ${roundTopBar(192, 143, 60, P.blue, P.blueDark)}
  <line x1="36" y1="150" x2="276" y2="150" stroke="#9aaaba" stroke-width="1.5" />
  ${edge('M128,38 C168,52 186,94 210,136', { marker: 'ahBlue', color: P.blue })}
  ${text(230, 106, lang === 'ar' ? '٣٠٠–٦٠٠×' : '300–600×', { size: FS.strong, color: P.blueDark, weight: 700 })}
  ${text(230, 121, fasterWord, { size: FS.small, color: P.muted })}
  ${text(94, 169, withDom, { size: FS.label, weight: 600 })}
  ${text(222, 169, withoutDom, { size: FS.label, weight: 600 })}
</svg>`;
}

/** The two labels of the orphan-and-widow figure: the one under the foot of
 *  the left column and the one over the head of the right. The Latin
 *  editions follow the engine's names (`avoidWidows` at a column's foot,
 *  `avoidOrphans` at the next one's head); the Chinese, Japanese and German
 *  editions name them by place, as their text does (段首孤行, オーファン,
 *  Waise at the foot: a paragraph's first line; 段末孤行, ウィドウ, Witwe at
 *  the head: its last). */
const ORPHAN_WIDOW = byLang(
  { foot: 'Widow', head: 'Orphan', aria: 'widow and orphan lines across columns' },
  { foot: 'Viuda', head: 'Huérfana', aria: 'líneas viuda y huérfana entre columnas' },
  { foot: '段首孤行', head: '段末孤行', aria: '分栏处两侧的段首孤行与段末孤行' },
  { foot: 'Vídua', head: 'Òrfena', aria: 'línies vídua i òrfena entre columnes' },
  { foot: 'أرملة', head: 'يتيمة', aria: 'سطر أرملة وسطر يتيم بين عمودين' },
  { foot: 'オーファン', head: 'ウィドウ', aria: '段の切れ目の両側にできるオーファンとウィドウ' },
  { foot: 'Viúva', head: 'Órfã', aria: 'linhas viúva e órfã entre colunas' },
  { foot: 'Veuve', head: 'Orpheline', aria: 'lignes veuve et orpheline de part et d’autre des colonnes' },
  { foot: 'Waise', head: 'Witwe', aria: 'Waise und Witwe zu beiden Seiten eines Spaltenumbruchs' },
  { foot: 'Vedova', head: 'Orfana', aria: 'righe vedova e orfana tra le colonne' },
);

/** Two columns of text lines illustrating a widow (lone last line at the foot of
 *  a column) and an orphan (lone first line at the head of the next). In
 *  the Chinese, Japanese and German editions the stranded lines are drawn the way
 *  their names read them: a full first line at the foot, a short last line
 *  at the head. */
function orphanWidowSvg(lang: GuideLang): string {
  const { foot: widow, head: orphan, aria: ariaLabel } = ORPHAN_WIDOW[lang];
  const byPlace = lang === 'zh-Hans' || lang === 'ja' || lang === 'de';
  // Full body lines fill the left column; its paragraph's last line strands
  // alone at the foot. The continuation paragraph opens the right column with
  // a lone first line before the next paragraph begins.
  const leftWidths = [96, 90, 96, 86, 96, 92, 96, 88, 94];
  const leftLines = leftWidths.map((w, i) => bar(26, 32 + i * 12, w)).join('\n  ');
  const rightWidths = [92, 96, 86, 96, 90, 96, 84, 94];
  const rightLines = rightWidths.map((w, i) => bar(178, 56 + i * 12, w)).join('\n  ');
  const footLine = byPlace ? bar(36, 144, 86, P.amber) : bar(26, 144, 56, P.amber);
  const headLine = byPlace ? bar(178, 32, 52, P.amber) : bar(178, 32, 96, P.amber);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN_VW} 180" role="img" aria-label="${ariaLabel}">
  <rect x="16" y="20" width="116" height="140" rx="6" fill="${P.paper}" stroke="${P.edgeSoft}" />
  <rect x="168" y="20" width="116" height="140" rx="6" fill="${P.paper}" stroke="${P.edgeSoft}" />
  ${leftLines}
  ${footLine}
  ${text(74, 175, widow, { size: FS.label, color: P.amberDark, weight: 600 })}
  ${headLine}
  ${text(226, 13, orphan, { size: FS.label, color: P.amberDark, weight: 600 })}
  ${rightLines}
</svg>`;
}

const KNUTH_PLASS = byLang(
  {
    box: 'Box', glue: 'Glue', penalty: 'Penalty', measure: 'line measure · r = 0.42 · badness 7',
    aria: 'Knuth-Plass primitives: boxes, glue and penalties',
  },
  {
    box: 'Caja', glue: 'Goma', penalty: 'Penalización', measure: 'medida de la línea · r = 0,42 · medianía 7',
    aria: 'primitivas de Knuth-Plass: cajas, gomas y penalizaciones',
  },
  {
    box: '盒子', glue: '粘连', penalty: '惩罚值', measure: '行长 · r = 0.42 · 劣度 7',
    aria: 'Knuth–Plass算法的基本单元：盒子、粘连和惩罚值',
  },
  {
    box: 'Caixa', glue: 'Goma', penalty: 'Penalització', measure: 'mesura de la línia · r = 0,42 · mediania 7',
    aria: 'primitives de Knuth-Plass: caixes, gomes i penalitzacions',
  },
  {
    box: 'صندوق', glue: 'مسافة مرنة', penalty: 'جزاء', measure: 'عرض السطر · r = 0.42 · الرداءة ٧',
    aria: 'عناصر Knuth-Plass: الصناديق والمسافات المرنة والجزاءات',
  },  {
    box: 'ボックス', glue: 'グルー', penalty: 'ペナルティ', measure: '行長 · r = 0.42 · 不良度 7',
    aria: 'Knuth–Plass法の基本要素：ボックス、グルー、ペナルティ',
  },
  {
    box: 'Caixa', glue: 'Cola', penalty: 'Penalidade', measure: 'medida da linha · r = 0,42 · badness 7',
    aria: 'primitivas de Knuth-Plass: caixas, colas e penalidades',
  },
  {
    box: 'Boîte', glue: 'Ressort', penalty: 'Pénalité', measure: 'longueur de la ligne · r = 0,42 · médiocrité 7',
    aria: 'primitives de Knuth-Plass : boîtes, ressorts et pénalités',
  },
  {
    box: 'Box', glue: 'Leim', penalty: 'Strafpunkt', measure: 'Satzbreite · r = 0,42 · Schlechtigkeit 7',
    aria: 'Grundelemente von Knuth-Plass: Boxen, Leim und Strafpunkte',
  },
  {
    box: 'Scatola', glue: 'Colla', penalty: 'Penalità', measure: 'giustezza della riga · r = 0,42 · bruttezza 7',
    aria: 'primitive di Knuth-Plass: scatole, colle e penalità',
  },
);
/** The words of the example line. The hyphenated line is a Western one, so
 *  the Chinese and Arabic editions show the English line (Arabic is never
 *  hyphenated). */
const KP_WORDS = byLang(
  ['Every', 'paragraph', 'is', 'balan', 'ced'],
  ['Cada', 'párrafo', 'se', 'equili', 'bra'],
  ['Every', 'paragraph', 'is', 'balan', 'ced'],
  ['Cada', 'paràgraf', 'és', 'equili', 'brat'],
  ['Every', 'paragraph', 'is', 'balan', 'ced'],
  ['Every', 'paragraph', 'is', 'balan', 'ced'],  ['Cada', 'parágrafo', 'é', 'equili', 'brado'],
  ['Chaque', 'paragraphe', 'est', 'équili', 'bré'],
  ['Jeder', 'Absatz', 'ist', 'ausge', 'wogen'],
  ['Ogni', 'paragrafo', 'è', 'equili', 'brato'],
);

/** The Knuth-Plass primitives on a real line: word boxes, glue springs
 *  between them and a flagged penalty where the word would hyphenate, the
 *  measure the line is justified to above, and a legend. */
function knuthPlassSvg(lang: GuideLang): string {
  const { box, glue, penalty, measure, aria: ariaLabel } = KNUTH_PLASS[lang];
  const words = KP_WORDS[lang];
  const spring = (x: number, y: number): string =>
    `<path d="M${x},${y} q3,-8 6,0 t6,0 t6,0 t6,0" fill="none" stroke="${P.blueMid}" stroke-width="2" stroke-linecap="round" />`;
  const wordBox = (x: number, w: number, label: string, dashed = false): string =>
    `<rect x="${x}" y="46" width="${w}" height="34" rx="4" fill="${dashed ? '#f3f6fc' : P.blueTint}" stroke="${dashed ? P.blueMid : P.blue}" stroke-width="1.3"${dashed ? ' stroke-dasharray="4 3"' : ''} />
  ${text(x + w / 2, 68, label, { size: FS.strong, color: dashed ? P.blueMid : P.blueDark, weight: 600, italic: dashed })}`;
  const hyphen = (x: number, y: number, w: number): string =>
    `<path d="M${x},${y} l${w},0" stroke="${P.amber}" stroke-width="2.5" stroke-linecap="round" />`;
  const xs = [32, 160, 326, 420, 536];
  const ws = [92, 130, 58, 80, 64];
  // The legend reads from the right in the Arabic edition; the English line
  // above it stays as English is set.
  const legend = `<rect x="32" y="118" width="18" height="13" rx="3" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="1.2" />
  ${text(58, 128.5, box, { size: FS.label, anchor: 'start' })}
  ${spring(150, 124.5)}
  ${text(186, 128.5, glue, { size: FS.label, anchor: 'start' })}
  ${hyphen(286, 124.5, 14)}
  ${text(308, 128.5, penalty, { size: FS.label, anchor: 'start' })}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 150" role="img" aria-label="${ariaLabel}">
  <path d="M32,28 L32,20 L516,20 L516,28" fill="none" stroke="${P.line}" stroke-width="1.2" />
  ${text(274, 14, measure, { size: FS.small, color: P.muted, italic: true })}
  ${wordBox(xs[0]!, ws[0]!, words[0]!)}
  ${spring(xs[0]! + ws[0]! + 6, 63)}
  ${wordBox(xs[1]!, ws[1]!, words[1]!)}
  ${spring(xs[1]! + ws[1]! + 6, 63)}
  ${wordBox(xs[2]!, ws[2]!, words[2]!)}
  ${spring(xs[2]! + ws[2]! + 5, 63)}
  ${wordBox(xs[3]!, ws[3]!, words[3]!)}
  ${hyphen(506, 63, 10)}
  <path d="M511,56 L511,34 L524,38 L511,42" fill="${P.amber}" stroke="${P.amber}" stroke-width="1" stroke-linejoin="round" />
  ${wordBox(xs[4]!, ws[4]!, words[4]!, true)}
  <line x1="32" y1="104" x2="600" y2="104" stroke="${P.hair}" stroke-width="1" />
  ${lang === 'ar' ? mirrorFragment(legend, PAGE_VW) : legend}
</svg>`;
}

const BASELINE = byLang(
  { label: 'Baseline grid', aria: 'baseline grid alignment', pillW: 100 },
  { label: 'Rejilla de línea base', aria: 'alineación a la rejilla de línea base', pillW: 144 },
  { label: '基线网格', aria: '文字对齐基线网格', pillW: 76 },
  { label: 'Retícula de línia de base', aria: 'alineació a la retícula de línia de base', pillW: 172 },
  { label: 'شبكة خطوط القاعدة', aria: 'المحاذاة على شبكة خطوط القاعدة', pillW: 116 },
  { label: 'ベースライングリッド', aria: '行をベースライングリッドにそろえる', pillW: 128 },
  { label: 'Grade de linhas de base', aria: 'alinhamento à grade de linhas de base', pillW: 160 },
  { label: 'Grille de ligne de base', aria: 'alignement sur la grille de ligne de base', pillW: 156 },
  { label: 'Grundlinienraster', aria: 'Ausrichtung am Grundlinienraster', pillW: 120 },
  { label: 'Griglia della linea di base', aria: 'allineamento alla griglia della linea di base', pillW: 184 },
);

/** Two columns whose text lines snap to a shared horizontal baseline grid, with
 *  one dashed guide showing the cross-column alignment. */
function baselineGridSvg(lang: GuideLang): string {
  const { label, aria: ariaLabel, pillW } = BASELINE[lang];
  const gridYs = [34, 52, 70, 88, 106, 124];
  const grid = gridYs
    .map((y) => `<line x1="18" y1="${y}" x2="282" y2="${y}" stroke="${P.hair}" stroke-width="1" />`)
    .join('\n  ');
  // Text-line bars rest on the grid: each bar's bottom edge is a baseline.
  const leftWidths = [100, 94, 100, 88, 100, 96];
  const rightWidths = [96, 100, 90, 100, 94, 100];
  const left = gridYs.map((y, i) => bar(26, y - 7, leftWidths[i]!, '#b3c2d1', 5.5)).join('\n  ');
  const right = gridYs.map((y, i) => bar(174, y - 7, rightWidths[i]!, '#b3c2d1', 5.5)).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN_VW} 170" role="img" aria-label="${ariaLabel}">
  ${grid}
  ${left}
  ${right}
  <line x1="18" y1="88" x2="282" y2="88" stroke="${P.blue}" stroke-width="1.4" stroke-dasharray="5 4" />
  <rect x="${150 - pillW / 2}" y="142" width="${pillW}" height="20" rx="10" fill="${P.blueTint}" stroke="${P.blueMid}" stroke-width="1" />
  ${text(150, 155.5, label, { size: FS.label, color: P.blueDark, weight: 600 })}
</svg>`;
}

/** An SVG figure: its generator per edition and its canvas size. */
export interface GuideFigure {
  generate: (lang: GuideLang) => string;
  width: number;
  height: number;
  /** A size of its own in an edition drawn to other proportions. */
  sizeIn?: Partial<Record<GuideLang, { width: number; height: number }>>;
}

/** A figure's canvas size in an edition. */
export function figureSize(fig: GuideFigure, lang: GuideLang): { width: number; height: number } {
  return fig.sizeIn?.[lang] ?? { width: fig.width, height: fig.height };
}

/** A figure drawn with the kit, its labels set in the edition's label face
 *  (see `localizeFigure`). `mirrored`: a figure whose layout follows the
 *  reading order (a flow, a sequence of pages, columns, a chart's axis) is
 *  drawn as its mirror image in the Arabic edition, which reads from the
 *  right; the others keep their layout and set their labels right to left
 *  in place. */
const drawn = (draw: (lang: GuideLang) => string, mirrored = false) => (lang: GuideLang): string => {
  const svg = draw(lang);
  return localizeFigure(mirrored && lang === 'ar' ? mirrorSvg(svg) : svg, lang);
};

/** All SVG figures, keyed by the deterministic blob fileId used to persist them.
 *  fileIds are prefixed `default-` to avoid clashing with user uploads.
 *  Widths follow the shared unit system: COLUMN_VW for column-span figures,
 *  PAGE_VW for page-span ones (see FIGURE_SPECS placements). */
export const SVG_FIGURES: Record<string, GuideFigure> = {
  // The Chinese and Japanese editions, vertical books, have a portrait
  // cover: one of their own pages beside the title strip.
  'default-guide-cover': {
    // The Arabic edition's spread is drawn mirrored (see `coverArtSvg`).
    generate: (lang) => (lang === 'zh-Hans' || lang === 'ja' ? coverArtVerticalSvg(lang) : coverArtSvg(lang)),
    width: COVER_VW, height: COVER_VH,
    sizeIn: { 'zh-Hans': { width: COVER_ZH_VW, height: COVER_ZH_VH }, ja: { width: COVER_ZH_VW, height: COVER_ZH_VH } },
  },
  'default-layout-pipeline': { generate: drawn(pipelineSvg, true), width: COLUMN_VW, height: 300 },
  'default-convergence-loop': { generate: drawn(convergenceLoopSvg, true), width: PAGE_VW, height: 170 },
  'default-measurement-speed': { generate: drawn(measurementSpeedSvg, true), width: COLUMN_VW, height: 190 },
  'default-orphan-widow': { generate: drawn(orphanWidowSvg, true), width: COLUMN_VW, height: 180 },
  'default-knuth-plass': { generate: drawn(knuthPlassSvg), width: PAGE_VW, height: 150 },
  'default-cjk-composition': { generate: drawn(cjkCompositionSvg), width: PAGE_VW, height: 232 },
  'default-baseline-grid': { generate: drawn(baselineGridSvg, true), width: COLUMN_VW, height: 170 },
  'default-column-layouts': { generate: drawn(columnLayoutsSvg, true), width: PAGE_VW, height: 196 },
  'default-float-slots': { generate: drawn(floatSlotsSvg, true), width: PAGE_VW, height: 214 },
  'default-balancing': { generate: drawn(balancingSvg, true), width: PAGE_VW, height: 200 },
  'default-book-anatomy': { generate: drawn(bookAnatomySvg, true), width: PAGE_VW, height: 168 },
  'default-sandbox-ui': { generate: drawn(sandboxUiSvg, true), width: PAGE_VW, height: 322 },
  'default-epub-renditions': { generate: drawn(epubRenditionsSvg, true), width: PAGE_VW, height: 232 },
  'default-vector-rosette': { generate: drawn(vectorRosetteSvg), width: PAGE_VW, height: 222 },
  'default-vector-chart': { generate: drawn(vectorChartSvg, true), width: PAGE_VW, height: 186 },
  'default-vector-clip': { generate: drawn(vectorClipSvg, true), width: PAGE_VW, height: 170 },
};

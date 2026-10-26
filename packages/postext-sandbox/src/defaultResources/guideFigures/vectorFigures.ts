// The vector figures that show a PDF keeps its drawings sharp: the
// rosette, the chart and the clipped picture (#1276: split out of
// guideFigures.ts).
import { PAGE_VW, P, text } from '../svgKit.js';
import { byLang, type GuideLang } from '../lang.js';
import { GILT, NIGHT, num, VERMILION } from './kit.js';

// ── Vector specimens ────────────────────────────────────────────────────────
// Three figures drawn only with the SVG subset the PDF renders natively
// (paths, basic shapes, groups, `use`, clip paths, solid fills and strokes,
// opacity, text), so zooming into the PDF shows them staying crisp.

// Page-span canvases, on the shared unit scale (see ../figures.ts).
const WIDE = PAGE_VW;

/** A rosette of Bézier petals, hairline rings and microtext. */
const ROSETTE = byLang(
  { aria: 'vector rosette of petals, rings and microtext', micro: 'Postext · vector · zoom · ' },
  { aria: 'roseta vectorial de pétalos, anillos y microtexto', micro: 'Postext · vector · zoom · ' },
  { aria: '由花瓣、圆环和微缩文字组成的矢量玫瑰花饰', micro: 'Postext · 矢量 · 缩放 · ' },
  { aria: 'roseta vectorial de pètals, anells i microtext', micro: 'Postext · vector · zoom · ' },
  { aria: 'وردة متجهية من بتلات وحلقات ونص مجهري', micro: 'Postext · متجهي · تكبير · ' },
  { aria: '花弁と円環と微小文字でできたベクターのロゼット', micro: 'Postext · ベクター · 拡大 · ' },
  { aria: 'roseta vetorial de pétalas, anéis e microtexto', micro: 'Postext · vetor · zoom · ' },
  { aria: 'rosace vectorielle de pétales, d’anneaux et de microtexte', micro: 'Postext · vectoriel · zoom · ' },
  { aria: 'Vektorrosette aus Blütenblättern, Ringen und Mikroschrift', micro: 'Postext · Vektor · Zoom · ' },
  { aria: 'rosetta vettoriale di petali, anelli e microtesto', micro: 'Postext · vettoriale · zoom · ' },
);

export function vectorRosetteSvg(lang: GuideLang): string {
  const { aria: ariaLabel, micro } = ROSETTE[lang];
  const cx = WIDE / 2;
  const cy = 108;
  const petals: string[] = [];
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 78;
    const w = 0.34;
    const p = (ang: number, rad: number) => `${(cx + Math.cos(ang) * rad).toFixed(2)},${(cy + Math.sin(ang) * rad).toFixed(2)}`;
    petals.push(`<path d="M${cx},${cy} C${p(a - w, r * 0.62)} ${p(a - w * 0.4, r)} ${p(a, r)} C${p(a + w * 0.4, r)} ${p(a + w, r * 0.62)} ${cx},${cy} Z" fill="${i % 2 ? P.blue : GILT}" opacity="${i % 2 ? 0.55 : 0.7}" stroke="${P.blueDark}" stroke-width="0.35" />`);
  }
  const rings = [22, 34, 46, 86, 90].map((r, i) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${i < 3 ? '#ffffff' : P.blueDark}" stroke-width="${i < 3 ? 0.6 : 0.3}" />`).join('');
  const microText = Array.from({ length: 5 }, (_, i) => text(cx, 200 + i * 3.2, micro.repeat(10).trim(), { size: 2.6, color: P.muted })).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDE} 222" role="img" aria-label="${ariaLabel}">
  ${petals.join('')}${rings}
  <circle cx="${cx}" cy="${cy}" r="10" fill="${NIGHT}" />
  ${microText}
</svg>`;
}

/** A small area-and-line chart with axes, grid and labels. */
const CHART = byLang(
  { aria: 'vector area and line chart with axes and labels', months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'], pages: 'pages per second', chapters: 'chapters' },
  { aria: 'gráfico vectorial de área y línea con ejes y etiquetas', months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago'], pages: 'páginas por segundo', chapters: 'capítulos' },
  { aria: '带坐标轴和标签的矢量面积图与折线图', months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月'], pages: '每秒页数', chapters: '章数' },
  { aria: 'gràfic vectorial d\'àrea i línia amb eixos i etiquetes', months: ['gen.', 'febr.', 'març', 'abr.', 'maig', 'juny', 'jul.', 'ag.'], pages: 'pàgines per segon', chapters: 'capítols' },
  { aria: 'رسم بياني متجهي بمساحة وخط، بمحورين وتسميات', months: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس'], pages: 'صفحة في الثانية', chapters: 'فصول' },
  { aria: '軸とラベルのあるベクターの面グラフと折れ線グラフ', months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月'], pages: '毎秒のページ数', chapters: '章数' },
  { aria: 'gráfico vetorial de área e linha com eixos e rótulos', months: ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.'], pages: 'páginas por segundo', chapters: 'capítulos' },
  { aria: 'graphique vectoriel en aires et en ligne avec axes et étiquettes', months: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août'], pages: 'pages par seconde', chapters: 'chapitres' },
  { aria: 'Vektordiagramm mit Fläche und Linie, mit Achsen und Beschriftungen', months: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.'], pages: 'Seiten pro Sekunde', chapters: 'Kapitel' },
  { aria: 'grafico vettoriale ad area e a linea con assi ed etichette', months: ['gen.', 'feb.', 'mar.', 'apr.', 'mag.', 'giu.', 'lug.', 'ago.'], pages: 'pagine al secondo', chapters: 'capitoli' },
);

export function vectorChartSvg(lang: GuideLang): string {
  const { aria: ariaLabel, months, pages, chapters } = CHART[lang];
  const a = [12, 18, 15, 27, 31, 29, 42, 48];
  const b = [8, 10, 14, 13, 19, 24, 22, 30];
  const x0 = 34;
  const x1 = WIDE - 14;
  const y0 = 150;
  const y1 = 22;
  const X = (i: number) => x0 + (i / (a.length - 1)) * (x1 - x0);
  const Y = (v: number) => y0 - (v / 50) * (y0 - y1);
  const grid = [0, 10, 20, 30, 40, 50].map((v) => `<line x1="${x0}" y1="${Y(v).toFixed(1)}" x2="${x1}" y2="${Y(v).toFixed(1)}" stroke="${P.hair}" stroke-width="0.6" />${text(x0 - 6, Y(v) + 3.2, num(lang, v), { size: 8.5, color: P.muted, anchor: 'end' })}`).join('');
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const area = `${line(a)} L${X(a.length - 1).toFixed(1)},${y0} L${x0},${y0} Z`;
  const dots = a.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.6" fill="#ffffff" stroke="${P.blue}" stroke-width="1.4" />`).join('');
  const labels = months.map((m, i) => text(X(i), y0 + 14, m, { size: 8.5, color: P.muted })).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDE} 186" role="img" aria-label="${ariaLabel}">
  ${grid}
  <path d="${area}" fill="${P.blueTint}" />
  <path d="${line(b)}" fill="none" stroke="${GILT}" stroke-width="1.6" stroke-dasharray="4 3" />
  <path d="${line(a)}" fill="none" stroke="${P.blue}" stroke-width="2" stroke-linejoin="round" />
  ${dots}
  <line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="${P.line}" stroke-width="1" />
  ${labels}
  <rect x="${x0 + 4}" y="176" width="12" height="3" fill="${P.blue}" />${text(x0 + 20, 180, pages, { size: 8.5, anchor: 'start' })}
  <rect x="${x0 + 128}" y="176" width="12" height="3" fill="${GILT}" />${text(x0 + 144, 180, chapters, { size: 8.5, anchor: 'start' })}
</svg>`;
}

/** Clip paths, reused elements and overlapping translucent shapes. */
const CLIP = byLang(
  { aria: 'vector composition with clip paths, reused elements and transparency', clip: 'clip path', opacity: 'opacity' },
  { aria: 'composición vectorial con recortes, elementos reutilizados y transparencias', clip: 'recorte', opacity: 'opacidad' },
  { aria: '带剪切路径、重复使用的元素和透明度的矢量构图', clip: '剪切路径', opacity: '不透明度' },
  { aria: 'composició vectorial amb retalls, elements reutilitzats i transparències', clip: 'retall', opacity: 'opacitat' },
  { aria: 'تركيب متجهي بمسار قص وعناصر معاد استخدامها وشفافية', clip: 'مسار القص', opacity: 'العتامة' },
  { aria: 'クリッピングパス、再利用する要素、透明度を使ったベクターの構成', clip: 'クリッピングパス', opacity: '不透明度' },
  { aria: 'composição vetorial com recortes, elementos reutilizados e transparências', clip: 'recorte', opacity: 'opacidade' },
  { aria: 'composition vectorielle avec détourages, éléments réutilisés et transparences', clip: 'détourage', opacity: 'opacité' },
  { aria: 'Vektorkomposition mit Beschneidungspfaden, wiederverwendeten Elementen und Transparenz', clip: 'Beschneidungspfad', opacity: 'Deckkraft' },
  { aria: 'composizione vettoriale con tracciati di ritaglio, elementi riutilizzati e trasparenze', clip: 'ritaglio', opacity: 'opacità' },
);

export function vectorClipSvg(lang: GuideLang): string {
  const { aria: ariaLabel, clip, opacity } = CLIP[lang];
  const D = 90; // disc offset
  const O = 160; // translucent circles offset
  const S = 250; // stars offset
  const stripes = Array.from({ length: 22 }, (_, i) => `<rect x="${D - 10 + i * 7}" y="0" width="3.5" height="150" fill="${P.blue}" />`).join('');
  const stars = [[210, 40], [246, 64], [226, 100], [262, 118], [200, 132]]
    .map(([x, y]) => `<use href="#star" xlink:href="#star" x="${x + S}" y="${y}" />`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${WIDE} 170" role="img" aria-label="${ariaLabel}">
  <defs>
    <clipPath id="vcDisc"><circle cx="${72 + D}" cy="80" r="56" /></clipPath>
    <path id="star" d="M0,-9 L2.6,-2.8 L9,-2.8 L3.8,1.2 L5.6,7.6 L0,3.8 L-5.6,7.6 L-3.8,1.2 L-9,-2.8 L-2.6,-2.8 Z" fill="${GILT}" />
  </defs>
  <g clip-path="url(#vcDisc)">${stripes}</g>
  <circle cx="${72 + D}" cy="80" r="56" fill="none" stroke="${P.blueDark}" stroke-width="1.2" />
  <g opacity="0.6">
    <circle cx="${160 + O}" cy="68" r="30" fill="${VERMILION}" />
    <circle cx="${182 + O}" cy="96" r="30" fill="${P.blue}" />
    <circle cx="${146 + O}" cy="104" r="30" fill="${GILT}" />
  </g>
  ${stars}
  ${text(72 + D, 158, clip, { size: 9, color: P.muted })}
  ${text(163 + O, 158, opacity, { size: 9, color: P.muted })}
  ${text(231 + S, 158, 'use', { size: 9, color: P.muted })}
</svg>`;
}

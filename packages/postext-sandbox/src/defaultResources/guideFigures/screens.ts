// The Sandbox interface sketch and the EPUB renditions figure: one page
// read on a tablet and on a phone (#1276: split out of guideFigures.ts).
import { P, text, FS, bar, PAGE_VW, edge } from '../svgKit.js';
import { byLang, type GuideLang } from '../lang.js';
import { VERMILION, num, NIGHT, card, GILT, lines } from './kit.js';

// ── The Sandbox ─────────────────────────────────────────────────────────────

/** The panels of the activity bar, the one whose editor is drawn open
 *  (with its tooltip) and the chapter the switcher shows. The Chinese and
 *  Japanese editions draw the English interface around their book; the
 *  others draw the interface in their own language. */
const SANDBOX_UI = byLang(
  {
    aria: 'Sandbox interface layout', chapter: '3 · Setting the line', scope: 'Whole book',
    panels: ['Books', 'Chapters', 'Text', 'Resources', 'Fonts', 'Design', 'Checks'],
  },
  {
    aria: 'disposición de la interfaz del Sandbox', chapter: '3 · Componer la línea', scope: 'Libro completo',
    panels: ['Libros', 'Capítulos', 'Texto', 'Recursos', 'Fuentes', 'Diseño', 'Revisión'],
  },
  {
    aria: 'Sandbox的界面布局', chapter: '3 · 排好每一行', scope: 'Whole book',
    panels: ['Books', 'Chapters', 'Text', 'Resources', 'Fonts', 'Design', 'Checks'],
  },
  {
    aria: 'disposició de la interfície del Sandbox', chapter: '3 · Compondre la línia', scope: 'Llibre complet',
    panels: ['Llibres', 'Capítols', 'Text', 'Recursos', 'Fonts', 'Disseny', 'Revisió'],
  },
  {
    // The Arabic interface's own words (messages/ar.json); the figure is
    // mirrored, as the interface is in Arabic.
    aria: 'تخطيط واجهة Sandbox', chapter: '٣ · تنضيد السطر', scope: 'الكتاب كاملًا',
    panels: ['الكتب', 'الفصول', 'النص', 'الموارد', 'الخطوط', 'التصميم', 'الفحوص'],
  },
  {
    // The Sandbox has no Japanese interface: the English one around a
    // Japanese book, as the Japanese edition's text names it.
    aria: 'Sandboxの画面構成', chapter: '3 · 一行を組む', scope: 'Whole book',
    panels: ['Books', 'Chapters', 'Text', 'Resources', 'Fonts', 'Design', 'Checks'],
  },
  {
    // The Brazilian Portuguese interface's own words (messages/pt.json).
    aria: 'disposição da interface do Sandbox', chapter: '3 · Compor a linha', scope: 'Livro inteiro',
    panels: ['Livros', 'Capítulos', 'Texto', 'Recursos', 'Fontes', 'Design', 'Verificações'],
  },
  {
    // The French interface's own words (messages/fr.json).
    aria: 'disposition de l’interface du Sandbox', chapter: '3 · Composer la ligne', scope: 'Livre entier',
    panels: ['Livres', 'Chapitres', 'Texte', 'Ressources', 'Polices', 'Maquette', 'Vérifications'],
  },
  {
    // The German interface's own words (messages/de.json).
    aria: 'Aufbau der Sandbox-Oberfläche', chapter: '3 · Die Zeile setzen', scope: 'Ganzes Buch',
    panels: ['Bücher', 'Kapitel', 'Text', 'Ressourcen', 'Schriften', 'Gestaltung', 'Prüfungen'],
  },
  {
    // The Italian interface's own words (messages/it.json).
    aria: 'disposizione dell’interfaccia della Sandbox', chapter: '3 · Comporre la riga', scope: 'Libro intero',
    panels: ['Libri', 'Capitoli', 'Testo', 'Risorse', 'Font', 'Grafica', 'Verifiche'],
  },
);

/** The Sandbox interface: activity bar with its seven panels, the text
 *  editor with the chapter switcher, and the viewport with its scope choice
 *  and five tabs showing a spread. */
export function sandboxUiSvg(lang: GuideLang): string {
  const { aria: ariaLabel, chapter, scope, panels } = SANDBOX_UI[lang];
  const TEXT_PANEL = 2;
  const CHECKS_PANEL = panels.length - 1;
  const iconY = (i: number) => 44 + i * 36;
  const icons = panels.map((_, i) => `<rect x="31" y="${iconY(i)}" width="24" height="24" rx="6" fill="${i === TEXT_PANEL ? P.blue : '#c9d4df'}" />`).join('');
  const badge = `<circle cx="55" cy="${iconY(CHECKS_PANEL) + 2}" r="6" fill="${VERMILION}" />${text(55, iconY(CHECKS_PANEL) + 5.4, num(lang, 3), { size: 8.5, color: '#ffffff', weight: 700 })}`;
  const tipW = 48;
  const tooltip = `<rect x="62" y="${iconY(TEXT_PANEL) + 2}" width="${tipW}" height="20" rx="4" fill="${NIGHT}" />${text(62 + tipW / 2, iconY(TEXT_PANEL) + 15.5, panels[TEXT_PANEL]!, { size: FS.small, color: '#ffffff' })}`;
  const edX = 80;
  const edW = 190;
  const editorWidths = [70, 150, 142, 150, 120, 150, 146, 90, 150, 134, 150];
  const editor = card(edX, 30, edW, 272, P.paper, P.hair)
    + `<rect x="${edX}" y="30" width="${edW}" height="30" rx="4" fill="#f6f8fa" />`
    + text(edX + 12, 49.5, `‹  ${chapter}  ›`, { size: FS.small, color: P.text, weight: 600, anchor: 'start' })
    + editorWidths.map((w, i) => bar(edX + 16, 76 + i * 19, w, i === 0 ? P.blue : i === 5 ? '#e7b54a' : P.barSoft, 7)).join('');
  const vx = 284;
  const vw = 332;
  // The bar as the Sandbox draws it: the scope choice at the left, the
  // five tabs at the right, Canvas open. Tab widths are Geist's at FS.small.
  const tabs: [string, number][] = [['Canvas', 35.5], ['PDF', 19.2], [lang === 'zh-Hans' ? '书页' : 'Folio', lang === 'zh-Hans' ? 20 : 21.9], ['HTML', 26.5], ['EPUB 3', 34.9]];
  const tabGap = 16;
  const tabsX = vx + vw - 14 - tabs.reduce((w, [, tw]) => w + tw, 0) - tabGap * (tabs.length - 1);
  let tabX = tabsX;
  const tabLabels = tabs.map(([t, tw], i) => {
    const label = text(tabX, 50, t, { size: FS.small, color: i === 0 ? P.blueDark : P.muted, weight: i === 0 ? 600 : 400, anchor: 'start' });
    tabX += tw + tabGap;
    return label;
  }).join('');
  const viewport = card(vx, 30, vw, 272, P.paper, P.hair)
    + tabLabels
    + `<rect x="${tabsX - 3}" y="58" width="${tabs[0]![1] + 6}" height="3.5" rx="1.75" fill="${P.blue}" />`
    + `<rect x="${vx + 14}" y="37" width="88" height="20" rx="10" fill="${P.blueTint}" stroke="${P.blueMid}" />`
    + text(vx + 58, 51, scope, { size: FS.small, color: P.blueDark, weight: 600 })
    + `<line x1="${vx}" y1="66" x2="${vx + vw}" y2="66" stroke="${P.hair}" />`;
  // A spread in the viewport: opener verso, body recto.
  const sx = vx + 44;
  const sy = 86;
  const pw = 122;
  const ph = 196;
  let spread = card(sx, sy, pw, ph) + card(sx + pw, sy, pw, ph);
  spread += `<rect x="${sx}" y="${sy}" width="${pw}" height="58" fill="${GILT}" />`;
  spread += bar(sx + 10, sy + 16, 40, '#ffffff', 3) + bar(sx + 10, sy + 25, 80, '#ffffff', 9) + bar(sx + 10, sy + 40, 96, '#fbe9bd', 3);
  spread += lines(sx + 10, sy + 70, sy + ph - 12, 46, 7, '#c8d3e0', 6, 3) + lines(sx + 66, sy + 70, sy + ph - 12, 46, 7, '#c8d3e0', 6, 3);
  const rx = sx + pw;
  spread += `<rect x="${rx + 10}" y="${sy + 14}" width="102" height="44" rx="2" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="1" />`;
  spread += lines(rx + 10, sy + 66, sy + ph - 12, 46, 7, '#c8d3e0', 6, 3) + lines(rx + 66, sy + 66, sy + ph - 12, 46, 7, '#c8d3e0', 6, 3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 322" role="img" aria-label="${ariaLabel}">
  <rect x="16" y="14" width="${PAGE_VW - 32}" height="300" rx="12" fill="${P.panel}" stroke="${P.edgeSoft}" />
  ${icons}${badge}${editor}${viewport}${spread}${tooltip}
</svg>`;
}

// ── EPUB renditions ─────────────────────────────────────────────────────────

/** One layout written as the two EPUB 3 renditions: on the left a tablet
 *  showing the fixed layout, the printed spread as it is; on the right a
 *  phone showing the reflowable book, one column of larger type with the
 *  figure after its text and a marker where printed page 12 begins. */
const EPUB_RENDITIONS = byLang(
  {
    aria: 'one layout written as a fixed-layout and as a reflowable EPUB', page: 'The layout', pageNote: 'pages, columns, lines',
    fixed: 'Fixed layout', fixedNote: 'one document per printed page', flow: 'Reflowable', flowNote: 'one document per chapter', marker: 'p. 12',
  },
  {
    aria: 'una misma maquetación escrita como EPUB de maquetación fija y como EPUB fluido', page: 'La maquetación', pageNote: 'páginas, columnas, líneas',
    fixed: 'Maquetación fija', fixedNote: 'un documento por página impresa', flow: 'Maquetación fluida', flowNote: 'un documento por capítulo', marker: 'p. 12',
  },
  {
    aria: '同一个版面写成固定版式和流式版式两种EPUB', page: '版面', pageNote: '页、栏、行',
    fixed: '固定版式', fixedNote: '每个印刷页一个文档', flow: '流式版式', flowNote: '每章一个文档', marker: '第12页',
  },
  {
    aria: 'una mateixa maquetació escrita com a EPUB de maquetació fixa i com a EPUB fluid', page: 'La maquetació', pageNote: 'pàgines, columnes, línies',
    fixed: 'Maquetació fixa', fixedNote: 'un document per pàgina impresa', flow: 'Maquetació fluida', flowNote: 'un document per capítol', marker: 'p. 12',
  },
  {
    aria: 'إخراج واحد يُكتب ملف EPUB بتخطيط ثابت وملفًا قابلًا لإعادة التدفق', page: 'الإخراج', pageNote: 'صفحات وأعمدة وأسطر',
    fixed: 'تخطيط ثابت', fixedNote: 'مستند لكل صفحة مطبوعة', flow: 'قابل لإعادة التدفق', flowNote: 'مستند لكل فصل', marker: 'ص ١٢',
  },
  {
    aria: '一つの版面を固定レイアウトとリフロー型の二つのEPUBに書き出す', page: '版面', pageNote: 'ページ・段・行',
    fixed: '固定レイアウト', fixedNote: '印刷ページごとに一文書', flow: 'リフロー型', flowNote: '章ごとに一文書', marker: '12ページ',
  },
  {
    aria: 'uma mesma diagramação gravada como EPUB de layout fixo e como EPUB fluido', page: 'A diagramação', pageNote: 'páginas, colunas, linhas',
    fixed: 'Layout fixo', fixedNote: 'um documento por página impressa', flow: 'Layout fluido', flowNote: 'um documento por capítulo', marker: 'p. 12',
  },
  {
    aria: 'une même mise en page écrite en EPUB à mise en page fixe et en EPUB recomposable', page: 'La mise en page', pageNote: 'pages, colonnes, lignes',
    fixed: 'Mise en page fixe', fixedNote: 'un document par page imprimée', flow: 'Recomposable', flowNote: 'un document par chapitre', marker: 'p. 12',
  },
  {
    aria: 'ein Layout, geschrieben als EPUB mit festem Layout und als umfließendes EPUB', page: 'Das Layout', pageNote: 'Seiten, Spalten, Zeilen',
    fixed: 'Festes Layout', fixedNote: 'ein Dokument je gedruckter Seite', flow: 'Umfließend', flowNote: 'ein Dokument je Kapitel', marker: 'S. 12',
  },
  {
    aria: 'una stessa impaginazione scritta come EPUB a layout fisso e come EPUB fluido', page: 'L’impaginazione', pageNote: 'pagine, colonne, righe',
    fixed: 'Layout fisso', fixedNote: 'un documento per pagina stampata', flow: 'Layout fluido', flowNote: 'un documento per capitolo', marker: 'p. 12',
  },
);

export function epubRenditionsSvg(lang: GuideLang): string {
  const { aria: ariaLabel, page, pageNote, fixed, fixedNote, flow, flowNote, marker } = EPUB_RENDITIONS[lang];
  const labelY = 210;
  const label = (cx: number, name: string, note: string): string =>
    text(cx, labelY, name, { size: FS.label, weight: 600 }) + text(cx, labelY + 14, note, { size: FS.small, color: P.muted, italic: true });
  /** A printed page in miniature: a running head, two columns, a figure
   *  at the head of the second column; `band` opens it as a chapter. */
  const miniPage = (x: number, y: number, w: number, h: number, band: boolean): string => {
    const m = w * 0.09;
    const colW = (w - 3 * m) / 2;
    const top = y + (band ? h * 0.3 : m * 1.6);
    const pitch = w / 20;
    const barH = pitch * 0.45;
    let out = card(x, y, w, h);
    if (band) out += `<rect x="${x}" y="${y}" width="${w}" height="${h * 0.24}" fill="${GILT}" />` + bar(x + m, y + h * 0.1, w * 0.5, '#ffffff', barH * 1.8);
    else out += bar(x + m, y + m * 0.7, w * 0.3, '#dde4ec', barH * 0.8);
    out += lines(x + m, top, y + h - m, colW, pitch, '#c8d3e0', 6, barH);
    const fx = x + 2 * m + colW;
    const figH = band ? 0 : h * 0.26;
    if (figH) out += `<rect x="${fx}" y="${top}" width="${colW}" height="${figH}" rx="1.5" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="0.8" />`;
    out += lines(fx, top + (figH ? figH + pitch : 0), y + h - m, colW, pitch, '#c8d3e0', 6, barH);
    return out;
  };
  // The tablet, landscape, showing the printed spread.
  const tx = 51;
  const tw = 236;
  const ty = 18;
  const th = 168;
  const pw = 96;
  const ph = 128;
  const sy = ty + (th - ph) / 2;
  const sx = tx + (tw - 2 * pw) / 2;
  const tablet = `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="14" fill="${NIGHT}" />`
    + `<rect x="${tx + 10}" y="${ty + 10}" width="${tw - 20}" height="${th - 20}" rx="4" fill="#e9edf2" />`
    + miniPage(sx, sy, pw, ph, true) + miniPage(sx + pw, sy, pw, ph, false);
  // The layout itself: one printed page.
  const px = 327;
  const pageW = 116;
  const pageH = 152;
  const py = ty + (th - pageH) / 2;
  const layout = miniPage(px, py, pageW, pageH, false);
  // The phone, portrait, showing the same text reflowed.
  const fx = 489;
  const fw = 94;
  const fy = 8;
  const fh = 186;
  const scrX = fx + 6;
  const scrW = fw - 12;
  const m = 8;
  let flowText = `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="14" fill="${NIGHT}" />`
    + `<rect x="${scrX}" y="${fy + 14}" width="${scrW}" height="${fh - 28}" rx="3" fill="${P.paper}" />`;
  const cx = scrX + m;
  const cw = scrW - 2 * m;
  let y = fy + 24;
  flowText += bar(cx, y, cw * 0.7, P.blue, 5);
  y += 13;
  flowText += lines(cx, y, y + 34, cw, 8.5, '#c8d3e0', 4, 3.4);
  y += 36;
  flowText += `<rect x="${cx}" y="${y}" width="${cw}" height="34" rx="2" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="1" />` + bar(cx, y + 38, cw * 0.8, P.blueMid, 2.6);
  y += 48;
  flowText += lines(cx, y, y + 17, cw, 8.5, '#c8d3e0', 4, 3.4);
  y += 19;
  // The marker where printed page 12 begins.
  const tagW = lang === 'zh-Hans' ? 32 : lang === 'ja' ? 38 : 26;
  flowText += `<line x1="${cx}" y1="${y + 4}" x2="${cx + cw - tagW - 3}" y2="${y + 4}" stroke="${P.amber}" stroke-width="0.9" stroke-dasharray="2.5 2" />`
    + `<rect x="${cx + cw - tagW}" y="${y - 2}" width="${tagW}" height="12" rx="6" fill="${P.amberTint}" stroke="${P.amber}" stroke-width="0.8" />`
    + text(cx + cw - tagW / 2, y + 7, marker, { size: 7.5, color: P.amberDark, weight: 600 });
  y += 14;
  flowText += lines(cx, y, fy + fh - 18, cw, 8.5, '#c8d3e0', 4, 3.4);
  const arrows = edge(`M${px - 6},${ty + th / 2} L${tx + tw + 8},${ty + th / 2}`, { color: P.blue, marker: 'ahBlue' })
    + edge(`M${px + pageW + 6},${ty + th / 2} L${fx - 8},${ty + th / 2}`, { color: P.blue, marker: 'ahBlue' });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 232" role="img" aria-label="${ariaLabel}">
  ${tablet}${layout}${flowText}${arrows}
  ${label(tx + tw / 2, fixed, fixedNote)}${label(px + pageW / 2, page, pageNote)}${label(fx + fw / 2, flow, flowNote)}
</svg>`;
}

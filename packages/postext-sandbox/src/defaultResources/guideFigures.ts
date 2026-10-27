// The guide's diagrams of page structure: column structures, where a float
// lands, the balancing levers, the anatomy of a book and the Sandbox
// interface. Same kit and unit system as the figures in `index.ts`.

import { P, bar, text, FS, PAGE_VW, edge } from './svgKit.js';
import { byLang, type GuideLang } from './lang.js';
import { card, lines, disc, num, GILT, VERMILION } from './guideFigures/kit.js';

export { bookAnatomySvg } from './guideFigures/bookAnatomy.js';
export { cjkCompositionSvg } from './guideFigures/cjkComposition.js';
export { sandboxUiSvg, epubRenditionsSvg } from './guideFigures/screens.js';
export { vectorRosetteSvg, vectorChartSvg, vectorClipSvg } from './guideFigures/vectorFigures.js';

// ── Column structures ───────────────────────────────────────────────────────

/** The layouts `layout.layoutType` offers: one column, two, and a column and
 *  a half whose side column carries text or only floats. */
const COLUMN_LAYOUTS = byLang(
  { aria: 'available column structures', labels: ['Single', 'Two columns', 'One and a half', 'Float side column'] },
  { aria: 'estructuras de columnas disponibles', labels: ['Una columna', 'Dos columnas', 'Columna y media', 'Lateral de flotantes'] },
  { aria: '可用的分栏结构', labels: ['单栏', '双栏', '一栏半', '浮动体边栏'] },
  { aria: 'estructures de columnes disponibles', labels: ['Una columna', 'Dues columnes', 'Columna i mitja', 'Lateral de flotants'] },
  { aria: 'بنى الأعمدة المتاحة', labels: ['عمود واحد', 'عمودان', 'عمود ونصف', 'عمود جانبي للعوائم'] },
  { aria: '使える段組の構成', labels: ['1段組', '2段組', '主段と脇段', '図版用の脇段'] },
  { aria: 'estruturas de colunas disponíveis', labels: ['Uma coluna', 'Duas colunas', 'Coluna e meia', 'Lateral de flutuantes'] },
  { aria: 'structures de colonnes disponibles', labels: ['Une colonne', 'Deux colonnes', 'Colonne et demie', 'Latérale à flottants'] },
  { aria: 'verfügbare Spaltenaufbauten', labels: ['Eine Spalte', 'Zwei Spalten', 'Anderthalb Spalten', 'Gleitobjektspalte'] },
  { aria: 'strutture di colonne disponibili', labels: ['Una colonna', 'Due colonne', 'Colonna e mezza', 'Laterale per flottanti'] },
);

export function columnLayoutsSvg(lang: GuideLang): string {
  const { aria: ariaLabel, labels } = COLUMN_LAYOUTS[lang];
  const W = 112;
  const H = 146;
  const y = 12;
  const xs = [30, 176, 322, 468];
  const pages = xs.map((x) => card(x, y, W, H)).join('');
  const top = y + 14;
  const bottom = y + H - 12;
  const single = lines(xs[0]! + 12, top, bottom, W - 24);
  const two = lines(xs[1]! + 12, top, bottom, 40) + lines(xs[1]! + 60, top, bottom, 40);
  const halfText = lines(xs[2]! + 12, top, bottom, 58) + lines(xs[2]! + 78, top, bottom, 22, 8, '#dde4ec');
  const fx = xs[3]! + 12;
  const floats = lines(fx, top, bottom, 58)
    + `<rect x="${fx + 66}" y="${top}" width="22" height="30" rx="2" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="1" />`
    + bar(fx + 66, top + 34, 20, P.blueMid, 2.6)
    + `<rect x="${fx + 66}" y="${top + 58}" width="22" height="26" rx="2" fill="${P.amberTint}" stroke="${P.amber}" stroke-width="1" />`
    + bar(fx + 66, top + 88, 16, P.amber, 2.6);
  const names = xs.map((x, i) => text(x + W / 2, y + H + 18, labels[i]!, { size: FS.label, weight: 600 })).join('');
  const types = ['single', 'double', 'oneAndHalf', 'oneAndHalf'];
  const code = xs.map((x, i) => text(x + W / 2, y + H + 32, types[i]!, { size: FS.small, color: P.muted, italic: true })).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 196" role="img" aria-label="${ariaLabel}">
  ${pages}${single}${two}${halfText}${floats}${names}${code}
</svg>`;
}

// ── Where a float lands ─────────────────────────────────────────────────────

/** The first free slot after the reference: the slots a figure referenced
 *  at the foot of column 1 is offered, in order, and the one it takes. */
const FLOAT_SLOTS = byLang(
  { aria: 'order of the slots offered to a float after its reference', ref: 'reference', taken: 'takes the first free slot', full: 'no room', next: 'next page' },
  { aria: 'orden de los huecos que se ofrecen a un flotante tras su referencia', ref: 'referencia', taken: 'ocupa el primer hueco libre', full: 'sin sitio', next: 'página siguiente' },
  { aria: '引用之后依次提供给浮动体的空位', ref: '引用处', taken: '占用第一个空位', full: '放不下', next: '下一页' },
  { aria: 'ordre dels espais que s\'ofereixen a un flotant després de la seva referència', ref: 'referència', taken: 'ocupa el primer espai lliure', full: 'no hi cap', next: 'pàgina següent' },
  { aria: 'ترتيب الأماكن التي تُعرض على العنصر العائم بعد الإحالة إليه', ref: 'الإحالة', taken: 'يشغل أول مكان شاغر', full: 'لا يتسع', next: 'الصفحة التالية' },
  { aria: '参照のあとでフロートに差し出される場所の順序', ref: '参照箇所', taken: '最初の空きに入る', full: '入らない', next: '次のページ' },
  { aria: 'ordem dos espaços oferecidos a um flutuante depois da sua referência', ref: 'referência', taken: 'ocupa o primeiro espaço livre', full: 'não cabe', next: 'página seguinte' },
  { aria: 'ordre des emplacements offerts à un flottant après son renvoi', ref: 'renvoi', taken: 'prend le premier emplacement libre', full: 'pas de place', next: 'page suivante' },
  { aria: 'Reihenfolge der Stellen, die einem Gleitobjekt nach seinem Verweis angeboten werden', ref: 'Verweis', taken: 'nimmt die erste freie Stelle', full: 'kein Platz', next: 'nächste Seite' },
  { aria: 'ordine delle posizioni offerte a un elemento flottante dopo il suo rimando', ref: 'rimando', taken: 'prende la prima posizione libera', full: 'non c’è spazio', next: 'pagina seguente' },
);

export function floatSlotsSvg(lang: GuideLang): string {
  const { aria: ariaLabel, ref, taken, full, next } = FLOAT_SLOTS[lang];
  const W = 250;
  const H = 172;
  const y = 16;
  const ax = 30;
  const bx = 350;
  const colW = 104;
  const c1 = ax + 14;
  const c2 = ax + 14 + colW + 14;
  const top = y + 14;
  const bottom = y + H - 12;
  const slot = (x: number, sy: number, w: number, h: number, n: string, state: 'no' | 'yes' | 'later', note = ''): string => {
    const fill = state === 'yes' ? P.blue : '#ffffff';
    const stroke = state === 'yes' ? P.blueDark : state === 'no' ? '#c5cfdb' : P.blueMid;
    const dash = state === 'yes' ? '' : ' stroke-dasharray="4 3"';
    const cx = note ? x + 16 : x + w / 2;
    return `<rect x="${x}" y="${sy}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.3"${dash} />`
      + disc(cx, sy + h / 2, num(lang, n), state === 'yes' ? '#ffffff' : state === 'no' ? '#c5cfdb' : P.blueMid, state === 'yes' ? P.blueDark : '#ffffff')
      + (note ? text(cx + 14, sy + h / 2 + 3.6, note, { size: FS.small, color: P.muted, italic: true, anchor: 'start' }) : '');
  };
  // Page A: column 1 full down to the reference line, too little room under
  // it (slot 1 refused), column 2 offered at its head (slot 2 taken).
  const refY = y + 118;
  let a = card(ax, y, W, H);
  a += lines(c1, top, refY - 2, colW);
  a += `<circle cx="${c1 + colW * 0.5 + 8}" cy="${refY + 1.8}" r="4" fill="${GILT}" />`;
  a += slot(c1, refY + 12, colW, bottom - refY - 12, '1', 'no', full);
  a += slot(c2, top, colW, 52, '2', 'yes');
  a += lines(c2, top + 62, bottom, colW);
  a += text(c1 + colW * 0.5 - 2, refY + 3.6, ref, { size: FS.small, color: '#8a6308', weight: 600, anchor: 'end' });
  // Page B: the later slots, not needed.
  const d1 = bx + 14;
  const d2 = bx + 14 + colW + 14;
  let b = card(bx, y, W, H, '#fbfcfd', '#d3dbe4');
  b += slot(d1, top, W - 28, 34, '3', 'later');
  b += lines(d1, top + 44, bottom, colW, 8, '#dde4ec') + lines(d2, top + 44, bottom, colW, 8, '#dde4ec');
  b += text(bx + W / 2, y + H + 18, next, { size: FS.small, color: P.muted, italic: true });
  const arrow = edge(`M${c1 + colW * 0.5 + 12},${refY - 2} C${c1 + colW + 30},${refY - 40} ${c2 - 30},${top + 60} ${c2 - 4},${top + 30}`, { color: P.blue, marker: 'ahBlue' });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 214" role="img" aria-label="${ariaLabel}">
  ${a}${b}${arrow}
  ${text(ax + W / 2, y + H + 18, taken, { size: FS.small, color: P.blueDark, weight: 600 })}
</svg>`;
}

// ── Column balancing ────────────────────────────────────────────────────────

/** Before and after balancing: a short second column, then the three levers
 *  that even the pair out — grid lines above a heading, a line after a list
 *  and a paragraph set one line looser. */
const BALANCING = byLang(
  { aria: 'column balancing levers', before: 'Before', after: 'After', legend: ['Space above a heading', 'A line after a list', 'A looser paragraph'] },
  { aria: 'palancas del equilibrado de columnas', before: 'Antes', after: 'Después', legend: ['Espacio sobre el título', 'Línea tras la lista', 'Párrafo más suelto'] },
  { aria: '平衡分栏的调节手段', before: '平衡前', after: '平衡后', legend: ['标题上方加空', '列表后加一行', '段落排松一行'] },
  { aria: 'palanques de l\'equilibri de columnes', before: 'Abans', after: 'Després', legend: ['Espai sobre el títol', 'Línia després de la llista', 'Paràgraf més solt'] },
  { aria: 'روافع موازنة الأعمدة', before: 'قبل', after: 'بعد', legend: ['مسافة فوق العنوان', 'سطر بعد القائمة', 'فقرة أرحب بسطر'] },
  { aria: '段末をそろえる手段', before: '調整前', after: '調整後', legend: ['見出しの前のアキ', 'リストのあとの1行', '1行ゆるく組んだ段落'] },
  { aria: 'recursos do balanceamento de colunas', before: 'Antes', after: 'Depois', legend: ['Espaço acima do título', 'Uma linha após a lista', 'Parágrafo mais solto'] },
  { aria: 'leviers de l’équilibrage des colonnes', before: 'Avant', after: 'Après', legend: ['Espace avant le titre', 'Une ligne après la liste', 'Paragraphe plus lâche'] },
  { aria: 'Hebel des Spaltenausgleichs', before: 'Vorher', after: 'Nachher', legend: ['Raum über der Überschrift', 'Eine Zeile nach der Liste', 'Lockerer gesetzter Absatz'] },
  { aria: 'leve del bilanciamento delle colonne', before: 'Prima', after: 'Dopo', legend: ['Spazio prima del titolo', 'Una riga dopo l’elenco', 'Paragrafo più lasco'] },
);

export function balancingSvg(lang: GuideLang): string {
  const { aria: ariaLabel, before, after, legend } = BALANCING[lang];
  const pitch = 9;
  const colW = 60;
  const top = 26;
  const rows = 15;
  const pair = (x: number, balanced: boolean): string => {
    let out = card(x, 14, 150, 160);
    const c1 = x + 10;
    const c2 = x + 10 + colW + 10;
    // Column 1: full.
    for (let i = 0; i < rows; i++) out += bar(c1, top + i * pitch, i % 6 === 5 ? colW * 0.55 : colW, '#c8d3e0', 3.6);
    // Column 2: a heading, a list and a paragraph; three lines short before.
    let row = 0;
    const line = (w = colW, color = '#c8d3e0', indent = 0) => { out += bar(c2 + indent, top + row * pitch, w - indent, color, 3.6); row++; };
    line(); line(colW * 0.7);
    if (balanced) {
      out += `<rect x="${c2 - 3}" y="${top + row * pitch - 3}" width="${colW + 6}" height="${pitch}" rx="2" fill="${GILT}" opacity="0.28" />`;
      row++;
    }
    out += bar(c2, top + row * pitch - 1, colW * 0.62, P.blue, 5.4); row++;
    for (let i = 0; i < 3; i++) { out += `<circle cx="${c2 + 2}" cy="${top + row * pitch + 1.8}" r="1.6" fill="${P.blue}" />`; line(colW, '#c8d3e0', 7); }
    if (balanced) {
      out += `<rect x="${c2 - 3}" y="${top + row * pitch - 3}" width="${colW + 6}" height="${pitch}" rx="2" fill="${GILT}" opacity="0.28" />`;
      row++;
    }
    const paraRows = balanced ? 5 : 4;
    const paraTop = top + row * pitch - 3;
    for (let i = 0; i < paraRows; i++) line(i === paraRows - 1 ? colW * 0.5 : colW);
    if (balanced) out += `<rect x="${c2 - 3}" y="${paraTop}" width="${colW + 6}" height="${paraRows * pitch}" rx="2" fill="none" stroke="${P.blue}" stroke-width="1.2" stroke-dasharray="3 2" />`;
    line(); line(colW * 0.8);
    if (!balanced) {
      const gapTop = top + row * pitch - 2;
      const gapBottom = top + rows * pitch - 5;
      out += `<path d="M${c2 + colW / 2},${gapTop + 2} L${c2 + colW / 2},${gapBottom}" stroke="${VERMILION}" stroke-width="1.2" stroke-dasharray="2 2" />`;
      out += `<path d="M${c2 + colW / 2 - 6},${gapBottom} L${c2 + colW / 2 + 6},${gapBottom}" stroke="${VERMILION}" stroke-width="1.4" />`;
    }
    return out;
  };
  const ax = 36;
  const bx = 250;
  const legendX = 438;
  const items = [
    `<rect x="${legendX}" y="54" width="18" height="10" rx="2" fill="${GILT}" opacity="0.28" />${text(legendX + 26, 63, `${num(lang, 1)} · ${legend[0]}`, { size: FS.small, anchor: 'start' })}`,
    `<rect x="${legendX}" y="80" width="18" height="10" rx="2" fill="${GILT}" opacity="0.28" />${text(legendX + 26, 89, `${num(lang, 2)} · ${legend[1]}`, { size: FS.small, anchor: 'start' })}`,
    `<rect x="${legendX}" y="106" width="18" height="10" rx="2" fill="none" stroke="${P.blue}" stroke-width="1.2" stroke-dasharray="3 2" />${text(legendX + 26, 115, `${num(lang, 3)} · ${legend[2]}`, { size: FS.small, anchor: 'start' })}`,
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 200" role="img" aria-label="${ariaLabel}">
  ${pair(ax, false)}${pair(bx, true)}
  <path d="M${ax + 158},94 L${bx - 8},94" stroke="${P.line}" stroke-width="1.6" fill="none" />
  <path d="M${bx - 14},89 L${bx - 7},94 L${bx - 14},99" stroke="${P.line}" stroke-width="1.6" fill="none" />
  ${text(ax + 75, 192, before, { size: FS.label, weight: 600 })}
  ${text(bx + 75, 192, after, { size: FS.label, weight: 600 })}
  ${items}
</svg>`;
}

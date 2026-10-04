// The guide's diagrams of page structure: column structures, where a float
// lands, the balancing levers, the anatomy of a book and the Sandbox
// interface. Same kit and unit system as the figures in `index.ts`.

import { FS, P, PAGE_VW, SERIF_ZH, bar, edge, text } from './svgKit';
import { byLang, type GuideLang } from './lang';

const NIGHT = '#15171c';
const GILT = '#d8a21a';
const VERMILION = '#c0452f';

/** A page card. */
function card(x: number, y: number, w: number, h: number, fill: string = P.paper, stroke: string = P.edgeSoft): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.1" />`;
}

/** Text-line bars filling a column from `top` to `bottom`, the last line of
 *  every `every`-line paragraph ending short. */
function lines(x: number, top: number, bottom: number, w: number, pitch = 8, color: string = '#c8d3e0', every = 5, h = 3.6): string {
  let out = '';
  let i = 0;
  for (let y = top; y + h <= bottom; y += pitch, i++) {
    const short = i % every === every - 1;
    out += bar(x, y, short ? w * 0.6 : w, color, h);
  }
  return out;
}

/** A numbered disc. */
function disc(cx: number, cy: number, n: string, fill: string, color = '#ffffff', r = 8.5): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" />${text(cx, cy + 3.6, n, { size: FS.small, color, weight: 700 })}`;
}

// ── Column structures ───────────────────────────────────────────────────────

/** The layouts `layout.layoutType` offers: one column, two, and a column and
 *  a half whose side column carries text or only floats. */
const COLUMN_LAYOUTS = byLang(
  { aria: 'available column structures', labels: ['Single', 'Two columns', 'One and a half', 'Float side column'] },
  { aria: 'estructuras de columnas disponibles', labels: ['Una columna', 'Dos columnas', 'Columna y media', 'Lateral de flotantes'] },
  { aria: '可用的分栏结构', labels: ['单栏', '双栏', '一栏半', '浮动体边栏'] },
  { aria: 'estructures de columnes disponibles', labels: ['Una columna', 'Dues columnes', 'Columna i mitja', 'Lateral de flotants'] },
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
      + disc(cx, sy + h / 2, n, state === 'yes' ? '#ffffff' : state === 'no' ? '#c5cfdb' : P.blueMid, state === 'yes' ? P.blueDark : '#ffffff')
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
    `<rect x="${legendX}" y="54" width="18" height="10" rx="2" fill="${GILT}" opacity="0.28" />${text(legendX + 26, 63, `1 · ${legend[0]}`, { size: FS.small, anchor: 'start' })}`,
    `<rect x="${legendX}" y="80" width="18" height="10" rx="2" fill="${GILT}" opacity="0.28" />${text(legendX + 26, 89, `2 · ${legend[1]}`, { size: FS.small, anchor: 'start' })}`,
    `<rect x="${legendX}" y="106" width="18" height="10" rx="2" fill="none" stroke="${P.blue}" stroke-width="1.2" stroke-dasharray="3 2" />${text(legendX + 26, 115, `3 · ${legend[2]}`, { size: FS.small, anchor: 'start' })}`,
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

// ── Anatomy of a book ───────────────────────────────────────────────────────

/** The pages a book is made of and the role each one plays for the running
 *  heads (`pages` filter of a design element): cover, contents, part
 *  divider, chapter opener and body pages. */
const BOOK_ANATOMY = byLang(
  { aria: 'anatomy of a book set with Postext', names: ['Cover', 'Contents', 'Part', 'Opener', 'Body', 'Body'] },
  { aria: 'anatomía de un libro compuesto con Postext', names: ['Cubierta', 'Índice', 'Parte', 'Apertura', 'Cuerpo', 'Cuerpo'] },
  { aria: '用Postext排出的一本竖排书的构成，从右向左读', names: ['封面', '目录', '篇章页', '章首页', '正文页', '正文页'] },
  { aria: 'anatomia d\'un llibre compost amb Postext', names: ['Coberta', 'Índex', 'Part', 'Obertura', 'Cos', 'Cos'] },
);

/** Vertical text-line bars: columns from `right` leftward to `left`, each
 *  running down from `top` to `bottom`, the last column of every
 *  `every`-column paragraph ending short. */
function columnsOf(right: number, left: number, top: number, bottom: number, pitch = 6, color = '#c8d3e0', every = 6, w = 2.6): string {
  let out = '';
  let i = 0;
  for (let x = right - w; x >= left; x -= pitch, i++) {
    const short = i % every === every - 1;
    out += `<rect x="${x}" y="${top}" width="${w}" height="${(bottom - top) * (short ? 0.55 : 1)}" rx="${w / 2}" fill="${color}" />`;
  }
  return out;
}

/** The anatomy of the Chinese edition: the same six pages set vertically
 *  and read from the right, as the book is bound — the cover's title strip,
 *  a contents of columns with leaders down to the folios, a part divider,
 *  an opener with its band down the right edge, and body pages in two
 *  tiers with fore-edge heads. */
function bookAnatomyVerticalSvg(): string {
  const { aria, names } = BOOK_ANATOMY['zh-Hans'];
  const roles = ['heading style', ':::toc', ':::part', 'opener', 'body', 'body'];
  const W = 84;
  const H = 112;
  const y = 12;
  const gap = 18;
  const x0 = (PAGE_VW - (6 * W + 5 * gap)) / 2;
  // Right to left: the cover is the rightmost card.
  const xs = Array.from({ length: 6 }, (_, i) => x0 + (5 - i) * (W + gap));
  const vbar = (x: number, top: number, len: number, color: string, w: number) =>
    `<rect x="${x}" y="${top}" width="${w}" height="${len}" rx="${Math.min(w, len) / 2}" fill="${color}" />`;
  const tiers = (x: number, right: number, left: number) =>
    columnsOf(x + right, x + left, y + 10, y + 52) + columnsOf(x + right, x + left, y + 60, y + H - 10);
  const out: string[] = [];
  // Cover: the art on the left, the title strip on the right.
  let x = xs[0]!;
  out.push(card(x, y, W, H, NIGHT, NIGHT));
  out.push(`<rect x="${x + 6}" y="${y + 22}" width="44" height="60" fill="#161920" stroke="#2c323d" stroke-width="0.8" />`, `<rect x="${x + 36}" y="${y + 22}" width="14" height="60" fill="#2b4acb" />`);
  out.push(columnsOf(x + 34, x + 8, y + 30, y + 76, 4, '#2c323d', 5, 2));
  out.push(vbar(x + 74, y + 18, 16, GILT, 2.4), vbar(x + 62, y + 18, 44, '#ffffff', 9), vbar(x + 57, y + 18, 18, GILT, 1.2), vbar(x + 52, y + 18, 30, '#9aa0aa', 3));
  // Contents: a stripe down the right edge, the title, one column an entry.
  x = xs[1]!;
  out.push(card(x, y, W, H), `<rect x="${x + W - 3}" y="${y}" width="3" height="${H}" fill="${P.blue}" />`, vbar(x + W - 14, y + 10, 18, NIGHT, 6));
  for (let c = 0; c < 9; c++) {
    const cx = x + W - 24 - c * 7;
    if (c === 0 || c === 4) { out.push(`<rect x="${cx - 0.5}" y="${y + 10}" width="4" height="4" fill="${c === 0 ? P.blue : GILT}" />`, vbar(cx, y + 17, 22, c === 0 ? P.blue : GILT, 3)); continue; }
    out.push(vbar(cx, y + 10, 30, '#c8d3e0', 3), `<path d="M${cx + 1.5},${y + 44} L${cx + 1.5},${y + 94}" stroke="#c8d3e0" stroke-width="1" stroke-dasharray="1 2" />`, vbar(cx, y + 96, 7, '#9aa7b6', 3));
  }
  // Part divider: the label, a rule and the title from the right, the
  // chapters further left, a band of ink down the left edge.
  x = xs[2]!;
  out.push(card(x, y, W, H, GILT, GILT), `<rect x="${x}" y="${y}" width="22" height="${H}" fill="${NIGHT}" />`);
  out.push(vbar(x + W - 14, y + 20, 14, '#ffffff', 2.6), vbar(x + W - 20, y + 20, 22, '#ffffff', 1.2));
  out.push(`<rect x="${x + W - 42}" y="${y + 20}" width="16" height="16" rx="1.5" fill="#ffffff" />`, `<rect x="${x + W - 42}" y="${y + 40}" width="16" height="16" rx="1.5" fill="#ffffff" />`);
  out.push(vbar(x + 38, y + 20, 30, '#ffffff', 2.4), vbar(x + 32, y + 20, 24, '#ffffff', 2.4));
  // Chapter opener: the band down the right edge, two tiers to its left.
  x = xs[3]!;
  out.push(card(x, y, W, H), `<rect x="${x + W - 34}" y="${y}" width="34" height="${H}" fill="${GILT}" />`);
  out.push(vbar(x + W - 10, y + 9, 22, '#ffffff', 2.4), vbar(x + W - 18, y + 9, 44, '#ffffff', 6), vbar(x + W - 25, y + 9, 56, '#fbe9bd', 2.4), vbar(x + W - 30, y + 9, 40, '#fbe9bd', 2.4));
  out.push(`<path d="M${x + W - 18},${y + 84} L${x + W - 10},${y + 84} L${x + W - 10},${y + 102} L${x + W - 18},${y + 102} Z" fill="#ffffff" />`);
  out.push(tiers(x, W - 40, 8));
  // Body with a figure standing at the head of the upper tier, the running
  // head down the fore-edge.
  x = xs[4]!;
  out.push(card(x, y, W, H), vbar(x + 3, y + 14, 22, '#9aa7b6', 1.8));
  out.push(`<rect x="${x + W - 34}" y="${y + 10}" width="26" height="42" rx="1.5" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="0.9" />`);
  out.push(columnsOf(x + W - 38, x + 8, y + 10, y + 52), columnsOf(x + W - 8, x + 8, y + 60, y + H - 10));
  // Body with a panel across both tiers.
  x = xs[5]!;
  out.push(card(x, y, W, H), vbar(x + 3, y + 14, 22, '#9aa7b6', 1.8));
  out.push(tiers(x, W - 8, W - 32), tiers(x, 32, 8));
  out.push(`<rect x="${x + 36}" y="${y + 10}" width="${W - 72 + 4}" height="${H - 20}" rx="1" fill="${NIGHT}" />`, vbar(x + 44, y + 15, 18, GILT, 2.4), vbar(x + 40, y + 15, 24, '#9aa0aa', 2.4), vbar(x + 40, y + 45, 24, '#9aa0aa', 2.4), vbar(x + 40, y + 75, 20, '#9aa0aa', 2.4));
  // Labels.
  xs.forEach((px, i) => {
    out.push(text(px + W / 2, y + H + 17, names[i]!, { size: FS.label, weight: 600 }));
    out.push(text(px + W / 2, y + H + 31, roles[i]!, { size: FS.small, color: P.muted, italic: true }));
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 168" role="img" aria-label="${aria}">
  ${out.join('')}
</svg>`;
}

export function bookAnatomySvg(lang: GuideLang): string {
  if (lang === 'zh-Hans') return bookAnatomyVerticalSvg();
  const { aria: ariaLabel, names } = BOOK_ANATOMY[lang];
  const roles = ['heading style', ':::toc', ':::part', 'opener', 'body', 'body'];
  const W = 84;
  const H = 112;
  const y = 12;
  const gap = 18;
  const x0 = (PAGE_VW - (6 * W + 5 * gap)) / 2;
  const xs = Array.from({ length: 6 }, (_, i) => x0 + i * (W + gap));
  const out: string[] = [];
  // Cover.
  let x = xs[0]!;
  out.push(card(x, y, W, H, NIGHT, NIGHT));
  for (let r = 0; r < 6; r++) out.push(bar(x + 10, y + 12 + r * 7, W - 20, '#2c323d', 3));
  out.push(bar(x + 8, y + 64, 28, GILT, 2.4), bar(x + 8, y + 72, 56, '#ffffff', 9), bar(x + 8, y + 86, 40, '#9aa0aa', 3));
  // Contents.
  x = xs[1]!;
  out.push(card(x, y, W, H), `<rect x="${x}" y="${y}" width="${W}" height="3" fill="${P.blue}" />`, bar(x + 8, y + 12, 40, NIGHT, 6));
  for (let r = 0; r < 9; r++) {
    const ry = y + 30 + r * 8.5;
    if (r === 0 || r === 4) { out.push(`<rect x="${x + 8}" y="${ry}" width="4" height="4" fill="${r === 0 ? P.blue : GILT}" />`, bar(x + 15, ry + 0.5, 30, r === 0 ? P.blue : GILT, 3)); continue; }
    out.push(bar(x + 8, ry, 34, '#c8d3e0', 3), `<path d="M${x + 45},${ry + 2.4} L${x + 68},${ry + 2.4}" stroke="#c8d3e0" stroke-width="1" stroke-dasharray="1 2" />`, bar(x + 70, ry, 6, '#9aa7b6', 3));
  }
  // Part divider.
  x = xs[2]!;
  out.push(card(x, y, W, H, GILT, GILT), `<rect x="${x}" y="${y + H - 24}" width="${W}" height="24" fill="${NIGHT}" />`);
  out.push(bar(x + 8, y + 18, 20, '#ffffff', 2.6));
  out.push(`<path d="M${x + 12},${y + 28} L${x + 20},${y + 28} L${x + 20},${y + 56} L${x + 12},${y + 56} Z" fill="#ffffff" />`, bar(x + 8, y + 64, 60, '#ffffff', 7), bar(x + 8, y + 74, 40, '#ffffff', 7));
  // Chapter opener.
  x = xs[3]!;
  out.push(card(x, y, W, H), `<rect x="${x}" y="${y}" width="${W}" height="40" fill="${GILT}" />`);
  out.push(bar(x + 8, y + 9, 24, '#ffffff', 2.4), bar(x + 8, y + 16, 44, '#ffffff', 6), bar(x + 8, y + 27, 58, '#fbe9bd', 2.4));
  out.push(`<path d="M${x + 66},${y + 8} L${x + 74},${y + 8} L${x + 74},${y + 32} L${x + 66},${y + 32} Z" fill="#ffffff" />`);
  out.push(lines(x + 8, y + 50, y + H - 14, 31, 6, '#c8d3e0', 6, 2.6), lines(x + 45, y + 50, y + H - 14, 31, 6, '#c8d3e0', 6, 2.6));
  out.push(text(x + W / 2, y + H - 4, '7', { size: 7, color: '#8a6308', weight: 700 }));
  // Body with a figure.
  x = xs[4]!;
  out.push(card(x, y, W, H), bar(x + 8, y + 7, 30, '#9aa7b6', 2.2), `<path d="M${x + 8},${y + 12} L${x + W - 8},${y + 12}" stroke="#dde4ec" stroke-width="0.8" />`);
  out.push(`<rect x="${x + 8}" y="${y + 18}" width="31" height="24" rx="1.5" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="0.9" />`);
  out.push(lines(x + 8, y + 48, y + H - 8, 31, 6, '#c8d3e0', 6, 2.6), lines(x + 45, y + 18, y + H - 8, 31, 6, '#c8d3e0', 6, 2.6));
  // Body with a page-wide panel.
  x = xs[5]!;
  out.push(card(x, y, W, H), bar(x + W - 38, y + 7, 30, '#9aa7b6', 2.2), `<path d="M${x + 8},${y + 12} L${x + W - 8},${y + 12}" stroke="#dde4ec" stroke-width="0.8" />`);
  out.push(lines(x + 8, y + 18, y + 50, 31, 6, '#c8d3e0', 6, 2.6), lines(x + 45, y + 18, y + 50, 31, 6, '#c8d3e0', 6, 2.6));
  out.push(`<rect x="${x + 8}" y="${y + 54}" width="${W - 16}" height="24" rx="1" fill="${NIGHT}" />`, bar(x + 12, y + 59, 20, GILT, 2.4), bar(x + 12, y + 66, 22, '#9aa0aa', 2.4), bar(x + 44, y + 66, 22, '#9aa0aa', 2.4));
  out.push(lines(x + 8, y + 84, y + H - 8, 31, 6, '#c8d3e0', 6, 2.6), lines(x + 45, y + 84, y + H - 8, 31, 6, '#c8d3e0', 6, 2.6));
  // Labels.
  xs.forEach((px, i) => {
    out.push(text(px + W / 2, y + H + 17, names[i]!, { size: FS.label, weight: 600 }));
    out.push(text(px + W / 2, y + H + 31, roles[i]!, { size: FS.small, color: P.muted, italic: true }));
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 168" role="img" aria-label="${ariaLabel}">
  ${out.join('')}
</svg>`;
}

// ── Chinese composition ─────────────────────────────────────────────────────

/** The sample line: 曹雪芹's novel and its other title, in the mainland's
 *  punctuation. Nineteen characters, seven of them marks; 》（ and 》）。
 *  meet. */
const CJK_SAMPLE = '曹雪芹著《红楼梦》（又名《石头记》）。';
/** The same line cut into two vertical lines where the rules allow (an
 *  opening bracket never ends a line). */
const CJK_VERTICAL = ['曹雪芹著《红楼梦》', '（又名《石头记》）。'];

const OPENING = new Set(['《', '（', '“', '「']);
const CLOSING = new Set(['》', '）', '”', '」']);
const STOP = new Set(['。', '，', '、']);

const CJK_COMPOSITION = byLang(
  {
    aria: 'one Chinese line at full width, in Kaiming style and set vertically',
    full: 'Full width: every mark takes a whole em', kaiming: 'Kaiming (mainland): brackets and the final stop take half an em',
    vertical: 'Vertical', ems: (n: number) => `${n} em`,
    legend: ['the blank half of a full-width mark', 'a mark set half an em wide'],
  },
  {
    aria: 'una línea en chino a ancho completo, en estilo Kaiming y en vertical',
    full: 'Ancho completo: cada signo ocupa un cuadratín', kaiming: 'Kaiming (China continental): paréntesis, signos de título y punto final, medio cuadratín',
    vertical: 'En vertical', ems: (n: number) => `${String(n).replace('.', ',')} cuadratines`,
    legend: ['la mitad en blanco de un signo de ancho completo', 'un signo compuesto en medio cuadratín'],
  },
  {
    aria: '同一行中文的全角式、开明式和竖排',
    full: '全角式：每个标点占一整格', kaiming: '开明式（大陆）：括号、书名号和行末句号占半格',
    vertical: '竖排', ems: (n: number) => `${n}格`,
    legend: ['全角标点空着的半格', '只占半格的标点'],
  },
  {
    aria: 'una línia en xinès a amplada completa, en estil Kaiming i en vertical',
    full: 'Amplada completa: cada signe ocupa un quadratí', kaiming: 'Kaiming (Xina continental): parèntesis, signes de títol i punt final, mig quadratí',
    vertical: 'En vertical', ems: (n: number) => `${String(n).replace('.', ',')} quadratins`,
    legend: ['la meitat en blanc d\'un signe d\'amplada completa', 'un signe compost en mig quadratí'],
  },
);

/** One character of the sample, in the Chinese body face, its em box's
 *  left edge at `x` and top at `top`. */
function han(x: number, top: number, ch: string, em: number): string {
  // The ideographic em box: the alphabetic baseline 0.88 em below its top.
  return `<text x="${+x.toFixed(2)}" y="${+(top + em * 0.88).toFixed(2)}" font-family="${SERIF_ZH}" font-size="${em}" fill="${NIGHT}">${ch}</text>`;
}

/** The same Chinese line set three ways: on a row of full-width cells,
 *  where each mark carries half an em of blank (tinted); in the Kaiming
 *  style, where the brackets and the stop at the line's end give that blank
 *  up; and down two vertical lines, the brackets turned a quarter and the
 *  full stop moved to the top-right corner of its cell, as mainland fonts
 *  set it. Each glyph is placed by its em box, so any Chinese face lands
 *  where the rules put it. */
export function cjkCompositionSvg(lang: GuideLang): string {
  const t = CJK_COMPOSITION[lang];
  const E = 18;
  const x0 = 24;
  const chars = [...CJK_SAMPLE];
  const out: string[] = [];
  const cell = (x: number, y: number, w: number, fill = 'none', stroke: string = P.hair): string =>
    `<rect x="${+x.toFixed(2)}" y="${y}" width="${+w.toFixed(2)}" height="${E}" fill="${fill}" stroke="${stroke}" stroke-width="0.8" />`;
  const isMark = (ch: string) => OPENING.has(ch) || CLOSING.has(ch) || STOP.has(ch);
  const blank = (x: number, y: number, w: number) => `<rect x="${+x.toFixed(2)}" y="${y}" width="${w}" height="${E}" fill="${P.amberTint}" />`;

  // Row 1: full width. The blank half of each mark is tinted: before the
  // glyph of an opening bracket, after that of a closing one or a stop.
  const top1 = 40;
  out.push(text(x0, top1 - 10, t.full, { size: FS.small, color: P.muted, anchor: 'start' }));
  chars.forEach((ch, i) => {
    const x = x0 + i * E;
    if (isMark(ch)) out.push(blank(OPENING.has(ch) ? x : x + E / 2, top1, E / 2));
    out.push(cell(x, top1, E));
    out.push(han(x, top1, ch, E));
  });
  const end1 = x0 + chars.length * E;
  out.push(text(end1 + 8, top1 + 13, t.ems(chars.length), { size: FS.small, color: P.amberDark, weight: 600, anchor: 'start' }));

  // Row 2: Kaiming. Every bracket half an em (its glyph half kept), the
  // full stop half an em at the line's end; the characters close up.
  const top2 = 108;
  out.push(text(x0, top2 - 10, t.kaiming, { size: FS.small, color: P.muted, anchor: 'start' }));
  let x = x0;
  chars.forEach((ch) => {
    if (isMark(ch)) {
      out.push(cell(x, top2, E / 2, P.blueTint, P.blueMid));
      // The glyph sits in the half of its em box the blank did not take.
      out.push(han(OPENING.has(ch) ? x - E / 2 : x, top2, ch, E));
      x += E / 2;
    } else {
      out.push(cell(x, top2, E));
      out.push(han(x, top2, ch, E));
      x += E;
    }
  });
  out.push(text(x + 8, top2 + 13, t.ems((x - x0) / E), { size: FS.small, color: P.blueDark, weight: 600, anchor: 'start' }));

  // Legend.
  const ly = 160;
  out.push(blank(x0 + 9, ly, 9), `<rect x="${x0}" y="${ly}" width="18" height="${E}" fill="none" stroke="${P.hair}" stroke-width="0.8" />`);
  out.push(text(x0 + 28, ly + 12.5, t.legend[0]!, { size: FS.small, color: P.muted, anchor: 'start' }));
  out.push(`<rect x="${x0 + 9}" y="${ly + 28}" width="9" height="${E}" fill="${P.blueTint}" stroke="${P.blueMid}" stroke-width="0.8" />`);
  out.push(text(x0 + 28, ly + 40.5, t.legend[1]!, { size: FS.small, color: P.muted, anchor: 'start' }));

  // Vertical: two lines, right to left, one em per cell.
  const colRight = 600;
  const colGap = 14;
  const vTop = 40;
  const vCentre = colRight - E - colGap / 2;
  out.push(text(vCentre, vTop - 10, t.vertical, { size: FS.small, color: P.muted }));
  CJK_VERTICAL.forEach((line, li) => {
    const cx = colRight - E - li * (E + colGap);
    [...line].forEach((ch, i) => {
      const y = vTop + i * E;
      out.push(cell(cx, y, E));
      if (OPENING.has(ch) || CLOSING.has(ch)) {
        // Turned a quarter clockwise about the cell's centre: an opening
        // bracket's glyph moves from the right half to the lower one.
        out.push(`<g transform="rotate(90 ${cx + E / 2} ${y + E / 2})">${han(cx, y, ch, E)}</g>`);
      } else if (STOP.has(ch)) {
        // Mainland faces set 。，、 in the top-right corner of the cell.
        out.push(han(cx + E * 0.6, y - E * 0.62, ch, E));
      } else {
        out.push(han(cx, y, ch, E));
      }
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 232" role="img" aria-label="${t.aria}">
  ${out.join('\n  ')}
</svg>`;
}

// ── The Sandbox ─────────────────────────────────────────────────────────────

/** The panels of the activity bar, the one whose editor is drawn open
 *  (with its tooltip) and the chapter the switcher shows. The Sandbox's
 *  interface is in English or Spanish, so the Chinese edition draws the
 *  English one around a Chinese book. */
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
  const badge = `<circle cx="55" cy="${iconY(CHECKS_PANEL) + 2}" r="6" fill="${VERMILION}" />${text(55, iconY(CHECKS_PANEL) + 5.4, '3', { size: 8.5, color: '#ffffff', weight: 700 })}`;
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

// ── Vector specimens ────────────────────────────────────────────────────────
// Three figures drawn only with the SVG subset the PDF renders natively
// (paths, basic shapes, groups, `use`, clip paths, solid fills and strokes,
// opacity, text), so zooming into the PDF shows them staying crisp.

// Page-span canvases, on the shared unit scale (see index.ts).
const WIDE = PAGE_VW;

/** A rosette of Bézier petals, hairline rings and microtext. */
const ROSETTE = byLang(
  { aria: 'vector rosette of petals, rings and microtext', micro: 'Postext · vector · zoom · ' },
  { aria: 'roseta vectorial de pétalos, anillos y microtexto', micro: 'Postext · vector · zoom · ' },
  { aria: '由花瓣、圆环和微缩文字组成的矢量玫瑰花饰', micro: 'Postext · 矢量 · 缩放 · ' },
  { aria: 'roseta vectorial de pètals, anells i microtext', micro: 'Postext · vector · zoom · ' },
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
  const grid = [0, 10, 20, 30, 40, 50].map((v) => `<line x1="${x0}" y1="${Y(v).toFixed(1)}" x2="${x1}" y2="${Y(v).toFixed(1)}" stroke="${P.hair}" stroke-width="0.6" />${text(x0 - 6, Y(v) + 3.2, String(v), { size: 8.5, color: P.muted, anchor: 'end' })}`).join('');
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

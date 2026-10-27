// The anatomy of a book: the horizontal spread and the vertical one of the
// Chinese and Japanese editions (#1276: split out of guideFigures.ts).
import { bar, PAGE_VW, P, text, FS } from '../svgKit.js';
import { byLang, type GuideLang } from '../lang.js';
import { card, NIGHT, GILT, lines, num } from './kit.js';

// ── Anatomy of a book ───────────────────────────────────────────────────────

/** The pages a book is made of and the role each one plays for the running
 *  heads (`pages` filter of a design element): cover, contents, part
 *  divider, chapter opener and body pages. */
const BOOK_ANATOMY = byLang(
  { aria: 'anatomy of a book set with Postext', names: ['Cover', 'Contents', 'Part', 'Opener', 'Body', 'Body'] },
  { aria: 'anatomía de un libro compuesto con Postext', names: ['Cubierta', 'Índice', 'Parte', 'Apertura', 'Cuerpo', 'Cuerpo'] },
  { aria: '用Postext排出的一本竖排书的构成，从右向左读', names: ['封面', '目录', '篇章页', '章首页', '正文页', '正文页'] },
  { aria: 'anatomia d\'un llibre compost amb Postext', names: ['Coberta', 'Índex', 'Part', 'Obertura', 'Cos', 'Cos'] },
  { aria: 'بنية كتاب منضّد بـPostext، يُقرأ من اليمين إلى اليسار', names: ['الغلاف', 'المحتويات', 'الجزء', 'الافتتاحية', 'المتن', 'المتن'] },
  { aria: 'Postextで組んだ縦組みの本の構成。右から左へ読む', names: ['表紙', '目次', '部扉', '章扉', '本文', '本文'] },
  { aria: 'anatomia de um livro composto com o Postext', names: ['Capa', 'Sumário', 'Parte', 'Abertura', 'Miolo', 'Miolo'] },
  { aria: 'anatomie d’un livre composé avec Postext', names: ['Couverture', 'Sommaire', 'Partie', 'Ouverture', 'Page courante', 'Page courante'] },
  { aria: 'Aufbau eines mit Postext gesetzten Buches', names: ['Umschlag', 'Inhalt', 'Teil', 'Auftakt', 'Textseite', 'Textseite'] },
  { aria: 'anatomia di un libro composto con Postext', names: ['Copertina', 'Indice', 'Parte', 'Apertura', 'Testo', 'Testo'] },
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

/** The anatomy of a vertical edition: the same six pages set vertically
 *  and read from the right, as the book is bound — the cover's title strip,
 *  a contents of columns with leaders down to the folios, a part divider,
 *  an opener with its band down the right edge, and body pages in two
 *  tiers. The Chinese edition's body pages carry their heads down the
 *  fore-edge; the Japanese edition's carry a horizontal head over the type
 *  area and the folio under it, on the fore-edge side (JLReq §2.6). */
function bookAnatomyVerticalSvg(lang: GuideLang): string {
  const { aria, names } = BOOK_ANATOMY[lang];
  // The running head and folio of a body page: down the fore-edge, or
  // across the head and foot at the fore-edge side (`right`: a right-hand
  // page, whose fore-edge is its right).
  const heads = (x: number, right: boolean): string => {
    if (lang !== 'ja') return vbar(x + 3, y + 14, 22, '#9aa7b6', 1.8);
    return right
      ? bar(x + W - 30, y + 4.2, 22, '#9aa7b6', 1.8) + bar(x + W - 13, y + H - 6, 5, '#9aa7b6', 1.8)
      : bar(x + 8, y + 4.2, 22, '#9aa7b6', 1.8) + bar(x + 8, y + H - 6, 5, '#9aa7b6', 1.8);
  };
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
  out.push(card(x, y, W, H), heads(x, true));
  out.push(`<rect x="${x + W - 34}" y="${y + 10}" width="26" height="42" rx="1.5" fill="${P.blueTint}" stroke="${P.blue}" stroke-width="0.9" />`);
  out.push(columnsOf(x + W - 38, x + 8, y + 10, y + 52), columnsOf(x + W - 8, x + 8, y + 60, y + H - 10));
  // Body with a panel across both tiers.
  x = xs[5]!;
  out.push(card(x, y, W, H), heads(x, false));
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
  if (lang === 'zh-Hans' || lang === 'ja') return bookAnatomyVerticalSvg(lang);
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
  out.push(text(x + W / 2, y + H - 4, num(lang, 7), { size: 7, color: '#8a6308', weight: 700 }));
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

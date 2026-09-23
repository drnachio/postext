// The guide's diagrams of page structure: column structures, where a float
// lands, the balancing levers, the anatomy of a book and the Sandbox
// interface. Same kit and unit system as the figures in `index.ts`.

import { FS, P, PAGE_VW, bar, edge, text } from './svgKit';

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
export function columnLayoutsSvg(es: boolean): string {
  const ariaLabel = es ? 'estructuras de columnas disponibles' : 'available column structures';
  const labels = es
    ? ['Una columna', 'Dos columnas', 'Columna y media', 'Lateral de flotantes']
    : ['Single', 'Two columns', 'One and a half', 'Float side column'];
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
export function floatSlotsSvg(es: boolean): string {
  const ariaLabel = es
    ? 'orden de los huecos que se ofrecen a un flotante tras su referencia'
    : 'order of the slots offered to a float after its reference';
  const ref = es ? 'referencia' : 'reference';
  const taken = es ? 'ocupa el primer hueco libre' : 'takes the first free slot';
  const full = es ? 'sin sitio' : 'no room';
  const next = es ? 'página siguiente' : 'next page';
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
export function balancingSvg(es: boolean): string {
  const ariaLabel = es ? 'palancas del equilibrado de columnas' : 'column balancing levers';
  const before = es ? 'Antes' : 'Before';
  const after = es ? 'Después' : 'After';
  const legend = es
    ? ['Espacio sobre el título', 'Línea tras la lista', 'Párrafo más suelto']
    : ['Space above a heading', 'A line after a list', 'A looser paragraph'];
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
export function bookAnatomySvg(es: boolean): string {
  const ariaLabel = es ? 'anatomía de un libro compuesto con Postext' : 'anatomy of a book set with Postext';
  const names = es
    ? ['Cubierta', 'Índice', 'Parte', 'Apertura', 'Cuerpo', 'Cuerpo']
    : ['Cover', 'Contents', 'Part', 'Opener', 'Body', 'Body'];
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

// ── The Sandbox ─────────────────────────────────────────────────────────────

/** The Sandbox interface: activity bar with its six panels, the markdown
 *  editor with the chapter switcher, and the viewport with its three tabs
 *  showing a spread. */
export function sandboxUiSvg(es: boolean): string {
  const ariaLabel = es ? 'disposición de la interfaz del Sandbox' : 'Sandbox interface layout';
  const chapter = es ? '3 · Componer la línea' : '3 · Setting the line';
  const scope = es ? 'Libro completo' : 'Whole book';
  const panels = es
    ? ['Proyectos', 'Markdown', 'Recursos', 'Fuentes', 'Configuración', 'Avisos']
    : ['Projects', 'Markdown', 'Resources', 'Fonts', 'Configuration', 'Warnings'];
  const iconY = (i: number) => 44 + i * 36;
  const icons = panels.map((_, i) => `<rect x="31" y="${iconY(i)}" width="24" height="24" rx="6" fill="${i === 1 ? P.blue : '#c9d4df'}" />`).join('');
  const badge = `<circle cx="55" cy="${iconY(5) + 2}" r="6" fill="${VERMILION}" />${text(55, iconY(5) + 5.4, '3', { size: 8.5, color: '#ffffff', weight: 700 })}`;
  const tooltip = `<rect x="62" y="${iconY(1) + 2}" width="${es ? 64 : 64}" height="20" rx="4" fill="${NIGHT}" />${text(94, iconY(1) + 15.5, panels[1]!, { size: FS.small, color: '#ffffff' })}`;
  const edX = 80;
  const edW = 190;
  const editorWidths = [70, 150, 142, 150, 120, 150, 146, 90, 150, 134, 150];
  const editor = card(edX, 30, edW, 272, P.paper, P.hair)
    + `<rect x="${edX}" y="30" width="${edW}" height="30" rx="4" fill="#f6f8fa" />`
    + text(edX + 12, 49.5, `‹  ${chapter}  ›`, { size: FS.small, color: P.text, weight: 600, anchor: 'start' })
    + editorWidths.map((w, i) => bar(edX + 16, 76 + i * 19, w, i === 0 ? P.blue : i === 5 ? '#e7b54a' : P.barSoft, 7)).join('');
  const vx = 284;
  const vw = 332;
  const tabs = ['Canvas', 'HTML', 'PDF'];
  const viewport = card(vx, 30, vw, 272, P.paper, P.hair)
    + tabs.map((t, i) => text(vx + 40 + i * 70, 50, t, { size: FS.label, color: i === 0 ? P.blueDark : P.muted, weight: i === 0 ? 600 : 400 })).join('')
    + `<rect x="${vx + 18}" y="58" width="44" height="3.5" rx="1.75" fill="${P.blue}" />`
    + `<rect x="${vx + vw - 104}" y="37" width="90" height="20" rx="10" fill="${P.blueTint}" stroke="${P.blueMid}" />`
    + text(vx + vw - 59, 51, scope, { size: FS.small, color: P.blueDark, weight: 600 })
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

const COLUMN = 300;

/** A rosette of Bézier petals, hairline rings and microtext. */
export function vectorRosetteSvg(es: boolean): string {
  const ariaLabel = es ? 'roseta vectorial de pétalos, anillos y microtexto' : 'vector rosette of petals, rings and microtext';
  const cx = COLUMN / 2;
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
  const micro = es ? 'Postext · vector · zoom · ' : 'Postext · vector · zoom · ';
  const microText = Array.from({ length: 5 }, (_, i) => text(cx, 200 + i * 3.2, micro.repeat(5).trim(), { size: 2.6, color: P.muted })).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN} 222" role="img" aria-label="${ariaLabel}">
  ${petals.join('')}${rings}
  <circle cx="${cx}" cy="${cy}" r="10" fill="${NIGHT}" />
  ${microText}
</svg>`;
}

/** A small area-and-line chart with axes, grid and labels. */
export function vectorChartSvg(es: boolean): string {
  const ariaLabel = es ? 'gráfico vectorial de área y línea con ejes y etiquetas' : 'vector area and line chart with axes and labels';
  const months = es ? ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
  const a = [12, 18, 15, 27, 31, 29, 42, 48];
  const b = [8, 10, 14, 13, 19, 24, 22, 30];
  const x0 = 34;
  const x1 = 286;
  const y0 = 150;
  const y1 = 22;
  const X = (i: number) => x0 + (i / (a.length - 1)) * (x1 - x0);
  const Y = (v: number) => y0 - (v / 50) * (y0 - y1);
  const grid = [0, 10, 20, 30, 40, 50].map((v) => `<line x1="${x0}" y1="${Y(v).toFixed(1)}" x2="${x1}" y2="${Y(v).toFixed(1)}" stroke="${P.hair}" stroke-width="0.6" />${text(x0 - 6, Y(v) + 3.2, String(v), { size: 8.5, color: P.muted, anchor: 'end' })}`).join('');
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const area = `${line(a)} L${X(a.length - 1).toFixed(1)},${y0} L${x0},${y0} Z`;
  const dots = a.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="2.6" fill="#ffffff" stroke="${P.blue}" stroke-width="1.4" />`).join('');
  const labels = months.map((m, i) => text(X(i), y0 + 14, m, { size: 8.5, color: P.muted })).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COLUMN} 186" role="img" aria-label="${ariaLabel}">
  ${grid}
  <path d="${area}" fill="${P.blueTint}" />
  <path d="${line(b)}" fill="none" stroke="${GILT}" stroke-width="1.6" stroke-dasharray="4 3" />
  <path d="${line(a)}" fill="none" stroke="${P.blue}" stroke-width="2" stroke-linejoin="round" />
  ${dots}
  <line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="${P.line}" stroke-width="1" />
  ${labels}
  <rect x="${x0 + 4}" y="176" width="12" height="3" fill="${P.blue}" />${text(x0 + 20, 180, es ? 'páginas por segundo' : 'pages per second', { size: 8.5, anchor: 'start' })}
  <rect x="${x0 + 128}" y="176" width="12" height="3" fill="${GILT}" />${text(x0 + 144, 180, es ? 'capítulos' : 'chapters', { size: 8.5, anchor: 'start' })}
</svg>`;
}

/** Clip paths, reused elements and overlapping translucent shapes. */
export function vectorClipSvg(es: boolean): string {
  const ariaLabel = es ? 'composición vectorial con recortes, elementos reutilizados y transparencias' : 'vector composition with clip paths, reused elements and transparency';
  const stripes = Array.from({ length: 22 }, (_, i) => `<rect x="${-10 + i * 7}" y="0" width="3.5" height="150" fill="${P.blue}" />`).join('');
  const stars = [[210, 40], [246, 64], [226, 100], [262, 118], [200, 132]]
    .map(([x, y]) => `<use href="#star" xlink:href="#star" x="${x}" y="${y}" />`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${COLUMN} 170" role="img" aria-label="${ariaLabel}">
  <defs>
    <clipPath id="vcDisc"><circle cx="72" cy="80" r="56" /></clipPath>
    <path id="star" d="M0,-9 L2.6,-2.8 L9,-2.8 L3.8,1.2 L5.6,7.6 L0,3.8 L-5.6,7.6 L-3.8,1.2 L-9,-2.8 L-2.6,-2.8 Z" fill="${GILT}" />
  </defs>
  <g clip-path="url(#vcDisc)">${stripes}</g>
  <circle cx="72" cy="80" r="56" fill="none" stroke="${P.blueDark}" stroke-width="1.2" />
  <g opacity="0.6">
    <circle cx="160" cy="68" r="30" fill="${VERMILION}" />
    <circle cx="182" cy="96" r="30" fill="${P.blue}" />
    <circle cx="146" cy="104" r="30" fill="${GILT}" />
  </g>
  ${stars}
  ${text(72, 158, es ? 'recorte' : 'clip path', { size: 9, color: P.muted })}
  ${text(163, 158, es ? 'opacidad' : 'opacity', { size: 9, color: P.muted })}
  ${text(234, 158, 'use', { size: 9, color: P.muted })}
</svg>`;
}

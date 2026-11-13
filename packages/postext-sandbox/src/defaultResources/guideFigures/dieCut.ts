// The die-cut figure of the chapter on going to press (#1590): a window the
// text keeps clear of, the two sides of a leaf cut in mirror image, and a
// hole that runs through three leaves of a stack. The guide does not cut
// its own pages, so the die is drawn rather than shown.
import { P, bar, text, FS } from '../svgKit.js';
import { byLang, type GuideLang } from '../lang.js';
import { card, num, GILT } from './kit.js';

/** The die line as a press proof draws it: the magenta of the `Die` plate's
 *  default alternate, dashed. */
const DIE = '#d6157a';
/** What a hole shows of the desk or the pages beneath it. */
const BENEATH = '#e3e8ef';

const DIE_CUT = byLang(
  {
    aria: 'a die-cut window, cut on both sides of a leaf and through several leaves',
    window: 'A window', windowNote: 'text keeps clear of the cut',
    sides: 'Both sides of a leaf', sidesNote: 'the back is cut in mirror image',
    stack: 'Through the leaves', stackNote: 'one hole, three leaves, in register',
  },
  {
    aria: 'una ventana troquelada, cortada en las dos caras de una hoja y a través de varias hojas',
    window: 'Una ventana', windowNote: 'el texto se aparta del corte',
    sides: 'Las dos caras de la hoja', sidesNote: 'el dorso se corta en espejo',
    stack: 'A través de las hojas', stackNote: 'un agujero, tres hojas, en registro',
  },
  {
    aria: '模切窗口：在一张纸的两面切出，并穿过多张纸',
    window: '开窗', windowNote: '文字避开切口',
    sides: '纸的两面', sidesNote: '背面镜像切出',
    stack: '穿透多页', stackNote: '一个孔穿过三页',
  },
  {
    aria: 'una finestra troquelada, tallada a les dues cares d’un full i a través de diversos fulls',
    window: 'Una finestra', windowNote: 'el text s’aparta del tall',
    sides: 'Les dues cares del full', sidesNote: 'el revers es talla en mirall',
    stack: 'A través dels fulls', stackNote: 'un forat, tres fulls, en registre',
  },
  {
    aria: 'نافذة مقصوصة بالقالب، تُقطع على وجهي الورقة وعبر عدة أوراق',
    window: 'نافذة', windowNote: 'النص يبتعد عن القطع',
    sides: 'وجها الورقة', sidesNote: 'يُقطع الظهر معكوسًا',
    stack: 'عبر الأوراق', stackNote: 'ثقب واحد في ثلاث أوراق',
  },
  {
    aria: '型抜きの窓：一枚の紙の表と裏に、そして数枚を貫いて抜く',
    window: '窓抜き', windowNote: '文字は抜きを避ける',
    sides: '紙の表と裏', sidesNote: '裏は鏡像に抜かれる',
    stack: '数枚を貫く', stackNote: '一つの穴が三枚を通る',
  },
  {
    aria: 'uma janela de corte e vinco, cortada nas duas faces de uma folha e através de várias folhas',
    window: 'Uma janela', windowNote: 'o texto se afasta do corte',
    sides: 'As duas faces da folha', sidesNote: 'o verso é cortado espelhado',
    stack: 'Através das folhas', stackNote: 'um furo, três folhas, em registro',
  },
  {
    aria: 'une fenêtre découpée, sur les deux faces d’un feuillet et à travers plusieurs feuillets',
    window: 'Une fenêtre', windowNote: 'le texte s’écarte de la découpe',
    sides: 'Les deux faces du feuillet', sidesNote: 'le verso est découpé en miroir',
    stack: 'À travers les feuillets', stackNote: 'un trou, trois feuillets, en repérage',
  },
  {
    aria: 'ein gestanztes Fenster, auf beiden Seiten eines Blatts und durch mehrere Blätter',
    window: 'Ein Fenster', windowNote: 'der Text hält Abstand',
    sides: 'Beide Seiten des Blatts', sidesNote: 'die Rückseite gespiegelt',
    stack: 'Durch die Blätter', stackNote: 'ein Loch, drei Blätter',
  },
  {
    aria: 'una finestra fustellata, tagliata sulle due facce di un foglio e attraverso più fogli',
    window: 'Una finestra', windowNote: 'il testo si scosta dal taglio',
    sides: 'Le due facce del foglio', sidesNote: 'il retro è tagliato a specchio',
    stack: 'Attraverso i fogli', stackNote: 'un foro, tre fogli, a registro',
  },
);

/** A rounded hole with its dashed die line. */
const hole = (x: number, y: number, w: number, h: number, r = 5): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${BENEATH}" />`
  + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${DIE}" stroke-width="1.2" stroke-dasharray="3.5 2.5" />`;

/** Text-line bars filling a page from `top` to `bottom`, set short on both
 *  sides of the box `[hx, hy, hw, hh]` grown by `gap`. */
function linesAround(x: number, top: number, bottom: number, w: number, box: [number, number, number, number], gap = 5, pitch = 8): string {
  const [hx, hy, hw, hh] = box;
  let out = '';
  for (let y = top; y + 3.6 <= bottom; y += pitch) {
    if (y + 3.6 > hy - gap && y < hy + hh + gap) {
      const left = hx - gap - x;
      const right = x + w - (hx + hw + gap);
      if (left > 6) out += bar(x, y, left, P.barSoft, 3.6);
      if (right > 6) out += bar(hx + hw + gap, y, right, P.barSoft, 3.6);
    } else out += bar(x, y, w, P.barSoft, 3.6);
  }
  return out;
}

export function dieCutSvg(lang: GuideLang): string {
  const t = DIE_CUT[lang];
  const labelY = 202;
  const label = (cx: number, name: string, note: string): string =>
    text(cx, labelY, name, { size: FS.label, weight: 600 }) + text(cx, labelY + 14, note, { size: FS.small, color: P.muted, italic: true });

  // 1. A page with a window, the text set short beside it.
  const pw = 124;
  const ph = 170;
  const p1x = 42;
  const py = 12;
  const m = 12;
  const win: [number, number, number, number] = [p1x + 42, py + 58, 46, 40];
  const page1 = card(p1x, py, pw, ph) + bar(p1x + m, py + m, pw * 0.4, '#dde4ec', 3.2)
    + linesAround(p1x + m, py + 28, py + ph - m, pw - 2 * m, win)
    + hole(...win);

  // 2. The two sides of one leaf: the window near the spine edge of the
  //    recto lies near the same edge of its back, mirrored.
  const s2 = 214;
  const sw = 86;
  const sh = 120;
  const sy = py + 25;
  const back = s2;
  const front = s2 + sw + 14;
  const off = 14;
  const hw = 30;
  const hh = 26;
  const hy = sy + 40;
  const side = (x: number, holeX: number, n: number): string =>
    card(x, sy, sw, sh)
    + linesAround(x + 9, sy + 12, sy + sh - 16, sw - 18, [holeX, hy, hw, hh], 4, 7)
    + hole(holeX, hy, hw, hh, 4)
    + text(x + sw / 2, sy + sh - 5, num(lang, n), { size: 8.5, color: P.muted });
  const sides = side(front, front + off, 1) + side(back, back + sw - off - hw, 2);

  // 3. Four leaves staggered back to front, each of the three front ones a
  //    sheet with a round hole (an even-odd path) in the same place of the
  //    stack, so the holes line up and show the picture on the fourth.
  const s3 = 448;
  const lw = 112;
  const lh = 128;
  const dx = 7;
  const dy = 4;
  const hcx = 50;
  const hcy = 60;
  const r = 22;
  let stack = '';
  for (let i = 3; i >= 0; i--) {
    const x = s3 + i * dx;
    const y = py + 22 + (3 - i) * dy;
    const cxi = s3 + hcx;
    const cyi = py + 22 + 3 * dy + hcy;
    if (i === 3) {
      stack += card(x, y, lw, lh) + `<circle cx="${cxi}" cy="${cyi}" r="${r - 5}" fill="${GILT}" />`;
    } else {
      const sheet = `M${x},${y} H${x + lw} V${y + lh} H${x} Z M${cxi - r},${cyi} A${r},${r} 0 1,0 ${cxi + r},${cyi} A${r},${r} 0 1,0 ${cxi - r},${cyi} Z`;
      stack += `<path d="${sheet}" fill="${P.paper}" fill-rule="evenodd" stroke="${P.edgeSoft}" stroke-width="1.1" />`
        + (i === 0 ? `<circle cx="${cxi}" cy="${cyi}" r="${r}" fill="none" stroke="${DIE}" stroke-width="1.1" stroke-dasharray="3.5 2.5" />` : '');
    }
    stack += bar(x + 10, y + lh - 16, lw * 0.5, '#dde4ec', 3);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 634 232" role="img" aria-label="${t.aria}">
  ${page1}${sides}${stack}
  ${label(p1x + pw / 2, t.window, t.windowNote)}${label(s2 + sw + 7, t.sides, t.sidesNote)}${label(s3 + lw / 2 + 14, t.stack, t.stackNote)}
</svg>`;
}

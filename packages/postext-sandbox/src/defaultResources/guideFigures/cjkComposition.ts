// The CJK composition figure: sample text set horizontally and vertically,
// the JLReq punctuation halves and the line-start and line-end rules
// (#1276: split out of guideFigures.ts).
import { arabicDigits, SERIF_ZH, SERIF_JA, P, text, FS, PAGE_VW } from '../svgKit.js';
import { byLang, type GuideLang } from '../lang.js';
import { NIGHT } from './kit.js';

// ── Chinese composition ─────────────────────────────────────────────────────

/** The sample line: 曹雪芹's novel and its other title, in the mainland's
 *  punctuation. Nineteen characters, seven of them marks; 》（ and 》）。
 *  meet. */
const CJK_SAMPLE = '曹雪芹著《红楼梦》（又名《石头记》）。';
/** The same line cut into two vertical lines where the rules allow (an
 *  opening bracket never ends a line). */
const CJK_VERTICAL = ['曹雪芹著《红楼梦》', '（又名《石头记》）。'];

/** The Japanese edition's line: 夏目漱石's novel and the title it first ran
 *  under in the newspaper. Eighteen characters, seven of them marks;
 *  』（, 」） and ）。 meet. */
const JA_SAMPLE = '夏目漱石『こころ』（初出は「心」）。';
const JA_VERTICAL = ['夏目漱石『こころ』', '（初出は「心」）。'];

const OPENING = new Set(['《', '（', '“', '「', '『']);
const CLOSING = new Set(['》', '）', '”', '」', '』']);
const STOP = new Set(['。', '，', '、']);

/** The marks of a Japanese line that give up half an em in JLReq's
 *  setting: where two marks meet, the blank between them goes (JLReq
 *  §3.1.4) — taken from a closing mark before a closing mark or a stop, and
 *  from an opening bracket after a closing mark or a stop. A mark that
 *  meets none keeps its em, the stop at the line's end too (§3.8.3). */
function jlreqHalves(chars: string[]): boolean[] {
  const closes = (c: string | undefined) => c !== undefined && (CLOSING.has(c) || STOP.has(c));
  return chars.map((ch, i) => {
    if (OPENING.has(ch)) return closes(chars[i - 1]);
    if (CLOSING.has(ch) || STOP.has(ch)) return closes(chars[i + 1]);
    return false;
  });
}

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
  {
    aria: 'سطر صيني واحد بالعرض الكامل، وبأسلوب كايمينغ، ومنضّدًا عموديًا',
    full: 'العرض الكامل: لكل علامة مربع كامل', kaiming: 'كايمينغ (البر الصيني): الأقواس وعلامات العناوين والنقطة الأخيرة نصف مربع',
    vertical: 'عموديًا', ems: (n: number) => `${arabicDigits(String(n).replace('.', '٫'))} مربعًا`,
    legend: ['النصف الفارغ من علامة بالعرض الكامل', 'علامة منضّدة في نصف مربع'],
  },
  {
    // The Japanese edition draws a Japanese line (see `JA_COMPOSITION`):
    // its second row is JLReq's pair compression, not Kaiming.
    aria: '同じ日本語の一行のベタ組み、約物を詰めた組み、縦組み',
    full: 'ベタ組み：約物はすべて全角', kaiming: 'JLReq：約物が並ぶと間のアキを詰める',
    vertical: '縦組み', ems: (n: number) => `${n}字`,
    legend: ['全角の約物のアキの半分', '半角で組んだ約物'],
  },
  {
    aria: 'uma linha em chinês em largura total, no estilo Kaiming e na vertical',
    full: 'Largura total: cada sinal ocupa um quadratim', kaiming: 'Kaiming (China continental): parênteses, sinais de título e ponto final ocupam meio quadratim',
    vertical: 'Na vertical', ems: (n: number) => `${String(n).replace('.', ',')} quadratins`,
    legend: ['a metade em branco de um sinal de largura total', 'um sinal composto em meio quadratim'],
  },
  {
    aria: 'une ligne chinoise en pleine chasse, en style Kaiming et en vertical',
    full: 'Pleine chasse : chaque signe occupe un cadratin', kaiming: 'Kaiming (Chine continentale) : parenthèses, signes de titre et point final, demi-cadratin',
    vertical: 'En vertical', ems: (n: number) => `${String(n).replace('.', ',')} cadratins`,
    legend: ['la moitié blanche d’un signe en pleine chasse', 'un signe composé sur un demi-cadratin'],
  },
  {
    aria: 'eine chinesische Zeile in voller Breite, im Kaiming-Stil und vertikal gesetzt',
    full: 'Volle Breite: jedes Zeichen nimmt ein ganzes Quadrat ein', kaiming: 'Kaiming (Festland): Klammern und Schlusspunkt nehmen ein halbes Quadrat ein',
    vertical: 'Vertikal', ems: (n: number) => `${String(n).replace('.', ',')} Quadrate`,
    legend: ['die leere Hälfte eines Zeichens in voller Breite', 'ein Zeichen, auf ein halbes Quadrat gesetzt'],
  },
  {
    aria: 'una riga cinese a larghezza piena, in stile Kaiming e in verticale',
    full: 'Larghezza piena: ogni segno occupa un quadratino', kaiming: 'Kaiming (Cina continentale): parentesi, segni di titolo e punto finale, mezzo quadratino',
    vertical: 'In verticale', ems: (n: number) => `${String(n).replace('.', ',')} quadratini`,
    legend: ['la metà bianca di un segno a larghezza piena', 'un segno composto su mezzo quadratino'],
  },
);

/** One character of the sample, in the edition's body face (the Chinese
 *  one unless given), its em box's left edge at `x` and top at `top`. */
function han(x: number, top: number, ch: string, em: number, face: string = SERIF_ZH): string {
  // The ideographic em box: the alphabetic baseline 0.88 em below its top.
  return `<text x="${+x.toFixed(2)}" y="${+(top + em * 0.88).toFixed(2)}" font-family="${face}" font-size="${em}" fill="${NIGHT}">${ch}</text>`;
}

/** The same Chinese line set three ways: on a row of full-width cells,
 *  where each mark carries half an em of blank (tinted); in the Kaiming
 *  style, where the brackets and the stop at the line's end give that blank
 *  up; and down two vertical lines, the brackets turned a quarter and the
 *  full stop moved to the top-right corner of its cell, as mainland fonts
 *  set it. Each glyph is placed by its em box, so any Chinese face lands
 *  where the rules put it. The Japanese edition sets a Japanese line in
 *  its own face, its second row after JLReq: only where two marks meet
 *  does one give up its blank (see {@link jlreqHalves}). */
export function cjkCompositionSvg(lang: GuideLang): string {
  const t = CJK_COMPOSITION[lang];
  const ja = lang === 'ja';
  const face = ja ? SERIF_JA : SERIF_ZH;
  const E = 18;
  const x0 = 24;
  const chars = [...(ja ? JA_SAMPLE : CJK_SAMPLE)];
  const out: string[] = [];
  const cell = (x: number, y: number, w: number, fill = 'none', stroke: string = P.hair): string =>
    `<rect x="${+x.toFixed(2)}" y="${y}" width="${+w.toFixed(2)}" height="${E}" fill="${fill}" stroke="${stroke}" stroke-width="0.8" />`;
  const isMark = (ch: string) => OPENING.has(ch) || CLOSING.has(ch) || STOP.has(ch);
  const halved = ja ? jlreqHalves(chars) : chars.map(isMark);
  const blank = (x: number, y: number, w: number) => `<rect x="${+x.toFixed(2)}" y="${y}" width="${w}" height="${E}" fill="${P.amberTint}" />`;

  // Row 1: full width. The blank half of each mark is tinted: before the
  // glyph of an opening bracket, after that of a closing one or a stop.
  const top1 = 40;
  out.push(text(x0, top1 - 10, t.full, { size: FS.small, color: P.muted, anchor: 'start' }));
  chars.forEach((ch, i) => {
    const x = x0 + i * E;
    if (isMark(ch)) out.push(blank(OPENING.has(ch) ? x : x + E / 2, top1, E / 2));
    out.push(cell(x, top1, E));
    out.push(han(x, top1, ch, E, face));
  });
  const end1 = x0 + chars.length * E;
  out.push(text(end1 + 8, top1 + 13, t.ems(chars.length), { size: FS.small, color: P.amberDark, weight: 600, anchor: 'start' }));

  // Row 2: Kaiming. Every bracket half an em (its glyph half kept), the
  // full stop half an em at the line's end; the characters close up. In
  // Japanese, JLReq: the marks that meet another close up, the rest keep
  // their em.
  const top2 = 108;
  out.push(text(x0, top2 - 10, t.kaiming, { size: FS.small, color: P.muted, anchor: 'start' }));
  let x = x0;
  chars.forEach((ch, i) => {
    if (halved[i]) {
      out.push(cell(x, top2, E / 2, P.blueTint, P.blueMid));
      // The glyph sits in the half of its em box the blank did not take.
      out.push(han(OPENING.has(ch) ? x - E / 2 : x, top2, ch, E, face));
      x += E / 2;
    } else {
      out.push(cell(x, top2, E));
      out.push(han(x, top2, ch, E, face));
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
  (ja ? JA_VERTICAL : CJK_VERTICAL).forEach((line, li) => {
    const cx = colRight - E - li * (E + colGap);
    [...line].forEach((ch, i) => {
      const y = vTop + i * E;
      out.push(cell(cx, y, E));
      if (OPENING.has(ch) || CLOSING.has(ch)) {
        // Turned a quarter clockwise about the cell's centre: an opening
        // bracket's glyph moves from the right half to the lower one.
        out.push(`<g transform="rotate(90 ${cx + E / 2} ${y + E / 2})">${han(cx, y, ch, E, face)}</g>`);
      } else if (STOP.has(ch)) {
        // Mainland and Japanese faces set 。，、 in the top-right corner of
        // the cell.
        out.push(han(cx + E * 0.6, y - E * 0.62, ch, E, face));
      } else {
        out.push(han(cx, y, ch, E, face));
      }
    });
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_VW} 232" role="img" aria-label="${t.aria}">
  ${out.join('\n  ')}
</svg>`;
}

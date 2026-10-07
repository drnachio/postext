// Dev harness (not a test): letters one comic page in six languages with
// real font metrics and writes an SVG per language, to judge the balloons
// by eye. Off unless LETTER_OUT names the output directory:
//
//   LETTER_OUT=/tmp/letter-out npx vitest run src/comics/lettering/__tests__/harness.test.ts
//   rsvg-convert -w 1200 /tmp/letter-out/en.svg -o /tmp/letter-out/en.png
//
// Text is measured with fontkit from macOS system fonts (Comic Sans MS,
// Hiragino Maru Gothic, Geeza Pro); a missing font file skips the page.

import { describe, it, expect } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { clearTextWidthCache } from '../../../measure/canvas';
import { letterPanelDetailed } from '../letter';
import { presetLetteringStyles } from '../presets';
import { insetConvex } from '../geom';
import type { ComicBalloonOut, LetteringItem, LetteringPanel, LetteringStyle, Point, Rect } from '../types';
import type { VDTDesignTextBlock } from '../../../vdt';

const OUT = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env.LETTER_OUT;

interface FontkitFont {
  unitsPerEm: number;
  layout(text: string): { advanceWidth: number };
  hasGlyphForCodePoint(cp: number): boolean;
}

const FONT_FILES: Record<string, string> = {
  latin: '/System/Library/Fonts/Supplemental/Comic Sans MS.ttf',
  latinBold: '/System/Library/Fonts/Supplemental/Comic Sans MS Bold.ttf',
  cjk: '/System/Library/Fonts/ヒラギノ丸ゴ ProN W4.ttc',
  arabic: '/System/Library/Fonts/GeezaPro.ttc',
};

const FAMILY: Record<string, string> = {
  latin: 'Comic Sans MS',
  cjk: 'Hiragino Maru Gothic ProN',
  arabic: 'Geeza Pro',
};

async function loadFonts(): Promise<Record<string, FontkitFont> | undefined> {
  if (!Object.values(FONT_FILES).every((f) => existsSync(f))) return undefined;
  const fkPath = new URL('../../../../../../node_modules/.pnpm/@pdf-lib+fontkit@1.1.1/node_modules/@pdf-lib/fontkit/dist/fontkit.umd.js', import.meta.url).pathname;
  if (!existsSync(fkPath)) return undefined;
  const mod = (await import(/* @vite-ignore */ fkPath)) as { default?: unknown };
  const fontkit = (mod.default ?? mod) as { create(buf: Uint8Array): FontkitFont & { fonts?: FontkitFont[] } };
  const out: Record<string, FontkitFont> = {};
  for (const [k, f] of Object.entries(FONT_FILES)) {
    const font = fontkit.create(readFileSync(f));
    out[k] = font.fonts ? font.fonts[0]! : font;
  }
  return out;
}

function scriptOf(ch: string): 'cjk' | 'arabic' | 'latin' {
  if (/[　-ヿ㐀-鿿豈-﫿＀-￯]/.test(ch)) return 'cjk';
  if (/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(ch)) return 'arabic';
  return 'latin';
}

function installFontkitMeasure(fonts: Record<string, FontkitFont>): void {
  class Ctx {
    font = '16px sans-serif';
    measureText(s: string): { width: number } {
      const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '16');
      const bold = /\b(700|800|900|bold)\b/.test(this.font);
      let w = 0;
      let run = '';
      let runScript: string | undefined;
      const flush = () => {
        if (!run) return;
        const key = runScript === 'latin' && bold ? 'latinBold' : runScript!;
        const f = fonts[key]!;
        w += (f.layout(run).advanceWidth / f.unitsPerEm) * size;
        run = '';
      };
      for (const ch of s) {
        const sc = /[\s\d.,!?'"()\-–—…:;]/.test(ch) && runScript ? runScript : scriptOf(ch);
        if (sc !== runScript) {
          flush();
          runScript = sc;
        }
        run += ch;
      }
      flush();
      return { width: w };
    }
  }
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
    getContext(): Ctx {
      return new Ctx();
    }
  };
  clearTextWidthCache();
}

// ---------------------------------------------------------------------------
// The page: four panels, two characters, language-independent geometry.
// ---------------------------------------------------------------------------

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, width: w, height: h });
const poly = (r: Rect): Point[] => [{ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x + r.width, y: r.y + r.height }, { x: r.x, y: r.y + r.height }];

interface Figure { id: string; head: Point; r: number; face: Rect; mouth: Point }
const fig = (id: string, cx: number, cy: number, r = 42): Figure => ({
  id, head: { x: cx, y: cy }, r, face: rect(cx - r, cy - r, r * 2, r * 2), mouth: { x: cx, y: cy + r * 0.55 },
});

interface Scene {
  cell: Point[];
  figures: Figure[];
  extra?: { id: string; at: Point }[];
  avoid?: Rect[];
  draw?: string;
}

const P1 = rect(40, 40, 720, 300);
const P2 = rect(40, 352, 352, 360);
// A slanted panel: its left edge leans.
const P3cell: Point[] = [{ x: 420, y: 352 }, { x: 760, y: 352 }, { x: 760, y: 712 }, { x: 404, y: 712 }];
const P4 = rect(40, 724, 720, 336);

const SCENES: Scene[] = [
  { cell: poly(P1), figures: [fig('ana', 210, 250), fig('ben', 590, 255)], avoid: [rect(375, 215, 50, 125)],
    draw: '<rect x="375" y="215" width="50" height="125" fill="#e7d9b8" stroke="#a08850"/>' },
  { cell: poly(P2), figures: [], extra: [{ id: 'sfx', at: { x: 205, y: 460 } }],
    draw: '<rect x="110" y="420" width="190" height="292" fill="#cdb79a" stroke="#6b5332" stroke-width="3"/><circle cx="270" cy="580" r="7" fill="#6b5332"/>' },
  { cell: P3cell, figures: [fig('ana', 640, 600, 46)], extra: [{ id: 'radio', at: { x: 480, y: 655 } }],
    draw: '<rect x="455" y="640" width="60" height="40" rx="6" fill="#7a8a99" stroke="#333"/>' },
  { cell: poly(P4), figures: [fig('ben', 230, 950), fig('ana', 600, 960)] },
];

type Lines = Record<string, string>;
interface Script { panel: number; key: string; style: string; text: Lines; join?: LetteringItem['join']; tail?: LetteringItem['tailTarget']; rotate?: number; sizeScale?: number }

const SCRIPT: Script[] = [
  { panel: 0, key: 'caption', style: 'caption', text: { en: 'Lyon, 1943.', es: 'Lyon, 1943.', fr: 'Lyon, 1943.', ja: 'リヨン、一九四三年', 'zh-Hant': '里昂，一九四三年', ar: 'ليون، 1943.' } },
  { panel: 0, key: 'ana', style: 'speech', text: { en: 'Did you hear that? Something is moving down in the cellar.', es: '¿Has oído eso? Algo se mueve abajo, en el sótano.', fr: 'Tu as entendu ? Quelque chose bouge en bas, dans la cave.', ja: 'いまの音、聞こえた？地下室で何かが動いてる。', 'zh-Hant': '你聽到了嗎？地下室裡有東西在動。', ar: 'هل سمعت ذلك؟ شيء ما يتحرك في القبو.' } },
  { panel: 0, key: 'ben', style: 'whisper', text: { en: "It's nothing. Go back to sleep.", es: 'No es nada. Vuelve a dormir.', fr: "Ce n'est rien. Rendors-toi.", ja: 'なんでもないよ。もう寝なさい。', 'zh-Hant': '沒什麼。快回去睡吧。', ar: 'لا شيء. عودي إلى النوم.' } },
  { panel: 0, key: 'ben', style: 'whisper', text: { en: 'Really.', es: 'De verdad.', fr: 'Vraiment.', ja: '本当だよ。', 'zh-Hant': '真的。', ar: 'حقا.' } },
  { panel: 1, key: 'sfx', style: 'sfx', rotate: -10, text: { en: 'KRAK!', es: '¡KRAK!', fr: 'KRAK !', ja: 'バキッ', 'zh-Hant': '喀啦', ar: 'طاخ' } },
  { panel: 1, key: 'ana', style: 'shout', tail: 'end', text: { en: "Who's there?!", es: '¿¡Quién anda ahí!?', fr: 'Qui est là ?!', ja: '誰なの！？', 'zh-Hant': '是誰！？', ar: 'من هناك؟!' } },
  { panel: 2, key: 'radio', style: 'radio', text: { en: '...police report a break-in on the Rue Mercière...', es: '...la policía informa de un robo en la calle Mercière...', fr: '...la police signale un cambriolage rue Mercière...', ja: '…メルシエール通りで侵入事件が…', 'zh-Hant': '……梅西耶街發生闖入事件……', ar: '...الشرطة تبلغ عن اقتحام في شارع ميرسيير...' } },
  { panel: 2, key: 'ana', style: 'thought', text: { en: 'Nothing, he says... Nothing at all.', es: 'Nada, dice... Nada de nada.', fr: 'Rien, dit-il... Rien du tout.', ja: 'なんでもない、だって……', 'zh-Hant': '他說沒什麼……', ar: 'لا شيء، يقول... لا شيء أبدا.' } },
  { panel: 3, key: 'ben', style: 'speech', text: { en: 'Listen to me.', es: 'Escúchame.', fr: 'Écoute-moi.', ja: '聞いてくれ。', 'zh-Hant': '聽我說。', ar: 'اسمعيني.' } },
  { panel: 3, key: 'ben', style: 'speech', join: 'connector', text: { en: 'We leave tonight. Pack only what you can carry.', es: 'Nos vamos esta noche. Lleva solo lo que puedas cargar.', fr: 'On part ce soir. Ne prends que ce que tu peux porter.', ja: '今夜ここを出る。持てるものだけ持っていけ。', 'zh-Hant': '我們今晚就走。只帶你拿得動的東西。', ar: 'سنرحل الليلة. احملي فقط ما تستطيعين حمله.' } },
  { panel: 3, key: 'ana', style: 'speech', text: { en: 'And the others?', es: '¿Y los demás?', fr: 'Et les autres ?', ja: 'ほかのみんなは？', 'zh-Hant': '那其他人呢？', ar: 'والآخرون؟' } },
  { panel: 3, key: 'note', style: 'note', text: { en: '* Rue Mercière: the printers’ street.', es: '* Calle Mercière: la calle de los impresores.', fr: '* Rue Mercière : la rue des imprimeurs.', ja: '※メルシエール通り＝印刷屋街', 'zh-Hant': '※梅西耶街：印刷商之街', ar: '* شارع ميرسيير: شارع الطباعين.' } },
];

const LOCALES: { tag: string; family: string; dir: 'ltr' | 'rtl'; vertical: boolean }[] = [
  { tag: 'en', family: FAMILY.latin!, dir: 'ltr', vertical: false },
  { tag: 'es', family: FAMILY.latin!, dir: 'ltr', vertical: false },
  { tag: 'fr', family: FAMILY.latin!, dir: 'ltr', vertical: false },
  { tag: 'ja', family: FAMILY.cjk!, dir: 'rtl', vertical: true },
  { tag: 'zh-Hant', family: FAMILY.cjk!, dir: 'rtl', vertical: true },
  { tag: 'ar', family: FAMILY.arabic!, dir: 'rtl', vertical: false },
];

const EM = 13;

function letterPage(loc: (typeof LOCALES)[number]): { balloons: ComicBalloonOut[]; diags: string[] } {
  const styles = presetLetteringStyles({ fontSizePx: EM, locale: loc.tag, fontFamily: loc.family, sfxFontFamily: loc.vertical ? FAMILY.cjk : loc.tag === 'ar' ? FAMILY.arabic : FAMILY.latin });
  const balloons: ComicBalloonOut[] = [];
  const diags: string[] = [];
  let group = 0;
  SCENES.forEach((sc, pi) => {
    const panel: LetteringPanel = {
      index: pi,
      polygon: sc.cell,
      bbox: (() => {
        const xs = sc.cell.map((p) => p.x);
        const ys = sc.cell.map((p) => p.y);
        return rect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      })(),
      insetPx: 6,
      direction: loc.dir,
      writingMode: loc.vertical ? 'vertical' : 'horizontal',
      locale: loc.tag,
      anchors: [
        ...sc.figures.map((f) => ({ id: f.id, mouth: f.mouth, head: { x: f.head.x, y: f.head.y - f.r * 0.6 }, face: f.face, visible: true })),
        ...(sc.extra ?? []).map((e) => ({ id: e.id, mouth: e.at, visible: true })),
      ],
      avoid: sc.avoid ?? [],
      dpi: 96,
    };
    const items: LetteringItem[] = SCRIPT.map((s, i) => ({ s, i })).filter(({ s }) => s.panel === pi).map(({ s, i }) => {
      const kind: LetteringItem['kind'] = s.key === 'caption' ? 'caption' : s.key === 'sfx' ? 'sfx' : s.key === 'note' ? 'note' : 'balloon';
      const style: LetteringStyle = styles[s.style]!;
      return {
        id: `p${pi}-${i}`, order: i, kind, ...(kind === 'balloon' ? { speaker: s.key } : {}), text: s.text[loc.tag]!,
        sourceStart: i * 100, sourceEnd: i * 100 + 50, style,
        ...(s.join ? { join: s.join } : {}), ...(s.tail ? { tailTarget: s.tail } : {}), ...(s.rotate !== undefined ? { rotate: s.rotate } : {}),
      };
    });
    const res = letterPanelDetailed(panel, items, { groupBase: group });
    group += 100;
    balloons.push(...res.balloons);
    for (const d of res.diagnostics) diags.push(`${d.itemId}: ${d.reasons.join(',')} [${d.fallbacks.join(',')}]`);
  });
  return { balloons, diags };
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function fontAttrs(font: string): string {
  const size = /(\d*\.?\d+)px/.exec(font)?.[1] ?? '12';
  const fam = font.slice(font.indexOf('px') + 2).trim();
  const bold = /\b(700|bold)\b/.test(font) ? ' font-weight="bold"' : '';
  const italic = /\bitalic\b/.test(font) ? ' font-style="italic"' : '';
  return `font-family='${fam.replace(/'/g, '')}' font-size="${size}"${bold}${italic}`;
}

function textSvg(b: VDTDesignTextBlock, fill: string, halo?: { width: number; color: string }): string {
  const parts: string[] = [];
  const haloAttr = halo ? ` stroke="${halo.color}" stroke-width="${halo.width * 2}" stroke-linejoin="round" paint-order="stroke"` : '';
  if (b.vertical) {
    for (const l of b.lines) {
      const central = Object.values(b.vertical.centralBaselines)[0] ?? 0.38;
      const em = parseFloat(/(\d*\.?\d+)px/.exec(b.fontString)?.[1] ?? '12');
      const cx = b.bbox.x + b.bbox.width - (l.baselineY - central * em);
      parts.push(`<text x="${cx.toFixed(1)}" y="${(b.bbox.y + l.xOffset).toFixed(1)}" writing-mode="vertical-rl" ${fontAttrs(b.fontString)} fill="${fill}"${haloAttr}>${esc(l.text)}</text>`);
    }
    return parts.join('');
  }
  for (const l of b.lines) {
    if (b.direction === 'rtl') {
      parts.push(`<text x="${(b.bbox.x + l.xOffset + l.width).toFixed(1)}" y="${l.baselineY.toFixed(1)}" direction="rtl" ${fontAttrs(b.fontString)} fill="${fill}"${haloAttr}>${esc(l.text)}</text>`);
      continue;
    }
    if (!l.runs) {
      parts.push(`<text x="${(b.bbox.x + l.xOffset).toFixed(1)}" y="${l.baselineY.toFixed(1)}" ${fontAttrs(b.fontString)} fill="${fill}"${haloAttr}>${esc(l.text)}</text>`);
      continue;
    }
    let x = b.bbox.x + l.xOffset;
    const order = l.order ?? l.runs.map((_, i) => i);
    for (const i of order) {
      const r = l.runs[i]!;
      parts.push(`<text x="${x.toFixed(1)}" y="${(l.baselineY + (r.baselineShift ?? 0)).toFixed(1)}" ${fontAttrs(r.fontString)} fill="${fill}"${haloAttr}>${esc(r.text)}</text>`);
      x += r.width;
    }
  }
  return parts.join('');
}

function pageSvg(loc: (typeof LOCALES)[number], balloons: ComicBalloonOut[]): string {
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100" viewBox="0 0 800 1100"><rect width="800" height="1100" fill="#fff"/>`];
  for (const sc of SCENES) {
    const pts = sc.cell.map((p) => `${p.x},${p.y}`).join(' ');
    out.push(`<polygon points="${pts}" fill="#eef1f4"/>`);
    out.push(sc.draw ?? '');
    for (const f of sc.figures) {
      out.push(`<circle cx="${f.head.x}" cy="${f.head.y}" r="${f.r}" fill="#f2cfae" stroke="#7b5a3c" stroke-width="2"/>`);
      out.push(`<rect x="${f.face.x}" y="${f.face.y}" width="${f.face.width}" height="${f.face.height}" fill="none" stroke="#3a7bd5" stroke-dasharray="4 3"/>`);
      out.push(`<circle cx="${f.mouth.x}" cy="${f.mouth.y}" r="3" fill="#d23c1e"/>`);
      out.push(`<rect x="${f.head.x - f.r}" y="${f.head.y + f.r}" width="${f.r * 2}" height="${70}" fill="#a7b8c9" stroke="#55677a"/>`);
      out.push(`<text x="${f.head.x}" y="${f.head.y + f.r + 40}" font-size="11" text-anchor="middle" fill="#333">${f.id}</text>`);
    }
    for (const e of sc.extra ?? []) out.push(`<circle cx="${e.at.x}" cy="${e.at.y}" r="3" fill="#2a9d3f"/>`);
    const inset = insetConvex(sc.cell, 6).map((p) => `${p.x},${p.y}`).join(' ');
    out.push(`<polygon points="${inset}" fill="none" stroke="#c9d2db" stroke-dasharray="2 3"/>`);
  }
  // Balloons by group: the layer method (stroke at 2x, then fill), text.
  for (const b of balloons) {
    const tf = b.rotate ? ` transform="rotate(${b.rotate} ${b.bbox.x + b.bbox.width / 2} ${b.bbox.y + b.bbox.height / 2})"` : '';
    out.push(`<g${tf}>`);
    if (b.shape) {
      const s = b.shape;
      const dash = s.dash ? ` stroke-dasharray="${s.dash.map((d) => d * 2).join(' ')}"` : '';
      if (s.double) {
        out.push(`<path d="${s.d}" fill="none" stroke="${s.stroke}" stroke-width="${2 * (2 * s.strokeWidth + s.double.gap)}" stroke-linejoin="round"/>`);
        out.push(`<path d="${s.d}" fill="none" stroke="${s.fill}" stroke-width="${2 * (s.strokeWidth + s.double.gap)}" stroke-linejoin="round"/>`);
      }
      out.push(`<path d="${s.d}" fill="none" stroke="${s.stroke}" stroke-width="${2 * s.strokeWidth}" stroke-linejoin="round"${dash}/>`);
      out.push(`<path d="${s.d}" fill="${s.fill}"/>`);
    }
    for (const t of b.text) out.push(textSvg(t, t.color, b.halo));
    out.push('</g>');
  }
  for (const sc of SCENES) out.push(`<polygon points="${sc.cell.map((p) => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#111" stroke-width="3"/>`);
  out.push(`<text x="40" y="1090" font-size="12" fill="#888">${loc.tag}</text></svg>`);
  return out.join('\n');
}

describe.skipIf(!OUT)('lettering dev harness', () => {
  it('writes one SVG page per language', async () => {
    const fonts = await loadFonts();
    if (!fonts) return;
    installFontkitMeasure(fonts);
    mkdirSync(OUT!, { recursive: true });
    for (const loc of LOCALES) {
      const { balloons, diags } = letterPage(loc);
      writeFileSync(`${OUT}/${loc.tag}.svg`, pageSvg(loc, balloons));
      if (diags.length) console.log(loc.tag, diags.join(' | '));
      expect(balloons.length).toBeGreaterThan(0);
    }
  });
});

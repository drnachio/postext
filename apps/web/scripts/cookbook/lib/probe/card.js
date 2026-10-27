// The recipe card, composed on a canvas.
import { pick, engineOf, pagesOf } from './record.js';
import { paint, encode } from './render.js';
import { round } from './settle.js';

// ─── The card ───────────────────────────────────────────────────────────────

const W = 1200;
const H = 900;
const GILT = '#d8a21a';

export function canvasOf(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  return canvas;
}

/** A white sheet with the card's shadow baked into the alpha channel. */
function sheet(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 18;
  ctx.fillRect(x, y, w, h);
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/** The spine's shade, fading from `x` towards `x + dir * width`. */
function spine(ctx, x, y, h, width, dir) {
  const gradient = ctx.createLinearGradient(x, 0, x + dir * width, 0);
  gradient.addColorStop(0, 'rgba(0,0,0,0.16)');
  gradient.addColorStop(0.4, 'rgba(0,0,0,0.05)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(Math.min(x, x + dir * width), y, width, h);
  ctx.restore();
}

/** Printer's crop marks just outside a rectangle's corners. */
function cropMarks(ctx, x, y, w, h, { len = 22, gap = 8, width = 2 } = {}) {
  ctx.save();
  ctx.strokeStyle = GILT;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const [cx, cy, sx, sy] of [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]]) {
    ctx.moveTo(cx + sx * gap, cy);
    ctx.lineTo(cx + sx * (gap + len), cy);
    ctx.moveTo(cx, cy + sy * gap);
    ctx.lineTo(cx, cy + sy * (gap + len));
  }
  ctx.stroke();
  ctx.restore();
}

/** The focus rectangle in page px; fractions are of the trim box (H8). */
function focusRect(p, focus) {
  const t = p.doc.trimOffset ?? 0;
  const tw = p.page.width - 2 * t;
  const th = p.page.height - 2 * t;
  return { x: t + focus.x * tw, y: t + focus.y * th, w: focus.w * tw, h: focus.h * th };
}

/** The verso/recto pair a hero names: [a, b] as given, or the spread a
 *  single page sits in (an odd book page is a recto; page 1 stands alone). */
function heroPair(hero, byN) {
  if (hero.length >= 2) return [byN.get(hero[0]) ?? null, byN.get(hero[1]) ?? null];
  const n = hero[0];
  const p = byN.get(n) ?? null;
  if (!p) return [null, null];
  if (p.book % 2 === 1) return [byN.get(n - 1) ?? null, p];   // a recto
  return [p, byN.get(n + 1) ?? null];                        // a verso
}

/** The hero pair on the stage, [verso, recto] laid out as the book opens:
 *  a right-bound book (doc.binding) has its recto on the left. */
function drawSpread(ctx, engine, [verso, recto], right = false) {
  const pair = right ? [recto, verso] : [verso, recto];
  const present = pair.filter(Boolean);
  let h = 0.8 * H;
  let widths = present.map((p) => (p.page.width * h) / p.page.height);
  let total = widths.reduce((a, b) => a + b, 0);
  if (total > 0.94 * W) {
    const k = (0.94 * W) / total;
    h *= k;
    widths = widths.map((w) => w * k);
    total *= k;
  }
  const top = 0.46 * H - h / 2;
  const left = (W - total) / 2;
  sheet(ctx, left, top, total, h);
  let x = left;
  present.forEach((p, i) => {
    ctx.drawImage(paint(engine, p, h / p.page.height), x, top, widths[i], h);
    x += widths[i];
  });
  const shade = 0.015 * W;
  if (pair[0] && pair[1]) {
    spine(ctx, left + widths[0], top, h, shade, -1);
    spine(ctx, left + widths[0], top, h, shade, 1);
  } else if (pair[1]) spine(ctx, left, top, h, shade, 1);
  else if (pair[0]) spine(ctx, left + total, top, h, shade, -1);
}

function drawPage(ctx, engine, p, box) {
  let h = box.h;
  let w = (p.page.width * h) / p.page.height;
  if (w > box.w) {
    w = box.w;
    h = (w * p.page.height) / p.page.width;
  }
  const x = box.x + (box.w - w) / 2;
  const y = box.cy - h / 2;
  sheet(ctx, x, y, w, h);
  ctx.drawImage(paint(engine, p, h / p.page.height), x, y, w, h);
  return { x, y, w, h, scale: h / p.page.height };
}

function drawLoupe(ctx, engine, p, focus) {
  const at = drawPage(ctx, engine, p, { x: 0.035 * W, w: 0.385 * W, h: 0.86 * H, cy: 0.46 * H });
  const f = focusRect(p, focus);
  let fw = 0.52 * W;
  let fh = (fw * f.h) / f.w;
  if (fh > 0.8 * H) {
    fh = 0.8 * H;
    fw = (fh * f.w) / f.h;
  }
  // Right-aligned, leaving room for the crop marks (gap + length = 30 px).
  const fx = W - 36 - fw;
  const fy = 0.46 * H - fh / 2;
  const scale = fw / f.w;
  sheet(ctx, fx, fy, fw, fh);
  ctx.drawImage(paint(engine, p, scale), f.x * scale, f.y * scale, f.w * scale, f.h * scale, fx, fy, fw, fh);
  cropMarks(ctx, fx, fy, fw, fh);
  // The focus outlined on the page, and a leader to the magnified frame
  // (a white halo keeps it legible where it crosses text).
  const sx = at.x + f.x * at.scale;
  const sy = at.y + f.y * at.scale;
  const sw = f.w * at.scale;
  const sh = f.h * at.scale;
  const leader = () => {
    ctx.beginPath();
    ctx.moveTo(sx + sw, sy + sh / 2);
    ctx.lineTo(fx - 12, fy + fh / 2);
    ctx.stroke();
  };
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  leader();
  ctx.strokeStyle = GILT;
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
  leader();
  ctx.restore();
  return fw / sw;
}

function drawCrop(ctx, engine, p, focus) {
  const f = focusRect(p, focus);
  const k = Math.min((0.9 * W) / f.w, (0.9 * H) / f.h);
  const w = f.w * k;
  const h = f.h * k;
  const x = (W - w) / 2;
  const y = Math.max(0.05 * H, Math.min(0.46 * H - h / 2, H - 0.05 * H - h));
  sheet(ctx, x, y, w, h);
  ctx.drawImage(paint(engine, p, k), f.x * k, f.y * k, f.w * k, f.h * k, x, y, w, h);
  cropMarks(ctx, x, y, w, h);
}

async function drawScreenshot(ctx, dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  // A 4:3 crop, centred horizontally and taken from the top.
  let sw = img.naturalWidth;
  let sh = (sw * 3) / 4;
  if (sh > img.naturalHeight) {
    sh = img.naturalHeight;
    sw = (sh * 4) / 3;
  }
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, 0, sw, sh, 0, 0, W, H);
}

/** card.webp (960×720), card.480.webp and og.jpg (580×622 on the desk
 *  colour), composed on a 1200×900 transparent stage. */
export async function composeCard({ select = 'last', mode = 'spread', hero = [1], focus = null, screenshot = null,
  png = false } = {}) {
  const build = pick(select);
  const engine = engineOf(build);
  const byN = new Map(pagesOf(build).map((p) => [p.n, p]));
  const stage = canvasOf(W, H);
  const ctx = stage.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  let magnification = null;
  try {
    if (mode === 'screenshot') await drawScreenshot(ctx, screenshot);
    else if (mode === 'spread') drawSpread(ctx, engine, heroPair(hero, byN), build.docs[0]?.binding === 'right');
    else if (mode === 'page') drawPage(ctx, engine, byN.get(hero[0]), { x: 0.05 * W, w: 0.9 * W, h: 0.86 * H, cy: 0.46 * H });
    else if (mode === 'loupe') magnification = drawLoupe(ctx, engine, byN.get(focus.page) ?? byN.get(hero[0]), focus);
    else if (mode === 'crop') drawCrop(ctx, engine, byN.get(focus.page) ?? byN.get(hero[0]), focus);
    else return { error: `unknown card mode "${mode}"` };
    const scaled = (w, h) => {
      const canvas = canvasOf(w, h);
      const c = canvas.getContext('2d');
      c.imageSmoothingQuality = 'high';
      c.drawImage(stage, 0, 0, w, h);
      return canvas;
    };
    const card = scaled(960, 720);
    const og = canvasOf(580, 622);
    const o = og.getContext('2d');
    o.fillStyle = '#0e1014';
    o.fillRect(0, 0, 580, 622);
    o.imageSmoothingQuality = 'high';
    const k = Math.min(520 / W, 560 / H);
    o.drawImage(stage, (580 - W * k) / 2, (622 - H * k) / 2, W * k, H * k);
    return {
      card: encode(card, 'image/webp', 0.82),
      card480: encode(scaled(480, 360), 'image/webp', 0.82),
      og: encode(og, 'image/jpeg', 0.86),
      png: png ? encode(card, 'image/png') : null,
      ogPng: png ? encode(og, 'image/png') : null,
      magnification: magnification === null ? null : round(magnification, 0.01),
    };
  } catch (error) {
    return { error: `${error?.name ?? 'Error'}: ${error?.message ?? error}`, taint: error?.name === 'SecurityError' };
  }
}

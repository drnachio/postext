/**
 * A small canvas with real pixels for the finish tests (#1563, #1564): RGBA
 * bytes, axis-aligned fills under scale and translation, `source-over` and
 * `source-in`, `drawImage` of another of its kind or of a flat fake image,
 * text as the box it would cover. Every other method of a 2D context does
 * nothing, so the page painter runs on it whole.
 */

interface State {
  fill: [number, number, number, number];
  stroke: [number, number, number, number];
  fillRaw: unknown;
  strokeRaw: unknown;
  m: [number, number, number, number, number, number];
  alpha: number;
  op: string;
  font: string;
}

function parse(v: unknown): [number, number, number, number] {
  if (typeof v !== 'string') return [0, 0, 0, 255];
  const s = v.trim().toLowerCase();
  if (s === 'transparent') return [0, 0, 0, 0];
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let d = m[1]!;
    if (d.length <= 4) d = [...d].map((c) => c + c).join('');
    const n = (i: number) => parseInt(d.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), d.length === 8 ? n(6) : 255];
  }
  m = /^rgba?\(([^)]*)\)$/.exec(s);
  if (m) {
    const p = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0]!, p[1]!, p[2]!, p[3] === undefined ? 255 : Math.round(p[3] * 255)];
  }
  return [0, 0, 0, 255];
}

export class RasterContext {
  data: Uint8ClampedArray;
  private st: State;
  private stack: State[] = [];
  textAlign = 'start';
  textBaseline = 'alphabetic';
  direction = 'ltr';
  letterSpacing = '0px';
  wordSpacing = '0px';
  lineWidth = 1;
  filter = 'none';
  constructor(public canvas: RasterCanvas) {
    this.data = new Uint8ClampedArray(Math.max(1, canvas.width * canvas.height) * 4);
    this.st = RasterContext.fresh();
  }
  private static fresh(): State {
    return { fill: [0, 0, 0, 255], stroke: [0, 0, 0, 255], fillRaw: '#000000', strokeRaw: '#000000', m: [1, 0, 0, 1, 0, 0], alpha: 1, op: 'source-over', font: '10px serif' };
  }
  reset(): void {
    this.data = new Uint8ClampedArray(Math.max(1, this.canvas.width * this.canvas.height) * 4);
    this.st = RasterContext.fresh();
    this.stack = [];
  }
  get fillStyle(): unknown { return this.st.fillRaw; }
  set fillStyle(v: unknown) { this.st.fillRaw = v; this.st.fill = parse(v); }
  get strokeStyle(): unknown { return this.st.strokeRaw; }
  set strokeStyle(v: unknown) { this.st.strokeRaw = v; this.st.stroke = parse(v); }
  get globalAlpha(): number { return this.st.alpha; }
  set globalAlpha(v: number) { this.st.alpha = v; }
  get globalCompositeOperation(): string { return this.st.op; }
  set globalCompositeOperation(v: string) { this.st.op = v; }
  get font(): string { return this.st.font; }
  set font(v: string) { this.st.font = v; }
  save(): void { this.stack.push({ ...this.st, m: [...this.st.m] as State['m'] }); }
  restore(): void { const s = this.stack.pop(); if (s) this.st = s; }
  scale(x: number, y: number): void { const m = this.st.m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; }
  translate(x: number, y: number): void { const m = this.st.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    const [m0, m1, m2, m3, m4, m5] = this.st.m;
    this.st.m = [m0 * a + m2 * b, m1 * a + m3 * b, m0 * c + m2 * d, m1 * c + m3 * d, m0 * e + m2 * f + m4, m1 * e + m3 * f + m5];
  }
  setTransform(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0): void { this.st.m = [a, b, c, d, e, f]; }
  getTransform(): { a: number; b: number; c: number; d: number; e: number; f: number } {
    const [a, b, c, d, e, f] = this.st.m;
    return { a, b, c, d, e, f };
  }
  measureText(t: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    const px = Number(/([\d.]+)px/.exec(this.st.font)?.[1] ?? 10);
    return { width: t.length * px * 0.5, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
  }
  /** The device box of a user-space rectangle (scale and translation only). */
  private box(x: number, y: number, w: number, h: number): [number, number, number, number] {
    const [a, , , d, e, f] = this.st.m;
    const x0 = a * x + e;
    const y0 = d * y + f;
    const x1 = a * (x + w) + e;
    const y1 = d * (y + h) + f;
    return [Math.round(Math.min(x0, x1)), Math.round(Math.min(y0, y1)), Math.round(Math.max(x0, x1)), Math.round(Math.max(y0, y1))];
  }
  private put(i: number, src: [number, number, number, number]): void {
    const d = this.data;
    const sa = (src[3] / 255) * this.st.alpha;
    if (this.st.op === 'source-in') {
      const da = d[i + 3]! / 255;
      d[i] = src[0]; d[i + 1] = src[1]; d[i + 2] = src[2]; d[i + 3] = Math.round(255 * sa * da);
      return;
    }
    if (sa === 0) return;
    const da = d[i + 3]! / 255;
    const oa = sa + da * (1 - sa);
    for (let k = 0; k < 3; k++) d[i + k] = Math.round((src[k]! * sa + d[i + k]! * da * (1 - sa)) / oa);
    d[i + 3] = Math.round(oa * 255);
  }
  private paintBox(b: [number, number, number, number], color: (x: number, y: number) => [number, number, number, number]): void {
    const W = this.canvas.width;
    const H = this.canvas.height;
    for (let y = Math.max(0, b[1]); y < Math.min(H, b[3]); y++) {
      for (let x = Math.max(0, b[0]); x < Math.min(W, b[2]); x++) this.put((y * W + x) * 4, color(x, y));
    }
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const c = this.st.fill;
    this.paintBox(this.box(x, y, w, h), () => c);
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    const b = this.box(x, y, w, h);
    const W = this.canvas.width;
    for (let yy = Math.max(0, b[1]); yy < Math.min(this.canvas.height, b[3]); yy++) {
      for (let xx = Math.max(0, b[0]); xx < Math.min(W, b[2]); xx++) this.data.fill(0, (yy * W + xx) * 4, (yy * W + xx) * 4 + 4);
    }
  }
  fillText(t: string, x: number, y: number): void {
    const m = this.measureText(t);
    const c = this.st.fill;
    this.paintBox(this.box(x, y - m.actualBoundingBoxAscent, m.width, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent), () => c);
  }
  drawImage(src: unknown, ...args: number[]): void {
    const s = src as { width: number; height: number; ctx?: RasterContext; rgba?: [number, number, number, number] };
    const [sx, sy, sw, sh, dx, dy, dw, dh] = args.length >= 8 ? args : args.length >= 4 ? [0, 0, s.width, s.height, ...args] : [0, 0, s.width, s.height, args[0]!, args[1]!, s.width, s.height];
    const b = this.box(dx!, dy!, dw!, dh!);
    const flat = s.rgba;
    const pixels = s.ctx?.data;
    this.paintBox(b, (x, y) => {
      if (flat) return flat;
      const u = Math.min(s.width - 1, Math.floor(sx! + ((x + 0.5 - b[0]) / Math.max(1, b[2] - b[0])) * sw!));
      const v = Math.min(s.height - 1, Math.floor(sy! + ((y + 0.5 - b[1]) / Math.max(1, b[3] - b[1])) * sh!));
      const i = (v * s.width + u) * 4;
      return [pixels![i]!, pixels![i + 1]!, pixels![i + 2]!, pixels![i + 3]!];
    });
  }
  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number } {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) out.set(this.data.subarray(((y + yy) * this.canvas.width + x) * 4, ((y + yy) * this.canvas.width + x + w) * 4), yy * w * 4);
    return { data: out, width: w, height: h };
  }
  putImageData(img: { data: Uint8ClampedArray }): void {
    this.data = new Uint8ClampedArray(img.data);
  }
  /** The pixel at (x, y), RGBA bytes. */
  pixel(x: number, y: number): number[] {
    const i = (y * this.canvas.width + x) * 4;
    return [...this.data.subarray(i, i + 4)];
  }
}

/** A canvas of {@link RasterContext}; usable as `OffscreenCanvas`. */
export class RasterCanvas {
  private w: number;
  private h: number;
  readonly ctx: RasterContext;
  private proxy: RasterContext;
  constructor(width = 1, height = 1) {
    this.w = width;
    this.h = height;
    this.ctx = new RasterContext(this);
    const target = this.ctx;
    this.proxy = new Proxy(target, {
      get(t, key) {
        if (key in t) {
          const v = Reflect.get(t, key, t) as unknown;
          return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
        }
        return () => undefined;
      },
    });
  }
  get width(): number { return this.w; }
  set width(v: number) { this.w = v; this.ctx.reset(); }
  get height(): number { return this.h; }
  set height(v: number) { this.h = v; this.ctx.reset(); }
  getContext(): RasterContext { return this.proxy; }
}

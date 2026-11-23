/** RGBA pixels made `k` times smaller (0 < k < 1), each new pixel the
 *  average of the source pixels it covers: a large print original's
 *  preview within what a canvas can draw (#1669). */
export function downscaleRgba(rgba: Uint8ClampedArray, width: number, height: number, k: number): { rgba: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } {
  const w = Math.max(1, Math.round(width * k));
  const h = Math.max(1, Math.round(height * k));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / w));
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = y0; sy < y1; sy++) {
        let i = (sy * width + x0) * 4;
        for (let sx = x0; sx < x1; sx++, i += 4) {
          r += rgba[i]!; g += rgba[i + 1]!; b += rgba[i + 2]!; a += rgba[i + 3]!;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return { rgba: out, width: w, height: h };
}

// The JavaScript side of the WebAssembly line breaker: the same call as
// `computeBreakpoints(items, options)` in packages/postext/src/knuthPlass,
// answered by the Rust engine. Items are written straight into the
// module's memory, nine f64 per item (see crates/wasm/src/linebreak.rs).

const STRIDE = 9;
const KIND = { box: 0, glue: 1, penalty: 2 };
const FLAGGED = 1;
const ZONED = 2;
const NO_TRACKING = 4;
const WORD_SPACE = 8;

/** Instantiates the module from its bytes; returns `computeBreakpoints`. */
export async function loadLineBreaker(bytes, { single = false } = {}) {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const x = instance.exports;
  const ctx = x.lb_new();
  const f64 = (ptr, n) => new Float64Array(x.memory.buffer, ptr, n);
  const u32 = (ptr, n) => new Uint32Array(x.memory.buffer, ptr, n);

  return function computeBreakpoints(items, options) {
    const n = items.length;
    const rows = f64(x.lb_items(ctx, n), n * STRIDE);
    for (let i = 0, o = 0; i < n; i++, o += STRIDE) {
      const it = items[i];
      rows[o] = KIND[it.type];
      rows[o + 1] = it.width;
      if (it.type === 'glue') {
        rows[o + 2] = it.stretch;
        rows[o + 3] = it.shrink;
        rows[o + 4] = 0;
        rows[o + 5] = it.sourceIndex >= 0 ? WORD_SPACE : 0;
        rows[o + 6] = 0;
        rows[o + 7] = 0;
        rows[o + 8] = 0;
      } else if (it.type === 'box') {
        rows[o + 2] = it.stretch ?? 0;
        rows[o + 3] = 0;
        rows[o + 4] = 0;
        rows[o + 5] = (it.noTracking ? NO_TRACKING : 0) | (it.sourceIndex >= 0 ? WORD_SPACE : 0);
        rows[o + 6] = it.chars ?? 0;
        rows[o + 7] = 0;
        rows[o + 8] = 0;
      } else {
        rows[o + 2] = 0;
        rows[o + 3] = 0;
        rows[o + 4] = it.penalty;
        rows[o + 5] = (it.flagged ? FLAGGED : 0) | (it.zoned ? ZONED : 0);
        rows[o + 6] = it.chars ?? 0;
        rows[o + 7] = (it.postWidth ?? 0) + (it.postShift ?? 0);
        rows[o + 8] = it.postChars ?? 0;
      }
    }
    // The measure, line by line until it is uniform.
    const uniform = options.lineWidthUniformFrom;
    const lines = (uniform ?? n) + 1;
    const widths = f64(x.lb_widths(ctx, lines), lines);
    for (let l = 0; l < lines; l++) widths[l] = options.lineWidth(l);
    const avoid = options.avoidHyphenAtLines ?? [];
    u32(x.lb_avoid(ctx, avoid.length), avoid.length).set(avoid);
    const fixed = options.fixedBreaks ?? [];
    u32(x.lb_fixed(ctx, fixed.length), fixed.length).set(fixed);
    x.lb_set_options(
      ctx,
      uniform ?? -1,
      options.normalSpaceWidth,
      options.maxStretchRatio,
      options.consecutiveHyphenDemerit ?? 3000,
      options.fitnessClassDemerit ?? 100,
      options.runtPenalty ?? 0,
      options.runtMinWidth ?? 0,
      options.looseness ?? 0,
      options.trackingPerChar ?? 0,
      options.raggedStretch ?? 0,
      options.hyphenationZone ?? -1,
      (options.runtGraded ? 1 : 0) | (single ? 2 : 0),
    );
    const count = x.lb_break(ctx);
    return Array.from(u32(x.lb_breaks(ctx), count));
  };
}

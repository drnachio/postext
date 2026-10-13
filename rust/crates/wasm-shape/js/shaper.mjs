// The JavaScript side of the WebAssembly shaper (crates/wasm-shape): font
// files in, widths out. Text is written into the module's memory as UTF-8.

/** Instantiates the module from its bytes. */
export async function loadShaper(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const x = instance.exports;
  const ctx = x.sh_new();
  const encoder = new TextEncoder();
  // The view is made after `sh_stage`, which may grow the memory and
  // detach every view made before it.
  /** Stages `data` (bytes) in the module; returns its length. */
  const stageBytes = (data) => {
    const ptr = x.sh_stage(ctx, data.length);
    new Uint8Array(x.memory.buffer, ptr, data.length).set(data);
    return data.length;
  };
  /** Stages `text` as UTF-8 (at most three bytes a UTF-16 unit). */
  const stageText = (text) => {
    const room = text.length * 3;
    const ptr = x.sh_stage(ctx, room);
    return encoder.encodeInto(text, new Uint8Array(x.memory.buffer, ptr, room)).written;
  };
  return {
    /** A font file's id, or -1 when it holds no font. */
    addFont: (bytes) => x.sh_add_font(ctx, stageBytes(bytes)),
    /** A BCP 47 tag's id, or -1. */
    language: (tag) => x.sh_language(ctx, stageText(tag)),
    /** The width of `text` at `size` px, or NaN when the font lacks one
     *  of its characters. */
    width: (font, size, text, language = -1) => x.sh_width(ctx, font, size, stageText(text), language),
  };
}

//! The WebAssembly face of the Rust shaper (#779 phase 2), a module of its
//! own: HarfRust with its font tables and Unicode data is about 950 KB, the
//! line breaker 30 KB, and a page that never asks for Rust shaping should
//! not download it. A font's bytes, a language tag and the text to measure
//! are staged in one buffer the module owns, then handed over by length.
//! See `js/shaper.mjs` for the JavaScript side.

use postext_shape::Shaper;

/// One shaper and its staging buffer.
pub struct ShapeContext {
    shaper: Shaper,
    staged: Vec<u8>,
}

#[unsafe(no_mangle)]
pub extern "C" fn sh_new() -> *mut ShapeContext {
    Box::into_raw(Box::new(ShapeContext { shaper: Shaper::new(), staged: Vec::new() }))
}

fn ctx<'a>(ptr: *mut ShapeContext) -> &'a mut ShapeContext {
    // SAFETY: the JavaScript side only passes pointers `sh_new` returned.
    unsafe { &mut *ptr }
}

/// Room for `len` bytes; returns where to write them.
#[unsafe(no_mangle)]
pub extern "C" fn sh_stage(ptr: *mut ShapeContext, len: usize) -> *mut u8 {
    let c = ctx(ptr);
    c.staged.resize(len, 0);
    c.staged.as_mut_ptr()
}

/// Adds the staged font file; its id, or -1.
#[unsafe(no_mangle)]
pub extern "C" fn sh_add_font(ptr: *mut ShapeContext, len: usize) -> i32 {
    let c = ctx(ptr);
    let bytes = c.staged[..len].to_vec();
    c.shaper.add_font(bytes).map_or(-1, |id| id as i32)
}

/// The id of the staged language tag (UTF-8); -1 when it is no tag.
#[unsafe(no_mangle)]
pub extern "C" fn sh_language(ptr: *mut ShapeContext, len: usize) -> i32 {
    let ShapeContext { shaper, staged } = ctx(ptr);
    let Ok(tag) = std::str::from_utf8(&staged[..len]) else { return -1 };
    shaper.language(tag).map_or(-1, |id| id as i32)
}

/// The width of the staged text (UTF-8) in font `font` at `size` px, in
/// language `language` (-1: none); NaN when a character has no glyph.
#[unsafe(no_mangle)]
pub extern "C" fn sh_width(ptr: *mut ShapeContext, font: u32, size: f64, len: usize, language: i32) -> f64 {
    let ShapeContext { shaper, staged } = ctx(ptr);
    let Ok(text) = std::str::from_utf8(&staged[..len]) else { return f64::NAN };
    let language = (language >= 0).then_some(language as u32);
    shaper.width(font, size, text, language).unwrap_or(f64::NAN)
}

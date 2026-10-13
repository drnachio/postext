//! Text widths for postext (#779 phase 2): HarfRust, the Rust port of
//! HarfBuzz, on the book's own font files.
//!
//! A [`Shaper`] holds the fonts it was given and the shaping plans it has
//! built, and measures a string the way Chrome's canvas does: word by word,
//! a space on its own (no kerning across a space), each word shaped in its
//! script with the language given. A string with a character none of the
//! font's glyphs draws has no width here ([`Shaper::width`] returns
//! `None`): the browser would set it in a fallback font, which only the
//! browser knows.

mod plans;
mod words;

use harfrust::{Buffer, Font, Language, ShaperFont};
use plans::Plans;
use std::str::FromStr;

/// The fonts, the plans and the buffer of one measuring context.
pub struct Shaper {
    fonts: Vec<FaceEntry>,
    languages: Vec<Language>,
    plans: Plans,
    buffer: Option<Buffer>,
}

struct FaceEntry {
    /// Kept for the life of the process: a measuring context lives as long.
    font: &'static Font,
    shaper: ShaperFont<'static, 'static>,
    units_per_em: f64,
}

impl Default for Shaper {
    fn default() -> Self {
        Self::new()
    }
}

impl Shaper {
    pub fn new() -> Self {
        Self { fonts: Vec::new(), languages: Vec::new(), plans: Plans::default(), buffer: Some(Buffer::new()) }
    }

    /// Adds a TrueType or OpenType file; its id, or `None` when the bytes
    /// hold no font.
    pub fn add_font(&mut self, bytes: Vec<u8>) -> Option<u32> {
        let font: &'static Font = Box::leak(Box::new(Font::new(bytes, 0)?));
        let units_per_em = f64::from(font.units_per_em());
        self.fonts.push(FaceEntry { font, shaper: ShaperFont::new(font), units_per_em });
        Some(self.fonts.len() as u32 - 1)
    }

    /// The id of a BCP 47 language tag, for [`Shaper::width`].
    pub fn language(&mut self, tag: &str) -> Option<u32> {
        let language = Language::from_str(tag).ok()?;
        if let Some(i) = self.languages.iter().position(|l| *l == language) {
            return Some(i as u32);
        }
        self.languages.push(language);
        Some(self.languages.len() as u32 - 1)
    }

    /// The width of `text` set in font `font` at `size` px, in `language`
    /// (an id from [`Shaper::language`]); `None` when a character has no
    /// glyph in the font.
    pub fn width(&mut self, font: u32, size: f64, text: &str, language: Option<u32>) -> Option<f64> {
        let face = self.fonts.get(font as usize)?;
        let language = language.and_then(|l| self.languages.get(l as usize).map(|lang| (l, lang)));
        let mut buffer = self.buffer.take().unwrap_or_default();
        let mut units = 0i64;
        let mut missing = false;
        for word in words::split(text) {
            match self.plans.shape(font, face.font, &face.shaper, buffer, word, language) {
                (b, Some(advance)) => {
                    units += advance;
                    buffer = b;
                }
                (b, None) => {
                    missing = true;
                    buffer = b;
                    break;
                }
            }
        }
        self.buffer = Some(buffer);
        (!missing).then(|| units as f64 * size / face.units_per_em)
    }
}

//! Knuth–Plass line breaking, as `packages/postext/src/knuthPlass`.
//!
//! A paragraph comes in as [`Items`] (boxes, glue and penalties), the
//! measure and the rules as [`Options`]; [`Breaker::breakpoints`] returns
//! the item indices where its lines end. A [`Breaker`] owns every buffer the
//! search needs and reuses them from one paragraph to the next, so a book
//! is broken without an allocation per paragraph once the buffers have
//! grown to the longest one.
//!
//! The arithmetic follows the TypeScript breaker operation for operation,
//! in `f64`: the same items give the same breaks, which the corpus tests
//! check against the breaks the TypeScript engine chose in real books.

mod adjust;
mod constants;
mod dp;
mod items;
mod looseness;
mod node;
mod options;
mod prefix;

pub use adjust::{LineAdjustment, adjust_line};
pub use constants::*;
pub use items::{ItemKind, Items};
pub use looseness::LoosenessMode;
pub use options::Options;

use dp::Search;

/// The line breaker, with the buffers it reuses between paragraphs.
#[derive(Default)]
pub struct Breaker {
    search: Search,
    breaks: Vec<u32>,
}

impl Breaker {
    pub fn new() -> Self {
        Self::default()
    }

    /// The breaks of `items` under `options`: the index of the item each
    /// line ends at, in order (the last one is the paragraph's closing
    /// penalty). Empty when the paragraph has no legal break at all.
    pub fn breakpoints(&mut self, items: &Items, options: &Options) -> &[u32] {
        looseness::breakpoints(&mut self.search, items, options, &mut self.breaks);
        &self.breaks
    }
}

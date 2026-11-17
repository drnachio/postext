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
#[cfg(test)]
mod hyphen_tests;
mod items;
mod looseness;
mod node;
mod options;
mod prefix;
#[cfg(test)]
mod short_cut_tests;
#[cfg(test)]
mod space_tests;
#[cfg(test)]
mod stacks_tests;

pub use adjust::{LineAdjustment, adjust_line};
pub use constants::*;
pub use items::{ItemKind, Items};
pub use looseness::LoosenessMode;
pub use options::{Options, Rules};

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

    /// Whether the search may take its short cut for loose lines (the
    /// default). The breaks are the same either way: this is for measuring
    /// and testing the two searches.
    pub fn set_short_cut(&mut self, on: bool) {
        self.search.no_short_cut = !on;
    }

    /// Searches that took the short cut for loose lines (`dp.rs`) since
    /// this breaker was made, and those of them that gave it up and were
    /// run again in full: what a benchmark reports.
    pub fn short_cuts(&self) -> (u32, u32) {
        self.search.short_cuts()
    }
}

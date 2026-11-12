//! Unit tests of word spaces that cost a break (#1519): a citation or a
//! lone operator a break would leave at a line edge. The cost rides in the
//! glue's `penalty`; the space stays a legal break and keeps its stretch.

use crate::items::flag;
use crate::{Breaker, ItemKind, Items, Options};

/// A small generator, the same on every platform.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (self.0 >> 11) as f64 / (1u64 << 53) as f64
    }
}

/// A paragraph of words with every fifth word space costing `cost`.
fn paragraph(seed: u64, cost: f64) -> (Items, Options) {
    let mut r = Rng(seed);
    let mut items = Items::default();
    let words = 30 + (r.next() * 50.0) as usize;
    for w in 0..words {
        items.push(ItemKind::Box, 12.0 + r.next() * 40.0, 0.0, 0.0, 0.0, 0, 4.0, 0.0, 0.0);
        if w + 1 < words {
            let ruled = if w % 5 == 4 { cost } else { 0.0 };
            items.push(ItemKind::Glue, 10.0, 5.0, 2.0, ruled, flag::WORD_SPACE, 0.0, 0.0, 0.0);
        }
    }
    items.push(ItemKind::Glue, 0.0, 1e9, 0.0, 0.0, 0, 0.0, 0.0, 0.0);
    items.push(ItemKind::Penalty, 0.0, 0.0, 0.0, -10000.0, 0, 0.0, 0.0, 0.0);
    let o = Options {
        widths: vec![180.0 + r.next() * 140.0],
        uniform_from: Some(0),
        normal_space_width: 10.0,
        max_stretch_ratio: 1.5,
        ..Options::default()
    };
    (items, o)
}

fn ruled_breaks(items: &Items, breaks: &[u32]) -> usize {
    breaks.iter().filter(|&&b| items.kind[b as usize] == ItemKind::Glue && items.penalty[b as usize] > 0.0).count()
}

#[test]
fn a_dear_space_stays_a_break_when_there_is_no_other() {
    // Two words wider together than the measure, one ruled space between.
    let mut items = Items::default();
    items.push(ItemKind::Box, 60.0, 0.0, 0.0, 0.0, 0, 6.0, 0.0, 0.0);
    items.push(ItemKind::Glue, 10.0, 5.0, 2.0, 30000.0, flag::WORD_SPACE, 0.0, 0.0, 0.0);
    items.push(ItemKind::Box, 60.0, 0.0, 0.0, 0.0, 0, 6.0, 0.0, 0.0);
    items.push(ItemKind::Glue, 0.0, 1e9, 0.0, 0.0, 0, 0.0, 0.0, 0.0);
    items.push(ItemKind::Penalty, 0.0, 0.0, 0.0, -10000.0, 0, 0.0, 0.0, 0.0);
    let o = Options {
        widths: vec![100.0],
        uniform_from: Some(0),
        normal_space_width: 10.0,
        max_stretch_ratio: 1.5,
        ..Options::default()
    };
    assert_eq!(Breaker::new().breakpoints(&items, &o), &[1, 4]);
}

#[test]
fn a_dear_space_is_broken_at_only_where_the_spacing_needs_it() {
    let mut breaker = Breaker::new();
    let (mut before, mut after) = (0, 0);
    for seed in 1..300 {
        let (free, o) = paragraph(seed, 0.0);
        let (dear, _) = paragraph(seed, 30000.0);
        let plain = breaker.breakpoints(&free, &o).to_vec();
        let kept = breaker.breakpoints(&dear, &o).to_vec();
        // The same items but for the costs: count the ruled spaces of the
        // dear paragraph in both settings.
        before += ruled_breaks(&dear, &plain);
        after += ruled_breaks(&dear, &kept);
        if ruled_breaks(&dear, &plain) == 0 {
            assert_eq!(kept, plain, "seed {seed}");
        }
    }
    assert!(before > 0, "the paragraphs break at ruled spaces");
    assert!(after < before, "{before} breaks at ruled spaces, {after} kept");
}

//! The short cut for loose lines (`dp.rs`) against the full search: the
//! same breaks on generated paragraphs, with the widths of a typeface and
//! with widths on a grid, where many settings cost the same and the order
//! of the nodes decides.

use crate::{Breaker, ItemKind, Items, KP_INFINITY, Options};

/// A generator the tests can repeat.
struct Random(u64);
impl Random {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
    fn unit(&mut self) -> f64 {
        self.below(1_000_000) as f64 / 1_000_000.0
    }
}

const FLAGGED: u8 = 1;
const WORD_SPACE: u8 = 8;

/// A paragraph of `words` words, some of them divided at syllables.
/// `grid`: every width a multiple of 10, as in a typewriter face.
fn paragraph(rng: &mut Random, words: usize, grid: bool, space: f64, stretch: f64, shrink: f64) -> Items {
    let mut items = Items::default();
    for w in 0..words {
        if w > 0 {
            items.push(ItemKind::Glue, space, stretch, shrink, 0.0, WORD_SPACE, 0.0, 0.0, 0.0);
        }
        let syllables = 1 + rng.below(4) as usize;
        for s in 0..syllables {
            if s > 0 {
                let hyphen = if grid { 10.0 } else { 6.3 };
                items.push(ItemKind::Penalty, hyphen, 0.0, 0.0, 50.0, FLAGGED, 1.0, 0.0, 0.0);
            }
            let width = if grid { 10.0 * (1 + rng.below(4)) as f64 } else { 8.0 + 40.0 * rng.unit() };
            items.push(ItemKind::Box, width, 0.0, 0.0, 0.0, 0, 3.0, 0.0, 0.0);
        }
    }
    items.push(ItemKind::Glue, 0.0, 9007199254740991.0, 0.0, 0.0, 0, 0.0, 0.0, 0.0);
    items.push(ItemKind::Penalty, 0.0, 0.0, 0.0, -KP_INFINITY, 0, 0.0, 0.0, 0.0);
    items
}

fn options(rng: &mut Random, grid: bool, space: f64) -> Options {
    let measure = if grid { 10.0 * (20 + rng.below(40)) as f64 } else { 250.0 + 500.0 * rng.unit() };
    let indent = if grid { 10.0 * rng.below(4) as f64 } else { 30.0 * rng.unit() };
    let runt = [0.0, 0.0, 1000.0, 3000.0][rng.below(4) as usize];
    Options {
        widths: vec![measure - indent, measure],
        uniform_from: Some(rng.below(2) as u32),
        normal_space_width: space,
        max_stretch_ratio: 1.5,
        runt_penalty: runt,
        runt_min_width: if runt > 0.0 { space * 8.0 } else { 0.0 },
        runt_graded: rng.below(2) == 0,
        ..Options::default()
    }
}

fn same_breaks(grid: bool, seed: u64, paragraphs: usize) -> (u32, u32) {
    let mut rng = Random(seed);
    let mut full = Breaker::new();
    full.set_short_cut(false);
    let (mut taken, mut given_up) = (0, 0);
    for n in 0..paragraphs {
        // A breaker of its own: one that has given up often stops trying.
        let mut short = Breaker::new();
        let space = if grid { 10.0 } else { 8.66 };
        // Narrow limits leave paragraphs with no setting inside them: the
        // short cut has to give those up.
        let wide = (space, space * 0.4);
        let (stretch, shrink) =
            [wide, wide, wide, wide, wide, wide, (space * 0.5, space * 0.2), (space * 0.1, 0.0)][rng.below(8) as usize];
        let words = 2 + rng.below(120) as usize;
        let items = paragraph(&mut rng, words, grid, space, stretch, shrink);
        let o = options(&mut rng, grid, space);
        let a = short.breakpoints(&items, &o).to_vec();
        let b = full.breakpoints(&items, &o).to_vec();
        assert_eq!(a, b, "paragraph {n} (grid {grid}, seed {seed})");
        let (t, g) = short.short_cuts();
        taken += t;
        given_up += g;
    }
    assert_eq!(full.short_cuts(), (0, 0));
    (taken, given_up)
}

#[test]
fn same_breaks_with_the_widths_of_a_typeface() {
    let (taken, given_up) = same_breaks(false, 7, 4000);
    assert_eq!(taken, 4000);
    assert!(given_up > 100 && given_up < 2000, "given up {given_up} of {taken}");
}

#[test]
fn same_breaks_with_widths_on_a_grid() {
    let (taken, given_up) = same_breaks(true, 11, 4000);
    assert_eq!(taken, 4000);
    assert!(given_up < 2000, "given up {given_up} of {taken}");
}

#[test]
fn a_document_that_mostly_gives_up_stops_trying() {
    // One word wider than the measure in every paragraph: no setting
    // without a line past its limits.
    let mut breaker = Breaker::new();
    let mut items = Items::default();
    for w in 0..12 {
        if w > 0 {
            items.push(ItemKind::Glue, 10.0, 1.0, 1.0, 0.0, WORD_SPACE, 0.0, 0.0, 0.0);
        }
        items.push(ItemKind::Box, 70.0, 0.0, 0.0, 0.0, 0, 3.0, 0.0, 0.0);
    }
    items.push(ItemKind::Glue, 0.0, 9007199254740991.0, 0.0, 0.0, 0, 0.0, 0.0, 0.0);
    items.push(ItemKind::Penalty, 0.0, 0.0, 0.0, -KP_INFINITY, 0, 0.0, 0.0, 0.0);
    let o = Options {
        widths: vec![200.0],
        uniform_from: Some(0),
        normal_space_width: 10.0,
        max_stretch_ratio: 1.1,
        ..Options::default()
    };
    for _ in 0..200 {
        breaker.breakpoints(&items, &o);
    }
    let (taken, given_up) = breaker.short_cuts();
    assert!(taken < 200 && given_up == taken, "taken {taken}, given up {given_up}");
}

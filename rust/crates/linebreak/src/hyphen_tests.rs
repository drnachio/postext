//! Unit tests of the hyphen rules (#1466): hyphen ladders, the last word
//! divided and the cost of every hyphen, over random paragraphs of
//! hyphenated words.

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

/// A paragraph of words of one to four syllables, a hyphen between them,
/// in a measure narrow enough for hyphens to be taken.
fn paragraph(seed: u64) -> (Items, Options) {
    let mut r = Rng(seed);
    let mut items = Items::default();
    let words = 20 + (r.next() * 60.0) as usize;
    for w in 0..words {
        let syllables = if r.next() < 0.45 { 1 } else { 2 + (r.next() * 3.0) as usize };
        for s in 0..syllables {
            items.push(ItemKind::Box, 10.0 + r.next() * 18.0, 0.0, 0.0, 0.0, 0, 3.0, 0.0, 0.0);
            if s + 1 < syllables {
                items.push(ItemKind::Penalty, 6.0, 0.0, 0.0, 50.0, flag::FLAGGED, 1.0, 0.0, 0.0);
            }
        }
        if w + 1 < words {
            items.push(ItemKind::Glue, 10.0, 7.0, 3.0, 0.0, flag::WORD_SPACE, 0.0, 0.0, 0.0);
        }
    }
    items.push(ItemKind::Glue, 0.0, 1e9, 0.0, 0.0, 0, 0.0, 0.0, 0.0);
    items.push(ItemKind::Penalty, 0.0, 0.0, 0.0, -10000.0, 0, 0.0, 0.0, 0.0);
    let o = Options {
        widths: vec![200.0 + r.next() * 120.0],
        uniform_from: Some(0),
        normal_space_width: 10.0,
        max_stretch_ratio: 1.5,
        ..Options::default()
    };
    (items, o)
}

fn hyphen_at(items: &Items, b: u32) -> bool {
    items.is_flagged_penalty(b as usize)
}

/// Lines past a ladder of `max` hyphenated lines in a row.
fn ladder_lines(items: &Items, breaks: &[u32], max: u32) -> u32 {
    let mut run = 0;
    let mut past = 0;
    for &b in breaks {
        run = if hyphen_at(items, b) { run + 1 } else { 0 };
        if run > max {
            past += 1;
        }
    }
    past
}

/// Whether the last line holds only the rest of a word divided at the end
/// of the line before.
fn last_word_divided(items: &Items, breaks: &[u32]) -> bool {
    let n = breaks.len();
    if n < 2 || !hyphen_at(items, breaks[n - 2]) {
        return false;
    }
    let from = breaks[n - 2] as usize;
    !(from..items.len()).any(|k| items.kind[k] == ItemKind::Glue && items.flags[k] & flag::WORD_SPACE != 0)
}

fn hyphens(items: &Items, breaks: &[u32]) -> usize {
    breaks.iter().filter(|&&b| hyphen_at(items, b)).count()
}

#[test]
fn rules_that_cost_nothing_set_the_lines_as_without_them() {
    let mut breaker = Breaker::new();
    for seed in 1..200 {
        let (items, o) = paragraph(seed);
        let plain = breaker.breakpoints(&items, &o).to_vec();
        let mut off = o.clone();
        off.rules.ladder_run = 2;
        off.rules.ladder_demerits = 0.0;
        off.rules.last_word_demerits = 0.0;
        off.rules.extra_hyphen_penalty = 0.0;
        assert_eq!(breaker.breakpoints(&items, &off), plain.as_slice(), "seed {seed}");
    }
}

#[test]
fn a_ladder_past_its_limit_gives_way_where_the_spacing_allows() {
    let mut breaker = Breaker::new();
    for max in [1, 2] {
        let (mut before, mut after) = (0, 0);
        for seed in 1..300 {
            let (items, o) = paragraph(seed);
            let plain = breaker.breakpoints(&items, &o).to_vec();
            let mut ruled = o.clone();
            ruled.rules.ladder_run = max;
            ruled.rules.ladder_demerits = 1e6;
            let kept = breaker.breakpoints(&items, &ruled).to_vec();
            assert!(ladder_lines(&items, &kept, max) <= ladder_lines(&items, &plain, max), "seed {seed}, max {max}");
            before += ladder_lines(&items, &plain, max);
            after += ladder_lines(&items, &kept, max);
        }
        assert!(before > 0, "the paragraphs have ladders past {max}");
        // Some ladders cost less than any other setting of their
        // paragraph (one line stretched past the limit costs more).
        assert!(after < before, "max {max}: {before} lines past the limit, {after} kept");
    }
}

#[test]
fn the_last_word_is_kept_whole_only_when_the_last_line_is_its_rest() {
    let mut breaker = Breaker::new();
    let (mut before, mut after) = (0, 0);
    for seed in 1..400 {
        let (items, o) = paragraph(seed);
        let plain = breaker.breakpoints(&items, &o).to_vec();
        let mut ruled = o.clone();
        ruled.rules.last_word_demerits = 1e6;
        let kept = breaker.breakpoints(&items, &ruled).to_vec();
        before += u32::from(last_word_divided(&items, &plain));
        after += u32::from(last_word_divided(&items, &kept));
        // A paragraph whose last word is whole is set as before.
        if !last_word_divided(&items, &plain) {
            assert_eq!(kept, plain, "seed {seed}");
        }
    }
    assert!(before > 0, "some last words are divided");
    assert!(after < before, "{before} divided, {after} kept");
}

#[test]
fn a_dearer_hyphen_takes_fewer_hyphens() {
    let mut breaker = Breaker::new();
    let mut counts = [0usize; 3];
    for seed in 1..200 {
        let (items, o) = paragraph(seed);
        for (k, extra) in [0.0, 50.0, 500.0].into_iter().enumerate() {
            let mut ruled = o.clone();
            ruled.rules.extra_hyphen_penalty = extra;
            counts[k] += hyphens(&items, breaker.breakpoints(&items, &ruled));
        }
    }
    assert!(counts[1] < counts[0] && counts[2] <= counts[1], "{counts:?}");
}

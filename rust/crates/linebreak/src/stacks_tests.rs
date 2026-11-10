//! Unit tests of stacks (#1463): the edges a line holds, what a stack
//! costs, and the search under them (`limited`).

use crate::options::{Edge, Rules, stack_weight};
use crate::{Breaker, ItemKind, Items, Options};

/// A paragraph of words of one width each, a word space between them, with
/// the line edges `writeEdges` would hand over: each word its own id (the
/// same word, the same id; `mono` words carry the monosyllable bit), the
/// last two letters as the characters.
fn paragraph(words: &[&str], mono: &[&str], width: f64, demerits: Option<f64>) -> (Items, Options) {
    let mut items = Items::default();
    let mut text_at = Vec::new();
    let mut at = 0u32;
    for (k, w) in words.iter().enumerate() {
        text_at.push(at);
        items.push(ItemKind::Box, 10.0 * w.len() as f64, 0.0, 0.0, 0.0, 0, w.len() as f64, 0.0, 0.0);
        at += w.len() as u32;
        if k + 1 < words.len() {
            text_at.push(at);
            items.push(ItemKind::Glue, 10.0, 5.0, 3.0, 0.0, 8, 0.0, 0.0, 0.0);
            at += 1;
        }
    }
    text_at.push(at);
    items.push(ItemKind::Glue, 0.0, 1e9, 0.0, 0.0, 0, 0.0, 0.0, 0.0);
    text_at.push(at);
    items.push(ItemKind::Penalty, 0.0, 0.0, 0.0, -10000.0, 0, 0.0, 0.0, 0.0);
    text_at.push(at);
    let n = items.len();
    let id = |w: &str| -> u32 {
        let k = words.iter().position(|x| *x == w).unwrap() as u32 + 1;
        (k << 1) | u32::from(mono.contains(&w))
    };
    let chars = |w: &str| -> u32 {
        let tail = &w[w.len().saturating_sub(2)..];
        if w.len() < 2 { 0 } else { 1000 + words.iter().position(|x| x.ends_with(tail)).unwrap() as u32 }
    };
    let head = |w: &str| -> u32 {
        let h = &w[..2.min(w.len())];
        if w.len() < 2 { 0 } else { 2000 + words.iter().position(|x| x.starts_with(h)).unwrap() as u32 }
    };
    let mut r = Rules { stack_demerits: demerits, offset: text_at, ..Rules::default() };
    for v in [
        &mut r.end_word,
        &mut r.end_chars,
        &mut r.end_word_reach,
        &mut r.end_chars_reach,
        &mut r.start_word,
        &mut r.start_chars,
        &mut r.start_word_reach,
        &mut r.start_chars_reach,
    ] {
        v.resize(n + 1, 0);
    }
    // Item 2k is word k, 2k + 1 the space after it; the closing glue and
    // penalty end the last word's line.
    let last = words.len() - 1;
    for (k, w) in words.iter().enumerate() {
        let ends = if k == last { vec![n - 1, n - 2] } else { vec![2 * k + 1] };
        for e in ends {
            r.end_word[e] = id(w);
            r.end_word_reach[e] = w.len() as u32;
            r.end_chars[e] = chars(w);
            r.end_chars_reach[e] = if chars(w) != 0 { 2 } else { 0 };
        }
        // The line after the break before word k starts on it.
        let s = 2 * k;
        r.start_word[s] = id(w);
        r.start_word_reach[s] = w.len() as u32;
        r.start_chars[s] = head(w);
        r.start_chars_reach[s] = if head(w) != 0 { 2 } else { 0 };
    }
    let o = Options {
        widths: vec![width],
        uniform_from: Some(0),
        normal_space_width: 10.0,
        max_stretch_ratio: 1.5,
        rules: r,
        ..Options::default()
    };
    (items, o)
}

/// Stacks a setting sets, read from its breaks.
fn stacks_of(o: &Options, breaks: &[u32]) -> u32 {
    let mut from = -1;
    let mut prev: Option<(Edge, Edge)> = None;
    let mut count = 0;
    for &b in breaks {
        let cur = (o.rules.line_end(from, b as usize), o.rules.line_start(from, b as usize));
        if let Some((e, s)) = prev {
            count += u32::from(stack_weight(cur.0, e) > 0) + u32::from(stack_weight(cur.1, s) > 0);
        }
        prev = Some(cur);
        from = b as i32;
    }
    count
}

#[test]
fn a_repeated_monosyllable_costs_twice() {
    let de = Edge { word: (5 << 1) | 1, chars: 0 };
    let casa = Edge { word: 6 << 1, chars: 7 };
    let masa = Edge { word: 8 << 1, chars: 7 };
    assert_eq!(stack_weight(de, de), 2);
    assert_eq!(stack_weight(casa, casa), 1);
    assert_eq!(stack_weight(casa, masa), 1, "same characters");
    assert_eq!(stack_weight(de, casa), 0);
    assert_eq!(stack_weight(Edge::default(), Edge::default()), 0, "no edge never stacks");
}

#[test]
fn an_edge_counts_only_where_the_line_holds_it() {
    let (_, o) = paragraph(&["alfa", "beta", "y"], &["y"], 100.0, Some(1.0));
    // The line "y" (from the break after "beta", item 3, to the end) holds
    // its one-letter word, and no two characters of its own.
    let n = o.rules.offset.len() - 1;
    let end = o.rules.line_end(3, n - 1);
    assert_ne!(end.word, 0);
    assert_eq!(end.chars, 0);
    // A line ending at "beta" holds its word and its characters.
    let beta = o.rules.line_end(-1, 3);
    assert_ne!(beta.word, 0);
    assert_ne!(beta.chars, 0);
    // Shortened, it holds neither: the reach runs past its start.
    let mut short = o.clone();
    short.rules.end_word_reach[3] = 100;
    short.rules.end_chars_reach[3] = 100;
    assert_eq!(short.rules.line_end(1, 3), Edge::default());
}

const TEXT: &[&str] = &[
    "lo",
    "dijo",
    "lentamente",
    "luego",
    "claramente",
    "de",
    "nuevo",
    "para",
    "que",
    "la",
    "gente",
    "de",
    "la",
    "sala",
    "oyera",
    "de",
    "nuevo",
    "la",
    "frase",
    "que",
    "la",
    "gente",
    "de",
    "la",
    "calle",
    "repite",
    "como",
    "la",
    "gente",
    "de",
    "siempre",
    "y",
    "la",
    "de",
    "ahora",
];

#[test]
fn no_penalty_sets_the_lines_as_without_stacks() {
    for width in [180.0, 220.0, 260.0, 300.0] {
        let (items, off) = paragraph(TEXT, &["lo", "de", "la", "que", "y"], width, None);
        let mut zero = off.clone();
        zero.rules.stack_demerits = Some(0.0);
        let mut b = Breaker::new();
        let plain = b.breakpoints(&items, &off).to_vec();
        assert_eq!(b.breakpoints(&items, &zero), plain.as_slice(), "{width}");
    }
}

#[test]
fn a_dear_stack_gives_way_only_to_no_setting() {
    // Each width: a dear stack never sets more stacks than the lines set
    // without weighing them, and over the widths it sets fewer.
    let (mut off_total, mut on_total) = (0, 0);
    for w in (160..=340).step_by(7) {
        let (items, mut o) = paragraph(TEXT, &["lo", "de", "la", "que", "y"], w as f64, None);
        let mut b = Breaker::new();
        let off = stacks_of(&o, b.breakpoints(&items, &o));
        o.rules.stack_demerits = Some(1e7);
        let on = stacks_of(&o, b.breakpoints(&items, &o));
        assert!(on <= off, "{w}: {on} > {off}");
        off_total += off;
        on_total += on;
    }
    assert!(off_total > 0, "the text stacks when stacks are not weighed");
    assert!(on_total < off_total, "{on_total} of {off_total}");
}

#[test]
fn a_longer_setting_sets_no_more_stacks_than_the_natural_one() {
    for w in (160..=340).step_by(11) {
        let (items, mut o) = paragraph(TEXT, &["lo", "de", "la", "que", "y"], w as f64, Some(3000.0));
        let mut b = Breaker::new();
        let natural = b.breakpoints(&items, &o).to_vec();
        for looseness in [-1, 1] {
            o.looseness = looseness;
            o.uniform_from = None;
            let other = b.breakpoints(&items, &o).to_vec();
            if other.len() != natural.len() {
                assert!(stacks_of(&o, &other) <= stacks_of(&o, &natural), "{w} {looseness}");
            }
        }
        o.looseness = 0;
    }
}

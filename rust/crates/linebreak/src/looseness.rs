//! Choosing the breaks: the natural setting, or the one with `looseness`
//! lines more or fewer when one is good enough.

use crate::dp::{Pass, Search, gates_short};
use crate::items::Items;
use crate::node::{Arena, NONE};
use crate::options::Options;

/// How a positive looseness target is searched (#780).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum LoosenessMode {
    /// Two searches: the natural one (linear), then one that keeps line
    /// counts apart but never lets a line be very loose, the only chains
    /// the target may take. Its cost stays linear.
    #[default]
    TwoPass,
    /// The TypeScript engine up to #780: one search with every line count
    /// apart, very loose lines included, which grows quadratically. Kept
    /// as the reference the corpus tests compare against.
    Single,
}

pub(crate) fn breakpoints(search: &mut Search, items: &Items, o: &Options, out: &mut Vec<u32>) {
    out.clear();
    if items.is_empty() || o.widths.is_empty() {
        return;
    }
    if o.looseness > 0 && o.looseness_mode == LoosenessMode::TwoPass {
        two_pass(search, items, o, out);
    } else {
        single(search, items, o, o.looseness, out);
    }
}

/// One search, then the natural chain or the `looseness` alternative.
fn single(search: &mut Search, items: &Items, o: &Options, looseness: i32, out: &mut Vec<u32>) {
    search.run(items, o, Pass { looseness, constrained: false });
    let last = items.len() as i32 - 1;
    let arena = &search.arena;
    let Some(mut best) = cheapest(arena, &search.active, |id| arena.get(id).position == last) else {
        if let Some(id) = furthest(arena, &search.active) {
            arena.trace(id, out);
        }
        return;
    };
    if looseness != 0 {
        let natural = *arena.get(best);
        let target = natural.line as i64 + looseness as i64;
        let gate = gates_short(o, looseness);
        let loosest_allowed = o.max_stretch_ratio.max(natural.loosest) + 1e-9;
        let alternative = cheapest(arena, &search.active, |id| {
            let a = arena.get(id);
            a.position == last
                && a.line as i64 == target
                && (looseness < 0 || arena.within_stretch_limit(id))
                && (!gate || (a.loosest <= loosest_allowed && a.ragged <= natural.ragged))
        });
        if let Some(id) = alternative {
            best = id;
        }
    }
    arena.trace(best, out);
}

/// Natural breaks, then the cheapest chain `looseness` lines longer with no
/// very loose line, when there is one.
fn two_pass(search: &mut Search, items: &Items, o: &Options, out: &mut Vec<u32>) {
    single(search, items, o, 0, out);
    let target = out.len() as i64 + o.looseness as i64;
    if !search.run(items, o, Pass { looseness: o.looseness, constrained: true }) {
        return;
    }
    let last = items.len() as i32 - 1;
    let arena = &search.arena;
    let alternative = cheapest(arena, &search.active, |id| {
        let a = arena.get(id);
        a.position == last && a.line as i64 == target
    });
    if let Some(id) = alternative {
        arena.trace(id, out);
    }
}

/// The active node with the fewest demerits among those `keep` accepts;
/// the first one wins a tie.
fn cheapest(arena: &Arena, active: &[u32], keep: impl Fn(u32) -> bool) -> Option<u32> {
    let mut best = NONE;
    for &id in active {
        if keep(id) && (best == NONE || arena.get(id).total_demerits < arena.get(best).total_demerits) {
            best = id;
        }
    }
    (best != NONE).then_some(best)
}

/// No node reached the end: the one that got furthest, the cheapest of
/// those.
fn furthest(arena: &Arena, active: &[u32]) -> Option<u32> {
    let mut best = NONE;
    for &id in active {
        let a = arena.get(id);
        if a.position < 0 {
            continue;
        }
        if best == NONE {
            best = id;
            continue;
        }
        let b = arena.get(best);
        if a.position > b.position || (a.position == b.position && a.total_demerits < b.total_demerits) {
            best = id;
        }
    }
    (best != NONE).then_some(best)
}

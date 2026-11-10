//! Choosing the breaks: the natural setting, or the one with `looseness`
//! lines more or fewer when one is good enough, under the document's limits.

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

/// A longer setting's target: exactly `lines` lines, breaking no more than
/// `max_hard` limits.
#[derive(Clone, Copy)]
struct Longer {
    lines: i64,
    max_hard: u32,
}

pub(crate) fn breakpoints(search: &mut Search, items: &Items, o: &Options, out: &mut Vec<u32>) {
    out.clear();
    if items.is_empty() || o.widths.is_empty() {
        return;
    }
    if o.looseness > 0 && o.looseness_mode == LoosenessMode::TwoPass {
        two_pass(search, items, o, out);
    } else {
        limited(search, items, o, o.looseness, None, out);
    }
}

/// Natural breaks, then the cheapest chain `looseness` lines longer with no
/// very loose line and no more limits broken, when there is one.
fn two_pass(search: &mut Search, items: &Items, o: &Options, out: &mut Vec<u32>) {
    let Some(hard) = limited(search, items, o, 0, None, out) else { return };
    if out.is_empty() {
        return;
    }
    let longer = Longer { lines: out.len() as i64 + o.looseness as i64, max_hard: hard };
    let mut alternative = Vec::new();
    if limited(search, items, o, o.looseness, Some(longer), &mut alternative).is_some() {
        out.clone_from(&alternative);
    }
}

/// [`one`] under the document's limits (`limited` in TypeScript). Merging
/// nodes by line and fitness alone forgets what a limit's cost depends on,
/// so a chain may break a limit another one keeps; a paragraph whose
/// setting breaks one is set again with that state kept apart, which is
/// exact but dearer. Returns the limits the breaks in `out` break, `None`
/// when a longer setting found nothing.
fn limited(
    search: &mut Search,
    items: &Items,
    o: &Options,
    looseness: i32,
    longer: Option<Longer>,
    out: &mut Vec<u32>,
) -> Option<u32> {
    let first = one(search, items, o, looseness, longer, false, out)?;
    if first == 0 || (o.rules.stack_badness.is_none() && o.rules.max_run == 0) {
        return Some(first);
    }
    let mut exact_breaks = Vec::new();
    match one(search, items, o, looseness, longer, true, &mut exact_breaks) {
        Some(hard) if hard <= first => {
            out.clone_from(&exact_breaks);
            Some(hard)
        }
        _ => Some(first),
    }
}

/// One search and its choice: for a longer setting, the cheapest final
/// chain of its line count (`None` when there is none); else the natural
/// chain, or for a negative looseness the shorter one when it passes its
/// gates, or the furthest when no chain reached the end.
fn one(
    search: &mut Search,
    items: &Items,
    o: &Options,
    looseness: i32,
    longer: Option<Longer>,
    exact_limits: bool,
    out: &mut Vec<u32>,
) -> Option<u32> {
    out.clear();
    let ran = search.run(items, o, Pass { looseness, constrained: longer.is_some(), exact_limits });
    let last = items.len() as i32 - 1;
    let arena = &search.arena;
    if let Some(l) = longer {
        if !ran {
            return None;
        }
        let id = cheapest(arena, &search.active, |id| {
            let a = arena.get(id);
            a.position == last && a.line as i64 == l.lines && a.hard <= l.max_hard
        })?;
        arena.trace(id, out);
        return Some(arena.get(id).hard);
    }
    let Some(mut best) = cheapest(arena, &search.active, |id| arena.get(id).position == last) else {
        return Some(match furthest(arena, &search.active) {
            Some(id) => {
                arena.trace(id, out);
                arena.get(id).hard
            }
            None => 0,
        });
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
                && a.hard <= natural.hard
        });
        if let Some(id) = alternative {
            best = id;
        }
    }
    arena.trace(best, out);
    Some(arena.get(best).hard)
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

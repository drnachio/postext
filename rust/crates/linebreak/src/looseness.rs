//! Choosing the breaks: the natural setting, or the one with `looseness`
//! lines more or fewer when one is good enough, under the document's
//! composition rules.

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

/// A longer setting's target: exactly `lines` lines, keeping no more than
/// `max_faults` faults of the composition rules.
#[derive(Clone, Copy)]
struct Longer {
    lines: i64,
    max_faults: u32,
}

/// What a search chose: how many faults of the composition rules its
/// breaks keep and what they cost.
#[derive(Clone, Copy)]
struct Outcome {
    faults: u32,
    demerits: f64,
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
/// very loose line and no more faults, when there is one.
fn two_pass(search: &mut Search, items: &Items, o: &Options, out: &mut Vec<u32>) {
    let Some(natural) = limited(search, items, o, 0, None, out) else { return };
    if out.is_empty() {
        return;
    }
    let longer = Longer { lines: out.len() as i64 + o.looseness as i64, max_faults: natural.faults };
    let mut alternative = Vec::new();
    if limited(search, items, o, o.looseness, Some(longer), &mut alternative).is_some() {
        out.clone_from(&alternative);
    }
}

/// [`one`] under the document's composition rules (`limited` in
/// TypeScript, #1463, #1466). Merging nodes by line and fitness alone
/// forgets what a stack's cost depends on, and what a hyphen ladder longer
/// than one line does, so the chain kept may keep a fault another one
/// avoids for less; a paragraph whose setting keeps a fault is set again
/// with that state kept apart, which is exact but dearer, and gives up past
/// `EXACT_MAX_ACTIVE` active nodes. The exact setting is taken when it has
/// as many lines and costs less. `None` when a longer setting found
/// nothing.
fn limited(
    search: &mut Search,
    items: &Items,
    o: &Options,
    looseness: i32,
    longer: Option<Longer>,
    out: &mut Vec<u32>,
) -> Option<Outcome> {
    let first = one(search, items, o, looseness, longer, false, out)?;
    let long_ladders = o.rules.ladder_demerits > 0.0 && o.rules.ladder_run > 1;
    if first.faults == 0 || !(o.rules.stack_demerits.is_some() || long_ladders) {
        return Some(first);
    }
    let mut exact_breaks = Vec::new();
    match one(search, items, o, looseness, longer, true, &mut exact_breaks) {
        Some(exact) if exact_breaks.len() == out.len() && exact.demerits < first.demerits => {
            out.clone_from(&exact_breaks);
            Some(exact)
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
) -> Option<Outcome> {
    out.clear();
    let ran = search.run(items, o, Pass { looseness, constrained: longer.is_some(), exact_limits });
    // An exact search past its cap gives up.
    if exact_limits && !ran {
        return None;
    }
    let last = items.len() as i32 - 1;
    let arena = &search.arena;
    let outcome = |id: u32| {
        let a = arena.get(id);
        Outcome { faults: a.faults, demerits: a.total_demerits }
    };
    if let Some(l) = longer {
        if !ran {
            return None;
        }
        let id = cheapest(arena, &search.active, |id| {
            let a = arena.get(id);
            a.position == last && a.line as i64 == l.lines && a.faults <= l.max_faults
        })?;
        arena.trace(id, out);
        return Some(outcome(id));
    }
    let Some(mut best) = cheapest(arena, &search.active, |id| arena.get(id).position == last) else {
        return Some(match furthest(arena, &search.active) {
            Some(id) => {
                arena.trace(id, out);
                outcome(id)
            }
            None => Outcome { faults: 0, demerits: 0.0 },
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
                && a.faults <= natural.faults
        });
        if let Some(id) = alternative {
            best = id;
        }
    }
    arena.trace(best, out);
    Some(outcome(best))
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

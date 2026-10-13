//! The dynamic programme: walk the legal breaks, extend every active node to
//! each one, keep the cheapest node per key.

use crate::adjust::{adjust_line, badness, fitness_class, ratio};
use crate::constants::*;
use crate::items::{ItemKind, Items, flag};
use crate::node::{Arena, NONE, Node};
use crate::options::Options;
use crate::prefix::Prefix;

/// One search's settings, derived from the options.
#[derive(Clone, Copy)]
pub(crate) struct Pass {
    pub looseness: i32,
    /// No line but the last may be very loose (fitness 3); a search that
    /// runs out of nodes gives up instead of forcing a break.
    pub constrained: bool,
}

/// Every buffer a search uses, kept between searches.
#[derive(Default)]
pub(crate) struct Search {
    prefix: Prefix,
    pub arena: Arena,
    /// The active nodes, in the order they were created.
    pub active: Vec<u32>,
    /// The candidates at the current break, by key, in first-offer order.
    candidates: Vec<Node>,
    slot_by_key: Vec<u32>,
    keys: Vec<u32>,
    avoid: Vec<bool>,
}

/// Whether a short looseness target gates word spacing.
pub(crate) fn gates_short(o: &Options, looseness: i32) -> bool {
    looseness < 0 && o.normal_space_width > 0.0 && o.ragged_stretch <= 0.0
}

impl Search {
    /// Runs the search over `items`. Leaves the surviving nodes in
    /// `active`; false when a constrained search ran out of nodes.
    pub fn run(&mut self, items: &Items, o: &Options, pass: Pass) -> bool {
        let n = items.len();
        let tracking = o.tracking_per_char > 0.0;
        let ragged = o.ragged_stretch.max(0.0);
        let gate_short = gates_short(o, pass.looseness);
        let last_avoided = self.fill_avoid(o);
        let fixed = &o.fixed_breaks;
        let uniform_from = match o.uniform_from {
            Some(u) if pass.looseness == 0 => Some(u.max(last_avoided + 1).max(fixed.len() as u32 + 1)),
            _ => None,
        };
        self.prefix.fill(items, tracking, gate_short, o.hyphenation_zone.is_some());
        let Search { prefix: p, arena, active, candidates, slot_by_key, keys, avoid } = self;
        arena.clear();
        active.clear();
        let start = arena.push(Node::start());
        active.push(start);
        let terminal = n - 1;

        for i in 0..n {
            let kind = items.kind[i];
            let legal = match kind {
                ItemKind::Glue => i > 0 && items.kind[i - 1] == ItemKind::Box,
                ItemKind::Penalty => items.penalty[i] < KP_INFINITY,
                ItemKind::Box => false,
            };
            if !legal {
                continue;
            }
            let is_penalty = kind == ItemKind::Penalty;
            let break_width = if is_penalty { items.width[i] } else { 0.0 };
            let is_flagged = items.is_flagged_penalty(i);
            let post_width = if is_penalty { items.post_width[i] } else { 0.0 };
            let post_chars = if is_penalty { items.post_chars[i] } else { 0.0 };
            let pen = if is_penalty { items.penalty[i] } else { 0.0 };

            let mut keep = 0;
            for ai in 0..active.len() {
                let id = active[ai];
                let a = *arena.get(id);
                let content = p.width[i] - a.total_width + break_width;
                let available = o.line_width(a.line);
                let slack = available - content;
                let line_stretch = p.stretch[i] - a.total_stretch + ragged;
                let line_shrink = p.shrink[i] - a.total_shrink;
                let mut r = ratio(slack, line_stretch, line_shrink);
                let mut tracking_share = 0.0;
                let mut tracked_width = 0.0;
                if tracking && (r > 1.0 || r < -1.0) {
                    let chars = p.chars[i] - a.total_chars + if is_penalty { items.chars[i] } else { 0.0 };
                    let trackable = p.spaces[i] - a.total_spaces > 0.0 && p.no_tracking[i] - a.total_no_tracking == 0.0;
                    let adj = adjust_line(slack, line_stretch, line_shrink, chars, o.tracking_per_char, trackable);
                    r = adj.r;
                    tracking_share = adj.share;
                    tracked_width = adj.tracking * chars;
                }
                // Overfull past its shrink: this node can reach no later break.
                if r < -1.0 {
                    continue;
                }
                active[keep] = id;
                keep += 1;
                if r > KP_INFINITY {
                    continue;
                }
                if (a.line as usize) < fixed.len() && i != fixed[a.line as usize] as usize {
                    continue;
                }
                if let Some(zone) = o.hyphenation_zone
                    && is_penalty
                    && items.flags[i] & flag::ZONED != 0
                    && outside_zone(p, i, &a, available, zone)
                {
                    continue;
                }

                let is_runt = o.runt_penalty > 0.0 && i == terminal && content > 0.0 && content < o.runt_min_width;
                let over_stretch = if r > 1.0 { OVER_STRETCH_BADNESS.max(2.0 * o.runt_penalty) * r * r } else { 0.0 };
                let runt_cost = if !is_runt {
                    0.0
                } else if o.runt_graded {
                    o.runt_penalty * (1.0 - content / o.runt_min_width)
                } else {
                    o.runt_penalty
                };
                let column_end = if is_flagged && avoid.get(a.line as usize + 1).copied().unwrap_or(false) {
                    COLUMN_END_HYPHEN_BADNESS
                } else {
                    0.0
                };
                let tracking_cost =
                    if tracking_share > 0.0 { TRACKING_BADNESS * tracking_share * tracking_share } else { 0.0 };
                let eff = badness(r) + over_stretch + runt_cost + column_end + tracking_cost;
                let mut d = if pen >= 0.0 {
                    (1.0 + eff + pen) * (1.0 + eff + pen)
                } else if pen > -KP_INFINITY {
                    (1.0 + eff) * (1.0 + eff) - pen * pen
                } else {
                    (1.0 + eff) * (1.0 + eff)
                };
                if is_flagged && a.position >= 0 && items.is_flagged_penalty(a.position as usize) {
                    d += o.consecutive_hyphen_demerit;
                }
                let fc = fitness_class(r);
                if (fc as i32 - a.fitness as i32).abs() > 1 {
                    d += o.fitness_class_demerit;
                }
                if pass.constrained && fc == 3 && i != terminal {
                    continue;
                }
                let total_demerits = a.total_demerits + d;

                let mut loosest = a.loosest;
                let mut ragged_lines = a.ragged;
                if gate_short && slack > 0.0 && i != terminal {
                    let word_spaces = p.word_spaces[i] - a.total_word_spaces;
                    if word_spaces > 0.0 {
                        let spacing = (p.word_space_width[i] - a.total_word_space_width + slack - tracked_width)
                            / (word_spaces * o.normal_space_width);
                        if spacing > RAGGED_SPACE_RATIO {
                            ragged_lines += 1;
                        } else if spacing > loosest {
                            loosest = spacing;
                        }
                    }
                }

                let key = match uniform_from {
                    Some(u) if a.line + 1 >= u => fc as u32,
                    _ => (a.line + 1) * 4 + fc as u32,
                };
                let node = Node {
                    position: i as i32,
                    line: a.line + 1,
                    fitness: fc,
                    total_width: p.width[i + 1] - post_width,
                    total_stretch: p.stretch[i + 1],
                    total_shrink: p.shrink[i + 1],
                    total_chars: if tracking { p.chars[i + 1] - post_chars } else { 0.0 },
                    total_spaces: if tracking { p.spaces[i + 1] } else { 0.0 },
                    total_no_tracking: if tracking { p.no_tracking[i + 1] } else { 0.0 },
                    total_demerits,
                    loosest,
                    ragged: ragged_lines,
                    total_word_spaces: if gate_short { p.word_spaces[i + 1] } else { 0.0 },
                    total_word_space_width: if gate_short { p.word_space_width[i + 1] } else { 0.0 },
                    previous: id,
                };
                offer(candidates, slot_by_key, keys, key, node);
            }
            active.truncate(keep);
            commit(arena, active, candidates, slot_by_key, keys);

            // A forced break: no line may run past it.
            if is_penalty && pen <= -KP_INFINITY {
                active.retain(|&id| arena.get(id).position == i as i32);
            }
            if active.is_empty() {
                if pass.constrained {
                    return false;
                }
                // Lost: start afresh here.
                let node = Node {
                    position: i as i32,
                    line: 1,
                    fitness: 1,
                    total_width: p.width[i + 1] - post_width,
                    total_stretch: p.stretch[i + 1],
                    total_shrink: p.shrink[i + 1],
                    total_chars: if tracking { p.chars[i + 1] - post_chars } else { 0.0 },
                    total_spaces: if tracking { p.spaces[i + 1] } else { 0.0 },
                    total_no_tracking: if tracking { p.no_tracking[i + 1] } else { 0.0 },
                    total_word_spaces: if gate_short { p.word_spaces[i + 1] } else { 0.0 },
                    total_word_space_width: if gate_short { p.word_space_width[i + 1] } else { 0.0 },
                    previous: NONE,
                    ..Node::default()
                };
                let id = arena.push(node);
                active.push(id);
            }
        }
        true
    }

    /// Marks the lines that should not end on a hyphen; returns the last.
    fn fill_avoid(&mut self, o: &Options) -> u32 {
        self.avoid.clear();
        let last = o.avoid_hyphen_at_lines.iter().copied().max().unwrap_or(0);
        if !o.avoid_hyphen_at_lines.is_empty() {
            self.avoid.resize(last as usize + 1, false);
            for &l in &o.avoid_hyphen_at_lines {
                self.avoid[l as usize] = true;
            }
        }
        last
    }
}

/// Moves the candidates into the arena and the active list, in the order
/// their keys were first offered.
fn commit(
    arena: &mut Arena,
    active: &mut Vec<u32>,
    candidates: &mut Vec<Node>,
    slot_by_key: &mut [u32],
    keys: &mut Vec<u32>,
) {
    for &key in keys.iter() {
        let slot = slot_by_key[key as usize];
        slot_by_key[key as usize] = NONE;
        active.push(arena.push(candidates[slot as usize]));
    }
    keys.clear();
    candidates.clear();
}

/// Keeps `node` as the candidate for `key` unless one as cheap is there.
#[inline]
fn offer(candidates: &mut Vec<Node>, slot_by_key: &mut Vec<u32>, keys: &mut Vec<u32>, key: u32, node: Node) {
    let k = key as usize;
    if k >= slot_by_key.len() {
        slot_by_key.resize(k + 1, NONE);
    }
    let slot = slot_by_key[k];
    if slot == NONE {
        slot_by_key[k] = candidates.len() as u32;
        candidates.push(node);
        keys.push(key);
    } else if candidates[slot as usize].total_demerits > node.total_demerits {
        candidates[slot as usize] = node;
    }
}

/// A zoned syllable only breaks a word that does not fit the rest of the
/// line, and only where sending the word down whole would leave more than
/// the zone empty.
#[inline]
fn outside_zone(p: &Prefix, i: usize, a: &Node, available: f64, zone: f64) -> bool {
    if p.width[p.space_after[i] as usize] - a.total_width <= available {
        return true;
    }
    let g = p.space_before[i];
    g > a.position && available - (p.width[g as usize] - a.total_width) <= zone
}

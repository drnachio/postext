//! Running totals over the items: a line's width, give and characters are
//! two lookups and a subtraction. `at[k]` covers items `0..k`, so the arrays
//! are one longer than the paragraph.

use crate::items::{ItemKind, Items, flag};

#[derive(Default)]
pub(crate) struct Prefix {
    pub width: Vec<f64>,
    pub stretch: Vec<f64>,
    pub shrink: Vec<f64>,
    /// Tracking only: characters, word spaces and untrackable boxes.
    pub chars: Vec<f64>,
    pub spaces: Vec<f64>,
    pub no_tracking: Vec<f64>,
    /// A short looseness target only: word spaces and their natural width.
    pub word_spaces: Vec<f64>,
    pub word_space_width: Vec<f64>,
    /// Ragged hyphenation zone only: the word space before each item and
    /// the next one at or after it.
    pub space_before: Vec<i32>,
    pub space_after: Vec<u32>,
}

impl Prefix {
    pub fn fill(&mut self, items: &Items, tracking: bool, gate_short: bool, zone: bool) {
        let n = items.len();
        for v in [&mut self.width, &mut self.stretch, &mut self.shrink] {
            v.clear();
            v.reserve(n + 1);
            v.push(0.0);
        }
        for v in [
            &mut self.chars,
            &mut self.spaces,
            &mut self.no_tracking,
            &mut self.word_spaces,
            &mut self.word_space_width,
        ] {
            v.clear();
        }
        if tracking {
            for v in [&mut self.chars, &mut self.spaces, &mut self.no_tracking] {
                v.reserve(n + 1);
                v.push(0.0);
            }
        }
        if gate_short {
            for v in [&mut self.word_spaces, &mut self.word_space_width] {
                v.reserve(n + 1);
                v.push(0.0);
            }
        }
        let (mut w, mut st, mut sh) = (0.0, 0.0, 0.0);
        let (mut ch, mut sp, mut nt) = (0.0, 0.0, 0.0);
        let (mut ws, mut wsw) = (0.0, 0.0);
        for k in 0..n {
            let word_space = items.flags[k] & flag::WORD_SPACE != 0;
            match items.kind[k] {
                ItemKind::Box => {
                    w += items.width[k];
                    st += items.stretch[k];
                    if tracking {
                        ch += items.chars[k];
                        if items.flags[k] & flag::NO_TRACKING != 0 {
                            nt += 1.0;
                        }
                    }
                }
                ItemKind::Glue => {
                    w += items.width[k];
                    st += items.stretch[k];
                    sh += items.shrink[k];
                    if tracking && word_space {
                        sp += 1.0;
                    }
                    if gate_short && word_space {
                        ws += 1.0;
                        wsw += items.width[k];
                    }
                }
                ItemKind::Penalty => {}
            }
            self.width.push(w);
            self.stretch.push(st);
            self.shrink.push(sh);
            if tracking {
                self.chars.push(ch);
                self.spaces.push(sp);
                self.no_tracking.push(nt);
            }
            if gate_short {
                self.word_spaces.push(ws);
                self.word_space_width.push(wsw);
            }
        }
        self.space_before.clear();
        self.space_after.clear();
        if zone {
            self.fill_spaces(items);
        }
    }

    fn fill_spaces(&mut self, items: &Items) {
        let n = items.len();
        self.space_after.resize(n, 0);
        let mut next = n as u32 - 1;
        for k in (0..n).rev() {
            if items.kind[k] == ItemKind::Glue {
                next = k as u32;
            }
            self.space_after[k] = next;
        }
        let mut last = -1;
        for k in 0..n {
            if items.kind[k] == ItemKind::Glue {
                last = k as i32;
            }
            self.space_before.push(last);
        }
    }
}

//! Replays Knuth–Plass corpora against the Rust line breaker: checks that
//! it chooses the breaks the TypeScript engine chose, and times it.
//!
//!   cargo run --release -p postext-bench -- <corpus.jsonl> [<corpus.jsonl> …]

mod corpus;

use postext_linebreak::{Breaker, LoosenessMode};
use std::time::Instant;

fn main() {
    for path in std::env::args().skip(1) {
        let calls = corpus::load(&path);
        let mut breaker = Breaker::new();
        for mode in [LoosenessMode::Single, LoosenessMode::TwoPass] {
            let (mut differ, mut differ_loose) = (0, 0);
            let mut ms_by_looseness = [0.0f64; 3];
            let started = Instant::now();
            for call in &calls {
                let mut options = call.options.clone();
                options.looseness_mode = mode;
                let t = Instant::now();
                let breaks = breaker.breakpoints(&call.items, &options);
                let ms = t.elapsed().as_secs_f64() * 1000.0;
                ms_by_looseness[(options.looseness.signum() + 1) as usize] += ms;
                if breaks != call.breaks.as_slice() {
                    differ += 1;
                    if options.looseness != 0 {
                        differ_loose += 1;
                    }
                }
            }
            if mode == LoosenessMode::TwoPass {
                classify(&calls, &mut breaker);
            }
            let total = started.elapsed().as_secs_f64() * 1000.0;
            println!(
                "{path} {mode:?}: {} calls, {total:.1} ms (natural {:.1}, +1 {:.1}, -1 {:.1}); breaks differ from TS in {differ} ({differ_loose} with a looseness target)",
                calls.len(),
                ms_by_looseness[1],
                ms_by_looseness[2],
                ms_by_looseness[0],
            );
        }
    }
}

/// Where the two-pass looseness and the single search disagree: did the
/// single one fall back to the natural setting (it lost the alternative),
/// or did both find an alternative and pick different ones?
fn classify(calls: &[corpus::Call], breaker: &mut Breaker) {
    let (mut found_lost, mut other_alt, mut gave_up) = (0, 0, 0);
    for call in calls.iter().filter(|c| c.options.looseness > 0) {
        let mut natural = call.options.clone();
        natural.looseness = 0;
        let n = breaker.breakpoints(&call.items, &natural).len();
        let mut two = call.options.clone();
        two.looseness_mode = LoosenessMode::TwoPass;
        let t = breaker.breakpoints(&call.items, &two).to_vec();
        if t == call.breaks {
            continue;
        }
        let target = n + call.options.looseness as usize;
        if call.breaks.len() == n && t.len() == target {
            found_lost += 1;
        } else if call.breaks.len() == target && t.len() == target {
            other_alt += 1;
        } else {
            gave_up += 1;
        }
    }
    println!(
        "  two-pass differs: {found_lost} alternatives the single search lost, {other_alt} different alternatives, {gave_up} other"
    );
}

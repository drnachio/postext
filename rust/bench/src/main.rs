//! Replays Knuth–Plass corpora against the Rust line breaker: checks that
//! it chooses the breaks the TypeScript engine chose, and times it.
//!
//!   cargo run --release -p postext-bench -- <corpus.jsonl> [<corpus.jsonl> …]
//!
//! `--rounds N` breaks each corpus N times the way the engine asks (the
//! two-pass looseness) and nothing else, for a profiler or an instruction
//! count (`/usr/bin/time -l`, `perf stat`): the count with `--rounds 0` is
//! what loading the corpus takes.

mod corpus;

use postext_linebreak::{Breaker, LoosenessMode};
use std::time::Instant;

fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(at) = args.iter().position(|a| a == "--rounds") {
        let rounds: usize = args.get(at + 1).and_then(|n| n.parse().ok()).expect("--rounds N");
        args.drain(at..at + 2);
        for path in &args {
            repeat(path, rounds);
        }
        return;
    }
    for path in args {
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

/// Breaks the corpus `rounds` times as the engine asks.
fn repeat(path: &str, rounds: usize) {
    let mut calls = corpus::load(path);
    for call in &mut calls {
        call.options.looseness_mode = LoosenessMode::TwoPass;
    }
    let mut breaker = Breaker::new();
    let mut differ = 0;
    let mut best = f64::INFINITY;
    for _ in 0..rounds {
        let started = Instant::now();
        for call in &calls {
            if breaker.breakpoints(&call.items, &call.options) != call.breaks.as_slice() {
                differ += 1;
            }
        }
        best = best.min(started.elapsed().as_secs_f64() * 1000.0);
    }
    let (taken, given_up) = breaker.short_cuts();
    println!(
        "{path}: {} calls × {rounds}, quickest round {best:.1} ms; breaks differ from TS in {differ}; short cut taken {taken}, given up {given_up}",
        calls.len()
    );
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

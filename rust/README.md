# postext's Rust engine (research, #779)

A Cargo workspace beside the pnpm one. The engine crates do one thing each and have no dependencies. The bindings are thin crates over them.

| Crate | What it is |
|---|---|
| `crates/linebreak` | Knuth–Plass line breaking (`packages/postext/src/knuthPlass`), with the two-pass looseness of #780 |
| `crates/wasm` | The WebAssembly module: a C ABI over linear memory (no binding generator), and `js/linebreak.mjs`, its JavaScript side |
| `bench` | Replays corpora recorded from real books against the Rust engine, natively |

## Toolchain

```sh
brew install rustup binaryen
```

`rust-toolchain.toml` pins the compiler (1.99.0, with the wasm32 target, clippy and rustfmt); rustup installs it on the first `cargo` call in this directory. The module is built with binaryen 133 (`wasm-opt --version`). The build is reproducible: CI's WebAssembly job rebuilds `packages/postext/src/knuthPlass/wasm/bytes.generated.ts` with the same versions and fails when the bytes differ, and a test of the engine fails when the Rust sources changed without a rebuild (`scripts/sourcesHash.mjs`, #1463). After any change here:

```sh
node rust/scripts/build-wasm.mjs
```

## Build and test

```sh
cargo test                       # unit tests
cargo build --release --target wasm32-unknown-unknown -p postext-wasm
wasm-opt -O3 target/wasm32-unknown-unknown/release/postext_wasm.wasm -o target/postext_wasm.opt.wasm
```

## Benchmarks

Every change is judged on real books. Record a corpus with the CLI's benchmark, which also prints the time, the memory and the VDT hash of a whole-book layout:

```sh
cd packages/postext-cli
bun scripts/bench-layout.ts --runs 3 <book>                    # time, RSS, VDT hash
bun scripts/bench-layout.ts --runs 3 --stages <book>           # and where the time went, stage by stage
bun scripts/bench-layout.ts --runs 1 --kp-dump kp.jsonl <book>  # Knuth–Plass corpus
```

`--stages` reads the stage times the engine reports through `globalThis.__postextPerfTap` (`packages/postext/src/util/perfTap.ts`) and prints each stage's share of the last run. Times are given as wall time and as CPU time of the process: check the machine's load before trusting either. The Layout timing workflow (`.github/workflows/layout-timing.yml`) runs the same benchmark on a GitHub runner for the commit before a push and for the pushed one, in turns, and reports the difference beside the spread between rounds: read a change's gain there, not from two separate runs.

Two engines are compared pass by pass with the pass trace, one line per placement pass with the hash of the document the pass left:

```sh
bun scripts/pass-trace.ts --out a.trace <book>            # one engine
bun scripts/pass-trace.ts --ts-kp --out b.trace <book>    # another (here: the TypeScript line breaker)
diff a.trace b.trace                                      # the first pass that differs
```

`--full` adds every block and line of every pass, so the diff shows the first block that moved.

Then replay it:

```sh
cargo run --release -p postext-bench -- kp.jsonl                       # native Rust
cargo run --release -p postext-bench -- --rounds 20 kp.jsonl           # the engine's search alone, repeated
node rust/bench/replay.mjs [--proto other-breakpoints.js] kp.jsonl     # TS vs WASM, same process
```

`--rounds` is the one to put under a profiler or an instruction counter (`/usr/bin/time -l` on macOS, `perf stat` on Linux): instructions do not move with the machine's load, where times do. The count with `--rounds 0` is what loading the corpus takes.

## The search's short cut for loose lines

Most of what a natural search evaluates are lines far too short for their measure (84 % of the evaluations on a novel): every active node gives one at each break until its line fills up, and each costs more than any setting without one. `Search::run` (`crates/linebreak/src/dp.rs`) does not price them where the paragraph allows it (every line after the first of one width, no tracking, no hyphenation zone, no stacks): a loose line still leaves its node, at an infinite cost, so the nodes and their order are those of the full search, and the first loose line at a break ends that break. When a priced line costs as much as a loose one, or no priced setting ends the paragraph, the search is run again in full, so the breaks are the same in every case (`short_cut_tests.rs` compares the two on generated paragraphs; the corpora compare them on books). `--rounds` prints how many searches took the short cut and how many gave it up. The TypeScript breaker, the fallback where WebAssembly is missing, searches in full.

Corpora of private books stay outside the repository.

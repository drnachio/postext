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

`--stages` reads the stage times the engine reports through `globalThis.__postextPerfTap` (`packages/postext/src/util/perfTap.ts`) and prints each stage's share of the last run. Times are given as wall time and as CPU time of the process: check the machine's load before trusting either.

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
node rust/bench/replay.mjs [--proto other-breakpoints.js] kp.jsonl     # TS vs WASM, same process
```

Corpora of private books stay outside the repository.

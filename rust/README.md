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
rustup default stable
rustup target add wasm32-unknown-unknown
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
bun scripts/bench-layout.ts --runs 1 --kp-dump kp.jsonl <book>  # Knuth–Plass corpus
```

Then replay it:

```sh
cargo run --release -p postext-bench -- kp.jsonl                       # native Rust
node rust/bench/replay.mjs [--proto other-breakpoints.js] kp.jsonl     # TS vs WASM, same process
```

Corpora of private books stay outside the repository.

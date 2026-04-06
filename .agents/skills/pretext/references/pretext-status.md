# Current Status

Compact current snapshot for the main browser sweep and benchmark numbers.

Use this file for "where are we right now?".
Use `RESEARCH.md` for why the numbers changed and what was tried.
Use `corpora/STATUS.md` for the long-form corpus canaries.

## Browser Accuracy

Official browser regression sweep:

| Browser | Status |
|---|---|
| Chrome | `7680/7680` |
| Safari | `7680/7680` |
| Firefox | `7680/7680` |

Notes:
- This is the 4-font × 8-size × 8-width × 30-text browser corpus.
- The public accuracy page is effectively a regression gate now, not the main steering metric.
- Current machine-readable accuracy snapshots are checked in as:
  - `accuracy/chrome.json`
  - `accuracy/safari.json`
  - `accuracy/firefox.json`
- These accuracy snapshot files were captured on `2026-03-27`.

## Benchmark Snapshot

Current benchmark snapshots are checked in as:
- `benchmarks/chrome.json`
- `benchmarks/safari.json`

`STATUS.md` stays the compact dashboard. The JSON files are the machine-readable source for the current benchmark numbers.
These snapshot files were captured on `2026-03-28`.

### Top-level batch

| Browser | `prepare()` | `layout()` | DOM batch | DOM interleaved |
|---|---:|---:|---:|---:|
| Chrome | `18.85ms` | `0.09ms` | `4.05ms` | `43.50ms` |
| Safari | `18.00ms` | `0.12ms` | `87.00ms` | `149.00ms` |

### Rich line APIs (shared corpus)

| Browser | `layoutWithLines()` | `walkLineRanges()` | `layoutNextLine()` |
|---|---:|---:|---:|
| Chrome | `0.05ms` | `0.03ms` | `0.07ms` |
| Safari | `0.05ms` | `0.03ms` | `0.07ms` |

### Rich line APIs (Arabic long-form stress)

| Browser | `layoutWithLines()` | `walkLineRanges()` | `layoutNextLine()` |
|---|---:|---:|---:|
| Chrome | `4.99ms` | `2.17ms` | `6.39ms` |
| Safari | `4.66ms` | `2.37ms` | `5.53ms` |

### Long-form corpus stress (Chrome baseline)

| Corpus | analyze() | measure() | prepare() | layout() | segs (analyze→prepared) | lines @ 300px |
|---|---:|---:|---:|---:|---:|---:|
| Japanese prose (story 2) | `1.90ms` | `4.00ms` | `6.10ms` | `0.02ms` | `1,773→2,667` | `193` |
| Japanese prose | `4.10ms` | `8.30ms` | `12.60ms` | `0.03ms` | `3,606→5,044` | `380` |
| Korean prose | `2.40ms` | `8.40ms` | `11.40ms` | `0.04ms` | `5,282→9,679` | `428` |
| Chinese prose | `6.10ms` | `13.10ms` | `19.20ms` | `0.05ms` | `5,433→7,949` | `626` |
| Chinese prose (story 2) | `3.70ms` | `8.10ms` | `11.80ms` | `0.03ms` | `3,271→4,745` | `375` |
| Thai prose | `8.10ms` | `5.40ms` | `13.50ms` | `0.05ms` | `10,281→10,281` | `1,024` |
| Myanmar prose | `0.60ms` | `0.70ms` | `1.30ms` | `<0.01ms` | `797→797` | `81` |
| Myanmar prose (story 2) | `0.30ms` | `0.60ms` | `0.90ms` | `<0.01ms` | `498→498` | `54` |
| Urdu prose | `2.20ms` | `3.30ms` | `5.50ms` | `0.03ms` | `6,051→6,051` | `351` |
| Khmer prose | `5.80ms` | `4.50ms` | `10.40ms` | `0.05ms` | `11,109→11,109` | `591` |
| Hindi prose | `4.30ms` | `6.60ms` | `11.10ms` | `0.04ms` | `9,958→9,958` | `653` |
| Arabic prose | `29.10ms` | `34.80ms` | `63.50ms` | `0.17ms` | `37,603→37,603` | `2,643` |

Notes:
- Chrome remains the main maintained performance baseline. Safari snapshots are still useful, but they are noisier and warm up less predictably.
- The checked-in JSON snapshots are cold checker runs. Ad hoc page-driven numbers, especially in Safari, can differ after warmup.
- Refresh the benchmark JSON snapshots when a diff changes benchmark methodology or the text engine's hot path (`src/analysis.ts`, `src/measurement.ts`, `src/line-break.ts`, `src/layout.ts`, `src/bidi.ts`, or `pages/benchmark.ts`).
- `layout()` remains the resize hot path; `prepare()` is where script-specific cost still lives.
- Long-form corpus rows now split `prepare()` into analysis and measurement phases, which makes it easier to tell whether a script is expensive because of segmentation/glue work or because of raw width measurement volume.

## Pointers

- Current machine-readable accuracy snapshots: `accuracy/chrome.json`, `accuracy/safari.json`, `accuracy/firefox.json`
- Current machine-readable benchmark snapshots: `benchmarks/chrome.json`, `benchmarks/safari.json`
- Long-form corpus canary status: `corpora/STATUS.md`
- Current representative corpus rows: `corpora/representative.json`
- Full exploration log: `RESEARCH.md`

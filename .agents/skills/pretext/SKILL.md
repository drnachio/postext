---
name: pretext
description: DOM-free multiline text measurement and layout using @chenglou/pretext. Use when the user needs text height calculation, virtualized list row sizing, canvas/SVG text rendering, or any scenario involving text layout without DOM reflow.
---

# Pretext – DOM-Free Text Measurement & Layout

Pretext is a pure-JavaScript library that measures and lays out multiline text without touching the DOM. It uses the browser's own font engine (via canvas `measureText`) as ground truth, then does all line-breaking and height calculation in pure arithmetic.

## Why This Matters

DOM-based text measurement (`getBoundingClientRect`, `offsetHeight`) triggers layout reflow — one of the most expensive operations in a browser. Every call forces the engine to recalculate styles and geometry for potentially the entire document. In a virtualized list with 10,000 rows, that means 10,000 reflows just to get row heights.

Pretext replaces that with a two-phase approach: one `prepare()` call does text analysis and canvas measurement (the expensive part, done once), then `layout()` computes height from cached widths using pure math (the cheap part, called on every resize). On benchmarks this is 300–600× faster than DOM measurement, and it eliminates layout thrashing entirely.

The result is pixel-perfect across browsers (7680/7680 on Chrome, Safari, and Firefox accuracy sweeps), supports all languages including emoji, mixed-bidi, CJK, Thai, Arabic, and more.

## Installation

```sh
npm install @chenglou/pretext
```

## Two Paths: Pick the Simpler One

### Fast Path (90% of cases — you just need the height)

```ts
import { prepare, layout } from '@chenglou/pretext';

const prepared = prepare(text, fontString, options?);
const { height, lineCount } = layout(prepared, maxWidth, lineHeight);
```

This covers virtualized lists, dynamic containers, scroll anchoring — anything where you need to know how tall text will be at a given width. The `prepared` handle is reusable: on resize, just call `layout()` again with the new width.

### Rich Path (you need the actual lines)

When you need to render text yourself (Canvas, SVG, WebGL) or do variable-width layout (flowing around images), switch to the rich APIs:

```ts
import { prepareWithSegments, layoutWithLines, walkLineRanges, layoutNextLine } from '@chenglou/pretext';
```

- **`layoutWithLines()`** — all lines at a fixed width (Canvas/SVG rendering)
- **`walkLineRanges()`** — line widths without building strings (shrink-wrap, binary search for optimal width)
- **`layoutNextLine()`** — one line at a time with varying width (text flowing around obstacles)

## Key Things to Get Right

- **Cache `prepared` handles.** Same text + same font = reuse the handle. Only call `prepare()` again if the text or font actually changed. On resize, just re-call `layout()`.
- **Match your CSS exactly.** The `font` string must match your CSS `font` shorthand (size, weight, style, family). The `lineHeight` must match your CSS `line-height`. Mismatches produce wrong heights.
- **Use `{ whiteSpace: 'pre-wrap' }` for textareas** where spaces, tabs, and newlines should be preserved.
- **Avoid `system-ui` on macOS** — canvas and DOM can resolve to different fonts, breaking accuracy.
- **`clearCache()` is rarely needed** — only when cycling through many different fonts and you want to release memory.

## Ready-to-Use Examples

See the `references/examples/` directory for complete, copy-paste-ready code:
- `basic-height.ts` — measure text height for a container
- `pre-wrap-textarea.ts` — auto-size a textarea
- `canvas-manual-layout.ts` — render wrapped text on a canvas
- `flow-around-image.ts` — route text around a floated image

## Deep Reference

For the full API surface (types, glossary, all function signatures), read `references/pretext-readme.md`.

For practical patterns, gotchas, and decision guidance when building with Pretext, read `references/pretext-agents.md`.

For current accuracy and benchmark numbers, read `references/pretext-status.md`.

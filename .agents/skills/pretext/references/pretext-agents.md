# Pretext – Practical Patterns & Decision Guide

This reference helps you make good decisions when building with `@chenglou/pretext`. Read SKILL.md first for the basics; come here when you need deeper guidance.

## Table of Contents

1. [Choosing the Right API](#choosing-the-right-api)
2. [Common Patterns](#common-patterns)
3. [Performance Guidance](#performance-guidance)
4. [Font & CSS Matching](#font--css-matching)
5. [Language & Script Support](#language--script-support)
6. [Whitespace Modes](#whitespace-modes)
7. [Gotchas & Edge Cases](#gotchas--edge-cases)

---

## Choosing the Right API

Start with the simplest API that solves the problem. Escalate only when needed.

| You need... | Use this |
|---|---|
| Text height at a given width | `prepare()` → `layout()` |
| Text height for a textarea | `prepare()` with `{ whiteSpace: 'pre-wrap' }` → `layout()` |
| All lines for Canvas/SVG/WebGL rendering | `prepareWithSegments()` → `layoutWithLines()` |
| Tightest container width (shrink-wrap) | `prepareWithSegments()` → `walkLineRanges()` |
| Binary search for an optimal width | `prepareWithSegments()` → `walkLineRanges()` in a loop |
| Text flowing around obstacles (variable width per line) | `prepareWithSegments()` → `layoutNextLine()` in a loop |

The fast path (`prepare` + `layout`) doesn't allocate line objects — it just counts lines and multiplies by `lineHeight`. This is meaningfully faster and is the right default for measurement-only use cases.

## Common Patterns

### Virtualized List with Variable Row Heights

The classic use case. Each row has different text content, so you need per-row heights without triggering DOM reflow for every row:

```ts
import { prepare, layout } from '@chenglou/pretext';

// Prepare once per item (e.g., when data arrives)
const preparedItems = items.map(item =>
  prepare(item.text, '14px Inter')
);

// Layout is cheap — call it on mount and on resize
function getRowHeight(index: number, containerWidth: number): number {
  const { height } = layout(preparedItems[index], containerWidth, 20);
  return height + padding;
}
```

Because `layout()` is pure arithmetic (~0.09ms for 500 items), you can call it synchronously in a virtualizer's `itemSize` callback without jank.

### Auto-Sizing a Textarea

```ts
const prepared = prepare(textarea.value, '16px Inter', { whiteSpace: 'pre-wrap' });
const { height } = layout(prepared, textarea.clientWidth, 24);
textarea.style.height = `${height}px`;
```

Re-run on every input event. `prepare()` is ~19ms for 500 texts, so a single textarea is sub-millisecond.

### Canvas Text Rendering

```ts
const prepared = prepareWithSegments(text, '18px Inter');
const { lines } = layoutWithLines(prepared, canvasWidth, 26);

ctx.font = '18px Inter';
for (let i = 0; i < lines.length; i++) {
  ctx.fillText(lines[i].text, 0, i * 26);
}
```

### Finding the Tightest Container Width (Shrink-Wrap)

This is something CSS can't easily do for multiline text. Pretext can:

```ts
const prepared = prepareWithSegments(text, '16px Inter');
let maxLineWidth = 0;
walkLineRanges(prepared, 9999, line => {
  if (line.width > maxLineWidth) maxLineWidth = line.width;
});
// maxLineWidth is the minimum container width that fits the text
```

You can also binary-search for a "balanced" width where no line is much wider than the others.

### Flowing Text Around an Image

When text needs to wrap around a floated element, each line may have a different available width:

```ts
const prepared = prepareWithSegments(text, '16px Inter');
let cursor = { segmentIndex: 0, graphemeIndex: 0 };
let y = 0;

while (true) {
  const availableWidth = y < image.bottom
    ? columnWidth - image.width
    : columnWidth;
  const line = layoutNextLine(prepared, cursor, availableWidth);
  if (!line) break;
  ctx.fillText(line.text, 0, y);
  cursor = line.end;
  y += lineHeight;
}
```

## Performance Guidance

### What's Fast and What's Not

| Operation | Cost | When to call |
|---|---|---|
| `prepare()` | ~19ms for 500 texts | Once per unique text+font combination |
| `layout()` | ~0.09ms for 500 texts | On every resize, freely |
| `layoutWithLines()` | ~0.05ms (shared corpus) | When you need line objects |
| `walkLineRanges()` | ~0.03ms (shared corpus) | When you need widths only |
| `layoutNextLine()` | ~0.07ms (shared corpus) | Variable-width layout |

The key insight: `prepare()` is the expensive call because it does canvas measurement. Everything after that is pure arithmetic. So the optimization strategy is always: prepare once, layout many times.

### Caching Strategy

- **Cache `prepared` handles** — store them alongside your data. Same text + same font = same handle, reusable forever.
- **On resize**, only call `layout()` again. Don't re-prepare.
- **On text change**, you do need to re-prepare (the text is different).
- **On font change**, you need to re-prepare (measurements change).
- **`clearCache()`** releases Pretext's internal measurement cache. Only useful if your app cycles through many different fonts. In typical apps with 1-3 fonts, never call it.

## Font & CSS Matching

Pretext measures text using the canvas API, which means the `font` string you pass must exactly match what the browser renders. This is the most common source of measurement mismatches.

```ts
// These must match your CSS
const font = '16px Inter';           // matches: font-size: 16px; font-family: Inter;
const font = 'bold 14px "Helvetica Neue"'; // matches: font-weight: bold; font-size: 14px; font-family: "Helvetica Neue";
```

The format is the same as `CanvasRenderingContext2D.font` — the CSS `font` shorthand.

**Common mistakes:**
- Using `rem` or `em` units (use `px`)
- Forgetting `bold`/`italic` when the CSS has them
- Not quoting font families with spaces
- Using `system-ui` on macOS (canvas and DOM can resolve to different fonts — use a named font instead)

## Language & Script Support

Pretext supports all languages including:
- Latin, Cyrillic, Greek
- CJK (Chinese, Japanese, Korean) with proper kinsoku line-break rules
- Arabic, Hebrew, Urdu (RTL and mixed bidi)
- Thai, Lao, Khmer, Myanmar (no-space scripts)
- Hindi, Bengali, and other Indic scripts
- Emoji (including ZWJ sequences like 👨‍👩‍👧‍👦)

Browser accuracy is 7680/7680 across Chrome, Safari, and Firefox on the official test corpus.

No special configuration is needed — Pretext auto-detects script boundaries and applies the correct line-breaking rules. If you need a specific locale for word segmentation, use `setLocale()` before `prepare()`.

## Whitespace Modes

### Default (`white-space: normal`)
Collapses whitespace, wraps at word boundaries, breaks long words at grapheme boundaries (matching CSS `overflow-wrap: break-word`).

### Pre-wrap (`{ whiteSpace: 'pre-wrap' }`)
Preserves spaces, tabs (`tab-size: 8`), and newlines. Use this for textareas and code editors. Other wrapping behavior stays the same.

```ts
// For textarea content
const prepared = prepare(value, font, { whiteSpace: 'pre-wrap' });
```

## Gotchas & Edge Cases

- **Very narrow widths** can break inside words at grapheme boundaries. This matches browser behavior with `overflow-wrap: break-word`.
- **`lineHeight` is not optional.** Pretext doesn't infer it from the font — you must pass the same value your CSS uses.
- **Don't re-prepare on resize.** This is the most common performance mistake. `layout()` is the resize path.
- **The `prepared` handle is opaque.** Don't try to inspect or serialize it. Just store and reuse it.
- **Pretext targets a specific CSS configuration:** `white-space: normal`, `word-break: normal`, `overflow-wrap: break-word`, `line-break: auto`. If your text uses different CSS wrapping rules, the heights may not match.
- **Bidi text works automatically.** You don't need to handle RTL or mixed-direction text specially — Pretext handles it internally.

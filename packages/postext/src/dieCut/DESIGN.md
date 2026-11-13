# Special inks and die-cuts — design record

Tracker #1573. Issues: #1563 finishes · #1564 finish mask · #1565 die-cuts · #1566 PDF ·
#1567 canvas/HTML viewers · #1568 Folio inks · #1569 Folio die-cuts · #1570 Sandbox ·
#1571 docs + skill · #1572 Cookbook.

## 1. Ink finishes (#1563)

- `SpotColor.finish?: InkFinish` and `PrintInk.finish` (the ink table's wins: `finishOfSpot`).
  `InkFinish = { kind: 'metallic'|'foil'|'fluorescent'|'white'|'varnish'; sheen?: 'gloss'|'satin'|'matte'|'softTouch' }`.
  The sheen defaults are set by `finishSheen`: varnish and foil take gloss, metallic takes satin, and fluorescent and white take none.
- A finish never changes the layout. A colour is still known to every backend by its screen hex. The VDT stores hex, and
  `authoredSpotColors([doc.config, doc.printColors])` maps hex → spot, as the PDF already does. A screen-side
  `finishInks(doc): Map<hex6, InkFinish & { tint }>` is built the same way and passed through the ink table.
- **Screen:**
  - A varnish is not painted: `finishPaintsOnScreen`. Canvas and HTML/EPUB skip any paint whose hex is a varnish ink's.
    The RGB PDF skips it too.
  - Every other finish paints its hex.
- **PDF (CMYK / PDF/X):**
  - Every special ink gets its own `Separation`, named by the ink table's `pdfName`, as any spot ink.
  - It never falls back to process unless `output: 'process'`.
  - White and varnish overprint unless `overprint: false` (`finishOverprintsByDefault`).
- **Preflight:**
  - `spotInkFinish` (info, one per special ink).
  - `whiteInkOnWhite` (warning: a white ink on a page whose paper is white or unset).
  - `overprintWhite` is not raised for white or varnish inks.
- `guessInkFinish(name)` is a hint only, for the Sandbox suggestions and the port skill.

## 2. Finish mask (#1564)

`renderFinishMask(page, doc, { scale }): FinishMask | undefined` lives in `canvas-backend/finishMask.ts`. It returns
`undefined` when the page paints no special ink, so it costs nothing on ordinary pages.

```ts
interface FinishMask { width: number; height: number; data: Uint8ClampedArray /* RGBA, not premultiplied */ }
```

- **R** metalness: metallic 1, foil 1.
- **G** sheen: gloss 1 · satin .7 · matte .4 · softTouch .2. A varnish writes its sheen; a metallic ink or foil writes its own.
- **B** fluorescence: 1.
- **A** opaque white coverage: 1.
- Every channel scales with the ink's tint.

The mask is painted with the ordinary canvas painter through instance-level overrides of `fillStyle`, `strokeStyle` and
`drawImage` on the context:

1. **Pass 1, inks that knock out.** A special hex is painted in its mask colour. Any other paint is painted black,
   unless it overprints (then it is skipped). Pictures paint black over their box. A varnish is skipped.
2. **Pass 2, varnish.** Only varnish hexes are painted. Pass 2 is merged into pass 1's G channel with `lighten`.
3. **White.** It is coverage in A, from pass 1's paint of white inks into a separate canvas. The two are packed into
   one RGBA buffer on the CPU.

The canvas preview is `RenderPageOptions.finishes?: 'flat' | 'sheen' | 'map'`, default `'flat'`.

## 3. Die-cuts (#1565)

- Config `dieCuts` (part of the layout key): `shapes`, `pages` (placements by page number), `corners`, `outline`.
  Markdown `:::diecut{die=id}` is a container like `:::paper`: it starts a page and stamps every page its content
  lands on. Composed pages use a template decoration element `kind: 'cut'` (placed like `kind: 'path'`,
  `when`/`unless`), which is removed from the painted decoration.
- **Leaves.** Page index i (0-based) is a recto when `(pageIndexOffset + i) % 2 === 0`, the same rule the canvas
  viewer uses (`firstPageRecto`). Its leaf is `[recto i, verso i+1]`. For a verso i the leaf is `[recto i-1, verso i]`.
  - A shape placed on a page cuts its leaf. The other side gets it mirrored horizontally across the trim:
    x' = trimW − x − w, on the trim of the other page.
  - `leaves: N` repeats the cut on the next N−1 leaves (forward in page order), each with its own mirrored copy.
  - `corners` and `outline` apply to every leaf. A verso mirrors them. "fore" corners are the fore-edge ones:
    right on a recto, left on a verso, swapped in a right-bound book.
- **VDT.** `VDTPage.dieCut = { holes, outline?, sources, wrapGapPx }` holds paths in page px (sheet coordinates,
  y down, bleed offset included like every other VDT coordinate).
- **Helpers** in `dieCut/`:
  - `leafSide(doc, i)`: recto or verso.
  - `pageBeneath(doc, i)`: the page visible under page i. That is i+2 under a recto and i−2 under a verso;
    in a right-bound book the same, since the stack order is by leaves.
  - `seeThrough(doc, i, maxDepth = Infinity)` returns `Array<{ pageIndex, clips: VDTPathCommand[][][] }>`. Each layer
    is clipped by the holes of every page above it, so the clips intersect. The walk stops when the bounding boxes no
    longer overlap any hole, or at the book's end, where the layer is `{ pageIndex: -1 }` (the board or background).
  - `dieCutPath2D(cut)`: a `Path2D` helper for browsers.
- **Text wrap.** Each hole (grown by `wrapGapPx`) is a wrap obstacle on the page, for flowing pages and composed
  frames alike.
- **Preflight:** `dieCutText`, `dieCutTrim`, `dieCutGutter`, `dieCutUnknown`.

## 4. See-through composite (#1567, shared with #1569)

`composeThrough(doc, pageIndex, source: (i) => CanvasImageSource | undefined, target: canvas, scale)` lives in
`canvas-backend/through.ts`. It draws only the hole regions:

- The deeper pages come from `seeThrough`, with nested clips.
- Each cut edge gets a soft inner shadow and a 1–2 px darker "paper wall" line.
- Past the end of the book it shows the board or background colour.
- Outside the holes it stays transparent: alpha marks the hole.

`renderPageToCanvas(…, { beneath })` uses it after the bleed clip is restored and before the print preview. The
outline is cut to transparent. Folio uses the same composite as its per-face *through* texture.

## 5. PDF (#1566)

- `print.dieLine { output: 'page'|'none', ink: 'Die', cmyk: M100, width: 0.25pt }`.
- After the crop marks, the holes and the outline are stroked on `[/Separation /<ink> /DeviceCMYK fn]` with an
  overprinting ExtGState, as an artifact, inside an OCG "Die line". PDF/X-1a gets no OCG.
- The die plate is listed among the inks and plates and is never projected in a `print.plates` job.

## 6. Folio (#1568, #1569)

- **Masks.**
  - Painted at half the page canvas size, only for pages that have one.
  - Each face's material gets `uFrontMask`/`uBackMask`/`uHasFrontMask`/`uHasBackMask`.
  - The shader handles roughness, metalness, emissive and clearcoat per texel.
  - White ink overrides the paper shade.
- **Holes.**
  - Each face carries a *through* texture (rgb = deep stack, a = hole) from `composeThrough`.
  - Open pages shade the hole with depth parallax and a procedural wall.
  - Turning leaves `discard` in the hole, and so do their depth material and caster.
  - Painting adds the exposed deep pages at reduced scale.

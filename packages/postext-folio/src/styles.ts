/** The viewer's own styles, scoped to `.postext-folio`. A host restyles it
 *  through custom properties set on the container (`--postext-folio-accent`,
 *  `--postext-folio-nav-border`) or plain CSS of its own. The page shading
 *  and the drop shadow match what the WebGL canvas draws, so a page at
 *  rest looks the same in the DOM as on the turning leaf. */
export const FOLIO_CSS = `
.postext-folio {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  /* Horizontal swipes turn the spread. */
  touch-action: pan-y pinch-zoom;
  outline: none;
}
.postext-folio:focus-visible {
  outline: 2px solid var(--postext-folio-accent, #4f8cff);
  outline-offset: -4px;
}
.postext-folio-spread {
  position: absolute;
  display: grid;
  grid-template-columns: 1fr 1fr;
  /* Page surfaces (z 1) and their spine shading (z 2) paint above every
     page's drop shadow, as the canvas draws them. */
  isolation: isolate;
}
.postext-folio-spread.is-solo {
  grid-template-columns: 1fr;
}
/* The canvas draws the book: the DOM pages stay (sources, text
   alternatives, click targets) but are not seen. */
.postext-folio-spread.is-gl > .postext-folio-page {
  opacity: 0;
}
/* Hand mode: a page is taken by its outer half, and the hand shows only
   there (the viewer marks it as the pointer moves). */
.postext-folio.is-over-grip,
.postext-folio.is-over-grip .postext-folio-spread.is-by-hand > .postext-folio-page:not(.is-empty) {
  cursor: grab;
}
.postext-folio-spread.is-held,
.postext-folio-spread.is-held > .postext-folio-page {
  cursor: grabbing !important;
}
/* Orbit and select modes: one finger drags the view or the selection,
   never the page; the cursor says which. */
.postext-folio.is-orbit,
.postext-folio.is-select {
  touch-action: none;
}
.postext-folio.is-orbit .postext-folio-spread > .postext-folio-page:not(.is-empty),
.postext-folio.is-orbit {
  cursor: move;
}
.postext-folio.is-orbiting,
.postext-folio.is-orbiting * {
  cursor: grabbing !important;
}
.postext-folio.is-select .postext-folio-spread > .postext-folio-page:not(.is-empty) {
  cursor: default;
}
.postext-folio.is-select.is-over-page,
.postext-folio.is-select.is-over-page .postext-folio-spread > .postext-folio-page {
  cursor: text;
}
/* Over something a click acts on (a video that plays on the page), in
   every pointer mode. */
.postext-folio.is-over-action,
.postext-folio.is-over-action.is-select,
.postext-folio.is-over-action.is-orbit,
.postext-folio.is-over-action .postext-folio-spread > .postext-folio-page:not(.is-empty),
.postext-folio.is-over-action.is-select .postext-folio-spread > .postext-folio-page:not(.is-empty),
.postext-folio.is-over-action.is-orbit .postext-folio-spread > .postext-folio-page:not(.is-empty) {
  cursor: pointer;
}
/* A video on a page of the DOM spread (no WebGL): laid over its poster. */
.postext-folio-page > .postext-folio-video {
  position: absolute;
  z-index: 2;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  object-fit: cover;
  background: #000;
  pointer-events: none;
}
.postext-folio-spread,
.postext-folio-page {
  user-select: none;
  -webkit-user-select: none;
}
/* The book in WebGL: over the whole box, centred on the spread (sized by
   the viewer), with room for a lifted leaf. */
.postext-folio-flip {
  position: absolute;
  z-index: 3;
  pointer-events: none;
}
.postext-folio-page {
  position: relative;
  margin: 0;
  min-width: 0;
}
.postext-folio-page > img,
.postext-folio-page > .postext-folio-surface {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  background: #fff;
}
.postext-folio-page.is-blank {
  background: var(--postext-folio-paper, #fff);
}
.postext-folio-page:not(.is-empty) {
  box-shadow:
    0 1px 1px rgb(0 0 0 / 0.35),
    0 16px 36px -8px rgb(0 0 0 / 0.65);
}
/* The spine: each page darkens towards the fold. */
.postext-folio-page:not(.is-empty)::after {
  content: "";
  position: absolute;
  z-index: 2;
  inset: 0;
  pointer-events: none;
}
.postext-folio-page.is-verso::after {
  background: linear-gradient(to left, rgb(0 0 0 / 0.16), rgb(0 0 0 / 0.04) 3%, transparent 9%);
}
.postext-folio-page.is-recto::after {
  background: linear-gradient(to right, rgb(0 0 0 / 0.18), rgb(0 0 0 / 0.05) 3%, transparent 9%);
}
/* A right-bound book lies mirrored: the verso on the right, the recto on
   the left, each shaded towards the fold. */
.postext-folio[dir="rtl"] .postext-folio-page.is-verso::after {
  background: linear-gradient(to right, rgb(0 0 0 / 0.16), rgb(0 0 0 / 0.04) 3%, transparent 9%);
}
.postext-folio[dir="rtl"] .postext-folio-page.is-recto::after {
  background: linear-gradient(to left, rgb(0 0 0 / 0.18), rgb(0 0 0 / 0.05) 3%, transparent 9%);
}
.postext-folio-nav {
  position: absolute;
  z-index: 4;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1.5px solid var(--postext-folio-nav-border, color-mix(in srgb, currentColor 35%, transparent));
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, opacity 0.15s;
}
.postext-folio-nav.is-prev {
  left: 12px;
}
.postext-folio-nav.is-next {
  right: 12px;
}
.postext-folio[dir="rtl"] .postext-folio-nav.is-prev {
  left: auto;
  right: 12px;
}
.postext-folio[dir="rtl"] .postext-folio-nav.is-next {
  right: auto;
  left: 12px;
}
.postext-folio-nav[hidden] {
  display: none;
}
.postext-folio-nav:hover:not(:disabled) {
  border-color: var(--postext-folio-accent, #4f8cff);
  color: var(--postext-folio-accent, #4f8cff);
}
.postext-folio-nav:focus-visible {
  outline: 2px solid var(--postext-folio-accent, #4f8cff);
  outline-offset: 2px;
}
.postext-folio-nav:disabled {
  opacity: 0.3;
  cursor: default;
}
.postext-folio-count {
  position: absolute;
  z-index: 4;
  left: 0;
  right: 0;
  bottom: 12px;
  text-align: center;
  pointer-events: none;
  margin: 0;
  font: inherit;
  font-size: 0.875em;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
/* Announced, not shown. */
.postext-folio-count.is-unseen {
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
/* One page at a time: the buttons and the count in a bar under the page. */
.postext-folio.is-single .postext-folio-nav {
  top: auto;
  bottom: 12px;
  transform: none;
}
.postext-folio.is-single .postext-folio-count {
  bottom: 24px;
}
@media (prefers-reduced-motion: reduce) {
  .postext-folio-nav {
    transition: none;
  }
}
`;

const STYLE_ID = "postext-folio-styles";

/** Adds the styles once to the document (or shadow root) the viewer
 *  lives in. */
export function injectStyles(target: Node) {
  const root = target.getRootNode() as Document | ShadowRoot;
  const host = "head" in root ? root.head : root;
  if (!host) return;
  const existing = "getElementById" in root ? root.getElementById(STYLE_ID) : null;
  if (existing) {
    // Another version of the viewer on the page (a hot reload, two
    // bundles): its styles give way to this one's.
    if (existing.textContent !== FOLIO_CSS) existing.textContent = FOLIO_CSS;
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = FOLIO_CSS;
  host.append(style);
}

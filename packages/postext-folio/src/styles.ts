/** The viewer's own styles, scoped to `.postext-folio`. A host restyles it
 *  through custom properties set on the container (`--postext-folio-accent`,
 *  `--postext-folio-nav-border`) or plain CSS of its own. The page shading
 *  and the drop shadow match what the WebGL canvas draws, so a page at
 *  rest looks the same in the DOM as on the turning leaf. */
export const FOLIO_CSS = `
.postext-folio {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 1rem;
  /* Horizontal swipes turn the spread. */
  touch-action: pan-y pinch-zoom;
  outline: none;
}
.postext-folio:focus-visible {
  outline: 2px solid var(--postext-folio-accent, #4f8cff);
  outline-offset: -4px;
}
.postext-folio-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 100%;
}
.postext-folio-spread {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  flex: none;
  /* Page surfaces (z 1) and their spine shading (z 2) paint above every
     page's drop shadow, as the canvas draws them. */
  isolation: isolate;
}
.postext-folio-spread.is-solo {
  grid-template-columns: 1fr;
}
/* While a leaf turns the canvas draws the spread. */
.postext-folio-spread.is-turning > .postext-folio-page {
  visibility: hidden;
}
.postext-folio-spread.is-by-hand > .postext-folio-page:not(.is-empty) {
  cursor: grab;
}
.postext-folio-spread.is-held,
.postext-folio-spread.is-held > .postext-folio-page {
  cursor: grabbing !important;
}
.postext-folio-spread,
.postext-folio-page {
  user-select: none;
  -webkit-user-select: none;
}
/* The page turn: drawn over the spread with room for the lifted leaf;
   transparent at rest. */
.postext-folio-flip {
  position: absolute;
  top: -18%;
  left: -6%;
  width: 112%;
  height: 136%;
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
  display: grid;
  flex: none;
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
  margin: 0;
  font: inherit;
  font-size: 0.875em;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
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
  if (!host || ("getElementById" in root && root.getElementById(STYLE_ID))) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = FOLIO_CSS;
  host.append(style);
}

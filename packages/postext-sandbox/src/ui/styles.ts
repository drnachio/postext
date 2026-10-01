/** Scope of the accessibility floor: the sandbox root and the popups it
 *  portals to the body. */
const SCOPE = ':where([data-postext-sandbox], [data-postext-popup])';
/** The same scope with "Large targets" on (`ui/largeTargets.tsx`). */
const LARGE = ':where([data-pt-targets=large])';

/** Every control that takes a pointer, as WCAG 2.5.5 (Target Size,
 *  Enhanced) counts them. */
const TARGETS = [
  'a[href]',
  'button',
  'select',
  'summary',
  'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([aria-hidden=true])',
  '[role=button]',
  '[role=tab]',
  '[role=menuitem]',
  '[role=menuitemradio]',
  '[role=menuitemcheckbox]',
  '[role=option]',
  '[role=switch]',
  '[role=radio]',
  '[role=checkbox]',
  '[role=separator][tabindex]',
].join(', ');

/** WCAG 2.2 AAA floor shared by every part of the sandbox:
 *  - 2.5.5, with "Large targets" on: no pointer target below 44×44 CSS px.
 *    The primitives size themselves through the `pt-large:` variant; the
 *    floor catches any control built by hand. Off, the editor keeps its
 *    compact sizes.
 *    min-width/height do nothing to inline elements, so a link inside a
 *    sentence keeps its line.
 *  - 1.4.11: field and button outlines in --pt-control-border, at least
 *    3:1 against the panels in both themes (--rule is a hairline, for
 *    dividers only).
 *  - 1.4.8: paragraphs and list items keep a line height of 1.5.
 *  - 3.1.4: small heads and tags are set in small capitals (.pt-caps)
 *    instead of text-transform: uppercase, which turns words into what
 *    reads as abbreviations.
 *  - 2.4.7 / 2.4.13: a 2px focus ring wherever a control does not draw its
 *    own.
 *  - 1.4.4: pinch zoom stays on, so on a touch screen (or a narrow one)
 *    every field is set at 16px, the size below which iOS zooms in on
 *    focus, and a double tap does not zoom (touch-action: manipulation). */
const A11Y_CSS = `
${SCOPE} { --pt-control-border: color-mix(in srgb, var(--slate) 78%, var(--background)); }
${LARGE} :where(${TARGETS}) { min-width: 44px; min-height: 44px; }
${SCOPE} :where(:focus-visible) { outline: 2px solid var(--brand); outline-offset: 2px; }
${SCOPE} :is(p, li, dd, blockquote) { line-height: 1.5 !important; }
${SCOPE} :is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), textarea, select):not([aria-invalid=true]) { border-color: var(--pt-control-border) !important; }
.pt-caps { font-variant-caps: all-small-caps; }
[data-postext-sandbox] { touch-action: manipulation; }
@media (prefers-reduced-motion: reduce) {
  [data-postext-sandbox] *, [data-postext-popup] * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
@media (pointer: coarse), (max-width: 767.98px) {
  ${SCOPE} :is(input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable=true]) { font-size: 16px !important; }
  [data-postext-sandbox] .cm-editor .cm-scroller { font-size: 16px !important; }
}
`;

/** The few CSS rules the sandbox needs that Tailwind utilities cannot express:
 *  keyframes, native spinner hiding, and the enter/exit transitions Base UI
 *  drives through data attributes, plus the accessibility floor above. Injected once by `SandboxGlobalStyles`. */
export const SANDBOX_CSS = `
@keyframes postext-spin { to { transform: rotate(360deg); } }
@keyframes postext-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes postext-dirty-bounce { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-4px); } }
.postext-hide-spinners::-webkit-outer-spin-button,
.postext-hide-spinners::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.postext-hide-spinners { -moz-appearance: textfield; }
[data-postext-popup] {
  transform-origin: var(--transform-origin);
  transition: opacity 120ms ease, transform 120ms ease;
}
[data-postext-popup][data-starting-style],
[data-postext-popup][data-ending-style] { opacity: 0; transform: scale(0.97); }
[data-postext-collapsible] {
  height: var(--collapsible-panel-height);
  overflow: hidden;
  transition: height 200ms ease;
}
[data-postext-collapsible][data-starting-style],
[data-postext-collapsible][data-ending-style] { height: 0; }
[data-postext-collapsible][data-instant] { transition: none; }
@media (prefers-reduced-motion: reduce) {
  [data-postext-popup], [data-postext-collapsible] { transition: none; }
}
${A11Y_CSS}`;

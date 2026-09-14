/** The few CSS rules the sandbox needs that Tailwind utilities cannot express:
 *  keyframes, native spinner hiding, and the enter/exit transitions Base UI
 *  drives through data attributes. Injected once by `SandboxGlobalStyles`. */
export const SANDBOX_CSS = `
@keyframes postext-spin { to { transform: rotate(360deg); } }
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
`;

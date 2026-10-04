// ─── Kit · book v1 ── books bound on either edge · postext.dev/cookbook ──────
// A book bound on the right (Arabic, Hebrew or Persian text, vertical
// Chinese, or page.binding 'right') opens from what a Latin reader calls
// the back: page 1 lies alone on the left of the spine, then [3 | 2].

/** showPages for a book bound on either edge. A right-bound book (the
 *  document says so: doc.binding is 'right' for page.binding 'right', for
 *  text that runs right to left and for vertical text, when the binding is
 *  left to 'auto') lies on the desk as it opens: page 1 alone on the left
 *  of the spine, then [3 | 2], the spine shade on each page's inner edge.
 *  `binding` ('left' | 'right') overrides the document's. */
function showBook(docs, { binding, ...options } = {}) {
  const count = showPages(docs, options);
  const right = (binding ?? [docs].flat()[0]?.binding) === 'right';
  if (!document.getElementById('pt-kit-book')) {
    // The pages keep direction ltr, as in a left-bound book: a canvas takes
    // the direction its element inherits, and under the spread's rtl a run
    // painted for an ltr canvas would end where the engine starts it.
    document.head.insertAdjacentHTML('beforeend', `<style id="pt-kit-book">
      .pt-spread[dir="rtl"] canvas { direction: ltr; }
      .pt-spread[dir="rtl"] figure:first-child canvas { box-shadow: inset 14px 0 14px -14px rgb(0 0 0 / .18),
        0 1px 2px rgb(0 0 0 / .5), 0 22px 44px -16px rgb(0 0 0 / .8); }
    </style>`);
  }
  // Each pair stays [verso, recto] in the page; right to left, the verso
  // sits on the right. Phones stack the pages in reading order either way.
  for (const spread of document.querySelectorAll('#pages > .pt-spread')) spread.dir = right ? 'rtl' : 'ltr';
  document.getElementById('pages').dataset.binding = right ? 'right' : 'left';
  return count;
}

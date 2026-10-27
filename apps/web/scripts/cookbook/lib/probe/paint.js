// Walking the painted pages: headings, blocks, keys and maths errors.
import { fontsOf } from './fonts.js';

/** Blocks laid out on a page: columns, floats, margin notes, footnotes. */
/** A page's first heading as the alt text names it, else its opener band's text. */
export function pageHeading(page, blocks) {
  const headingBlock = blocks.find((b) => b.type === 'heading');
  const heading = headingBlock ? (headingBlock.lines ?? []).map((l) => l.text).join(' ').trim() : '';
  if (heading || !page.openerBand) return heading;
  return (page.openerBand.blocks ?? []).filter((b) => b.kind === 'text')
    .map((b) => (b.lines ?? []).map((l) => l.text).join(' ')).join(' ').trim().slice(0, 120);
}

export function pageBlocks(page) {
  return [
    ...(page.columns ?? []).flatMap((column) => column.blocks ?? []),
    ...(page.floats ?? []),
    ...(page.marginNotes ?? []),
    ...(page.footnoteArea?.notes ?? []),
  ];
}

/** Calls visit(font, text, where) for every run of text the renderer paints. */
export function walkPainted(pages, visit) {
  const lines = (list, set, where) => {
    for (const line of list ?? []) {
      if (line.segments?.length) {
        for (const seg of line.segments) {
          if (seg.kind === 'text' && seg.text.trim()) {
            const font = seg.fontString
              ?? (seg.bold && seg.italic ? set.bi : seg.bold ? set.b : seg.italic ? set.i : set.n);
            visit(font, seg.text, where);
          } else if (seg.kind === 'chip') {
            for (const run of seg.chip?.runs ?? []) if (run.text.trim()) visit(run.fontString, run.text, where);
          }
        }
      } else if (line.text?.trim()) visit(set.n, line.text, where);
    }
  };
  const slot = (design, where) => {
    for (const el of design?.blocks ?? []) {
      if (el.kind !== 'text') continue;
      const text = (el.lines ?? []).map((l) => l.text).join(' ');
      if (text.trim()) visit(el.fontString, text, `${where} design`);
    }
  };
  for (const { page, n } of pages) {
    const where = `p${n}`;
    for (const block of pageBlocks(page)) {
      const at = `${where} ${block.type}`;
      if (block.designOverlay) slot(block.designOverlay, at);
      else if (!block.hidden) lines(block.lines, fontsOf(block, ''), at);
      if (block.bulletText?.trim()) visit(block.bulletFontString ?? block.fontString, block.bulletText, `${at} bullet`);
      if (block.separatorText?.trim()) visit(block.separatorFontString ?? block.fontString, block.separatorText, `${at} bullet`);
      const rb = block.resourceBlock;
      if (rb) {
        lines(rb.captionLines, fontsOf(rb, 'caption'), `${where} caption`);
        lines(rb.noteLines, fontsOf(rb, 'note'), `${where} note`);
        lines(rb.continuesLines, fontsOf(rb, 'note'), `${where} note`);
        for (const cell of rb.table?.cells ?? []) {
          lines(cell.lines, fontsOf(rb.table, cell.isHeader ? 'header' : ''), `${where} table`);
        }
      }
    }
    slot(page.header, `${where} header`);
    slot(page.footer, `${where} footer`);
    slot(page.openerBand, `${where} opener`);
  }
}

/** Every string under a key matching `keys`, with a readable path. */
export function collectKeys(root, keys, skip = /^(sourceMap|mathRender|attrSources)$/) {
  const found = [];
  const seen = new WeakSet();
  const walk = (node, at) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      if (typeof node[0] === 'number') return;
      node.forEach((item, i) => walk(item, `${at}[${i}]`));
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (skip.test(key)) continue;
      if (typeof value === 'string' && keys.test(key)) { if (value) found.push({ key, value, at: at ? `${at}.${key}` : key }); }
      else if (value && typeof value === 'object') walk(value, at ? `${at}.${key}` : key);
    }
  };
  walk(root, '');
  return found;
}

/** Every formula on the pages that the maths engine could not set (#683):
 *  `renderMath` paints a small red box for it and keeps MathJax's message
 *  in `mathRender.error`. A render sits on a line segment wherever its line
 *  is (a paragraph, a box, a caption, a cell, a note), so the pages are
 *  walked whole; one formula on several lines of a page counts once. */
export function mathErrorsOf(pages) {
  const found = [];
  const seen = new WeakSet();
  const walk = (node, n, onPage) => {
    if (!node || typeof node !== 'object' || seen.has(node) || ArrayBuffer.isView(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      if (typeof node[0] !== 'number') for (const item of node) walk(item, n, onPage);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'mathRender') {
        if (!value?.error || onPage.has(value.tex)) continue;
        onPage.add(value.tex);
        found.push({ page: n, tex: String(value.tex ?? ''), error: String(value.error) });
      } else if (value && typeof value === 'object') walk(value, n, onPage);
    }
  };
  for (const { page, n } of pages) walk(page, n, new Set());
  return found;
}

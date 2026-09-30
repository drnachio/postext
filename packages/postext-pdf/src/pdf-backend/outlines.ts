import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFPage,
  PDFRef,
  type PDFContext,
} from 'pdf-lib';
import { blockLinesText } from 'postext';
import type { VDTBlock, VDTDocument } from 'postext';

interface OutlineEntry {
  title: string;
  level: number;
  pageIndex: number;
  y: number;
}

/** Runs of white space as one space; the ideographic space (U+3000) of a
 *  Chinese title stays. */
const SPACES = /[^\S\u3000]+/g;

/** A heading's printed lines as one line of text: joined back as they were
 *  broken (`blockLinesText`: nothing between two Chinese characters, the
 *  word a hyphen divided whole again), a forced break (`\\`) as plain text
 *  reads it (nothing where a Chinese character meets a digit or Latin
 *  text, #221), white space collapsed but for the ideographic space. */
export function headingLinesText(block: VDTBlock): string {
  return blockLinesText(block, { plainTitleBreaks: true }).replace(SPACES, ' ').trim();
}

/** A heading's number as its lines read it back: white space collapsed
 *  and trimmed at the ends. A template that opens with ideographic spaces
 *  (`'　　{2:一}、'`, the two-cell indent of a GB/T 9704 head) prints them,
 *  but the lines lose them to the trim, and a bookmark does not start with
 *  an indent. */
function headingNumberText(block: VDTBlock): string {
  return block.numberPrefix?.replace(SPACES, ' ').trim() ?? '';
}

/** A heading's number and title as one line, from its printed lines: the
 *  number goes in front when the lines do not already start with it (an
 *  opener prints it apart), joined as the heading joins them (`'　'` or
 *  nothing in a Chinese heading). The bookmarks and the document title read
 *  a heading this way. */
export function numberedHeadingText(block: VDTBlock): string {
  const raw = headingLinesText(block);
  if (!raw) return '';
  const number = headingNumberText(block);
  return number && !raw.startsWith(number) ? `${number}${block.numberSeparator ?? ' '}${raw}` : raw;
}

/** A heading's bookmark title: its number and its title as written. A
 *  letter-case transform (`textTransform: 'uppercase'`) is how the page
 *  prints the heading, not its name — as with CSS `text-transform`, the
 *  bookmark keeps the source's case (EF-81). */
function extractBlockText(block: VDTBlock): string {
  const written = block.sourceTitle?.replace(SPACES, ' ').trim();
  if (!written) return numberedHeadingText(block);
  const number = headingNumberText(block);
  return number ? `${number}${block.numberSeparator ?? ' '}${written}` : written;
}

/** Headings of `doc`, with page indices offset by `base` (the PDF pages of
 *  the documents rendered before it). A level-1 heading whose style keeps it
 *  out of the running chapter and out of the contents (`runningChapter:
 *  false`, `toc: false`: a plate or a map set as a heading inside a chapter)
 *  is not bookmarked either. */
function collectHeadings(doc: VDTDocument, base = 0): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const unlisted = new Set(
    (doc.config.headingStyles ?? []).filter((s) => !s.runningChapter && !s.toc).map((s) => s.id),
  );
  for (const page of doc.pages) {
    // Part-divider pages sit above the chapters: level 0 so `buildTree`
    // nests the following H1s (level 1) under them.
    if (page.partInfo) {
      const title = `${page.partInfo.number} ${page.partInfo.title.replace(/[ \t]*\\\\[ \t]*/g, ' ')}`.trim();
      if (title) entries.push({ title, level: 0, pageIndex: base + page.index, y: 0 });
    }
    for (const col of page.columns) {
      for (const block of col.blocks) {
        if (block.type !== 'heading') continue;
        if (block.notRunningChapter && block.headingStyleId && unlisted.has(block.headingStyleId)) continue;
        const title = extractBlockText(block);
        if (!title) continue;
        entries.push({
          title,
          level: block.headingLevel ?? 1,
          pageIndex: base + page.index,
          // A vertical page's heading runs down its column from the flow's
          // x: the top of the column on the sheet, where reading starts.
          y: page.flow ? block.bbox.x : block.bbox.y,
        });
      }
    }
  }
  return entries;
}

interface TreeNode {
  entry: OutlineEntry;
  children: TreeNode[];
}

function buildTree(entries: OutlineEntry[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = [];
  for (const entry of entries) {
    const node: TreeNode = { entry, children: [] };
    while (stack.length > 0 && stack[stack.length - 1]!.entry.level >= entry.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1]!.children.push(node);
    }
    stack.push(node);
  }
  return roots;
}

function countDescendants(node: TreeNode): number {
  let n = node.children.length;
  for (const child of node.children) n += countDescendants(child);
  return n;
}

/** Attach an `/Outlines` dictionary tree to the document so PDF readers can
 *  expose clickable bookmarks for every heading, jumping to the heading's
 *  page (and approximate Y position). Also sets `/PageMode /UseOutlines` so
 *  the outlines panel is open when the file is first displayed. */
export function addOutlines(pdfDoc: PDFDocument, input: VDTDocument | VDTDocument[]): void {
  const docs = Array.isArray(input) ? input : [input];
  const entries: OutlineEntry[] = [];
  let base = 0;
  for (const doc of docs) {
    entries.push(...collectHeadings(doc, base));
    base += doc.pages.length;
  }
  if (entries.length === 0 || docs.length === 0) return;
  const roots = buildTree(entries);
  if (roots.length === 0) return;

  const context: PDFContext = pdfDoc.context;
  const pdfPages = pdfDoc.getPages();
  const scale = 72 / docs[0]!.config.page.dpi;

  const rootRef = context.nextRef();

  const refMap = new Map<TreeNode, PDFRef>();
  function assignRefs(nodes: TreeNode[]) {
    for (const node of nodes) {
      refMap.set(node, context.nextRef());
      assignRefs(node.children);
    }
  }
  assignRefs(roots);

  function registerNode(
    node: TreeNode,
    parentRef: PDFRef,
    prevRef: PDFRef | null,
    nextRef: PDFRef | null,
  ): void {
    const { entry } = node;
    const pdfPage: PDFPage | undefined = pdfPages[entry.pageIndex];
    const pageRef = pdfPage ? pdfPage.ref : undefined;
    const pageHeightPt = pdfPage ? pdfPage.getHeight() : 0;
    const topPt = pdfPage ? pageHeightPt - entry.y * scale : 0;

    const destArray = context.obj([
      pageRef ?? pdfPages[0]!.ref,
      PDFName.of('XYZ'),
      null,
      topPt,
      null,
    ]);

    const childRefs = node.children.map((c) => refMap.get(c)!);

    const dict = context.obj({
      Title: PDFHexString.fromText(entry.title),
      Parent: parentRef,
      Dest: destArray,
    });
    if (prevRef) dict.set(PDFName.of('Prev'), prevRef);
    if (nextRef) dict.set(PDFName.of('Next'), nextRef);
    if (childRefs.length > 0) {
      dict.set(PDFName.of('First'), childRefs[0]!);
      dict.set(PDFName.of('Last'), childRefs[childRefs.length - 1]!);
      dict.set(
        PDFName.of('Count'),
        context.obj(-countDescendants(node)),
      );
    }

    context.assign(refMap.get(node)!, dict);

    for (let i = 0; i < node.children.length; i++) {
      registerNode(
        node.children[i]!,
        refMap.get(node)!,
        i > 0 ? childRefs[i - 1]! : null,
        i < node.children.length - 1 ? childRefs[i + 1]! : null,
      );
    }
  }

  const rootChildRefs = roots.map((r) => refMap.get(r)!);
  for (let i = 0; i < roots.length; i++) {
    registerNode(
      roots[i]!,
      rootRef,
      i > 0 ? rootChildRefs[i - 1]! : null,
      i < roots.length - 1 ? rootChildRefs[i + 1]! : null,
    );
  }

  const rootDict = context.obj({
    Type: 'Outlines',
    First: rootChildRefs[0]!,
    Last: rootChildRefs[rootChildRefs.length - 1]!,
    Count: roots.reduce((n, r) => n + 1 + countDescendants(r), 0),
  });
  context.assign(rootRef, rootDict);

  pdfDoc.catalog.set(PDFName.of('Outlines'), rootRef);
  pdfDoc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

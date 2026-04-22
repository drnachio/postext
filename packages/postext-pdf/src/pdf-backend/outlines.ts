import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFPage,
  PDFRef,
  type PDFContext,
} from 'pdf-lib';
import type { VDTBlock, VDTDocument } from 'postext';

interface OutlineEntry {
  title: string;
  level: number;
  pageIndex: number;
  y: number;
}

function extractBlockText(block: VDTBlock): string {
  const raw = block.lines
    .map((line) => line.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return '';
  if (block.numberPrefix && !raw.startsWith(block.numberPrefix)) {
    return `${block.numberPrefix} ${raw}`;
  }
  return raw;
}

function collectHeadings(doc: VDTDocument): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  for (const page of doc.pages) {
    for (const col of page.columns) {
      for (const block of col.blocks) {
        if (block.type !== 'heading') continue;
        const title = extractBlockText(block);
        if (!title) continue;
        entries.push({
          title,
          level: block.headingLevel ?? 1,
          pageIndex: page.index,
          y: block.bbox.y,
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
export function addOutlines(pdfDoc: PDFDocument, doc: VDTDocument): void {
  const entries = collectHeadings(doc);
  if (entries.length === 0) return;
  const roots = buildTree(entries);
  if (roots.length === 0) return;

  const context: PDFContext = pdfDoc.context;
  const pdfPages = pdfDoc.getPages();
  const scale = 72 / doc.config.page.dpi;

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

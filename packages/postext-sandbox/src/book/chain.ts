// The whole book as its chapters' own documents, in order, each laid out
// after the pages the chapters before it actually came to — how the PDF
// tab renders the book scope. The plan says what every chapter inherits;
// the chain supplies the pages.

import type { LayoutContinuation, NumeralStyle, VDTDocument } from 'postext';
import type { ChapterPlan } from './types';

/** Lays out `plans` in order with `build`, chaining the page offset and the
 *  numbering on the documents built, not on the layout records (a record
 *  may be missing or behind). `build` returns null for a chapter to leave
 *  out.
 *
 *  The plan's `bookPageCount` is taken from the records too. When the
 *  configuration prints it (`usesBookTotal`) and a chapter printed another
 *  count than the book came to, the book is laid out once more with the
 *  count it has: the count moves no page, so one more pass settles it. */
export async function layOutBookChain(
  plans: readonly ChapterPlan[],
  build: (plan: ChapterPlan, continuation: LayoutContinuation | undefined, pagesBefore: number) => Promise<VDTDocument | null>,
  usesBookTotal: boolean,
): Promise<VDTDocument[]> {
  const pass = async (bookPageCount: number | undefined): Promise<{ docs: VDTDocument[]; pages: number }> => {
    const docs: VDTDocument[] = [];
    let offset = 0;
    let nextNumbering: { format: NumeralStyle; startAt: number } | null = null;
    const total = bookPageCount !== undefined ? { bookPageCount } : {};
    for (const plan of plans) {
      // The first chapter inherits nothing but the book's page count. The
      // page fields of a plan not yet paginated are provisional: the chain
      // has the real ones.
      const { pageNumbering: planNumbering, ...inherited } = plan.continuation ?? {};
      const numbering = nextNumbering ?? (plan.paginated ? planNumbering : undefined);
      const continuation: LayoutContinuation | undefined = plan.index === 0
        ? (bookPageCount !== undefined ? { ...plan.continuation, ...total } : plan.continuation)
        : { ...inherited, pageIndexOffset: offset, ...(numbering ? { pageNumbering: numbering } : {}), ...total };
      const doc = await build(plan, continuation, offset);
      if (!doc) continue;
      docs.push(doc);
      offset += doc.pages.length;
      const last = doc.pages[doc.pages.length - 1];
      if (last) nextNumbering = { format: last.pageNumberFormat, startAt: last.pageNumberValue + 1 };
    }
    return { docs, pages: offset };
  };
  const first = await pass(undefined);
  if (!usesBookTotal || first.docs.every((d) => d.bookPageCount === first.pages)) return first.docs;
  return (await pass(first.pages)).docs;
}

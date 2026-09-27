import type { PanelId } from '../types';

/** Open a book picked in the Books panel, then show its chapters: the
 *  sidebar moves to the Chapters panel once the book is on screen — not
 *  when it did not open (an error, a load superseded by another click), and
 *  not when the reader has moved to another panel meanwhile. */
export async function openBookThenShowChapters(
  open: () => Promise<unknown>,
  deps: { getPanel: () => PanelId | null; showChapters: () => void },
): Promise<void> {
  let result: unknown;
  try {
    result = await open();
  } catch {
    // Reported by the operation itself (the panel's status line).
    return;
  }
  if (result === false) return;
  if (deps.getPanel() !== 'projects') return;
  deps.showChapters();
}

'use client';

import { Dialog } from '@base-ui/react/dialog';
import { counted } from './sandboxImport.js';
import { type WordImportFile, WordImportPopup } from './WordImportDialog/WordImportPopup.js';

export { isolate } from './WordImportDialog/WordImportPopup.js';
export type { WordImportFile } from './WordImportDialog/WordImportPopup.js';

export { counted };

export function WordImportDialog({ file, onClose }: { file: WordImportFile | null; onClose: () => void }) {
  const open = file !== null;
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      {file && <WordImportPopup file={file} onClose={onClose} />}
    </Dialog.Root>
  );
}

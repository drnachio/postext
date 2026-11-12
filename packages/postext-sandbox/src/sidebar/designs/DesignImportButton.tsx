'use client';

import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { IconButton, announce } from '../../ui/index.js';
import { readFileBytes } from '../../storage/persistence.js';
import { fill } from '../../print/fillTokens.js';
import { useDesignHost } from '../../designs/designHost.js';
import { importDesign } from '../../designs/designActions.js';

/** Import a design file (a design or a book `.postext`, or an exported
 *  configuration) into the saved designs. Nothing on the book changes. */
export function DesignImportButton({ onImported }: { onImported?: () => void }) {
  const labels = useSandboxLabels();
  const host = useDesignHost();
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { entry } = await importDesign(host, await readFileBytes(file), file.name);
      announce(fill(labels.designsImported, { name: entry.name }));
      onImported?.();
    } catch {
      // Said in words, with what to try instead (WCAG 3.3.1, 3.3.3).
      announce(fill(labels.designsImportFailed, { file: file.name }));
    }
  };
  return (
    <>
      <IconButton label={labels.designsImport} icon={<Upload size={14} />} onClick={() => ref.current?.click()} />
      {/* No `accept` filter (#1183): macOS greys `.postext` files out now
          and then. A file that is no design is named in the notice. */}
      <input ref={ref} type="file" className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => void pick(e)} />
    </>
  );
}

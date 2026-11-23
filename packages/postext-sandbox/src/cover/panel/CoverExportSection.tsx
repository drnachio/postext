'use client';

import { Download, Image as ImageIcon } from 'lucide-react';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { titleFor } from '../../sidebar/WarningsPanel/titles.js';
import { Button } from '../../ui/index.js';
import { ProgressMeter } from '../../viewport/epub/EpubPreview.js';
import type { CoverState } from '../useCover.js';
import { useCoverExport } from './useCoverExport.js';

/** The sheet's PDF for the printer and the front as a picture, with the
 *  PDF's progress, its error and the preflight's findings. */
export function CoverExportSection({ state }: { state: CoverState }) {
  const labels = useSandboxLabels();
  const ex = useCoverExport(state);
  const ready = state.status === 'ready' && !!state.doc;
  const fraction = ex.progress && ex.progress.totalPages > 0 ? ex.progress.pages / ex.progress.totalPages : 0;
  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" icon={<Download size={13} />} disabled={!ready || ex.busy} onClick={() => void ex.exportPdf()}>{labels.coverExportPdf}</Button>
        <Button variant="outline" size="sm" icon={<ImageIcon size={13} />} disabled={!ready || !state.built?.sheet.zones.some((z) => z.name === 'front')} onClick={() => void ex.exportFront()}>{labels.coverExportFront}</Button>
      </div>
      {ex.busy && <ProgressMeter fraction={fraction} pulse={!ex.progress || ex.progress.phase !== 'pages'} label={labels.coverExporting} />}
      {ex.error && <p role="alert" className="text-xs text-(--destructive)">{labels.coverExportFailed.replace('__error__', ex.error)}</p>}
      {ex.findings && ex.findings.length > 0 && (
        <ul className="m-0 list-disc ps-4 text-xs">
          {[...new Set(ex.findings.map((w) => titleFor(w.payload, labels)))].map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
    </div>
  );
}

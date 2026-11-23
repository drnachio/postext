'use client';

// The chosen sheet written as a PDF for the printer (#1669), the way the
// PDF tab writes a book: its writer settings (print, colour space, output
// profile, the pictures' bytes, the cover's own files beside them) on a
// PDF worker of its own, with its progress and the preflight on the sheet.

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPdfWorker, type PdfWorkerHandle, type RenderProgress } from 'postext-pdf/worker';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { downloadBytes } from '../../storage/persistence/files.js';
import { announce } from '../../ui/announcer.js';
import { createPdfFontProvider } from '../../viewport/pdf/pdfFontProvider.js';
import type { Warning } from '../../warnings/types.js';
import type { CoverState } from '../useCover.js';
import { canvasJpeg, paintCoverZone } from '../paintCover.js';
import { coverFileName as fileName, writeCoverPdf } from '../coverPdf.js';

export interface CoverExport {
  busy: boolean;
  progress: RenderProgress | null;
  error: string | null;
  /** The preflight's findings on the last sheet written. */
  findings: readonly Warning[] | null;
  exportPdf: () => Promise<void>;
  exportFront: () => Promise<void>;
}

export function useCoverExport(state: CoverState): CoverExport {
  const labels = useSandboxLabels();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [findings, setFindings] = useState<readonly Warning[] | null>(null);
  const workerRef = useRef<PdfWorkerHandle | null>(null);
  const providerRef = useRef(createPdfFontProvider());
  useEffect(() => () => {
    workerRef.current?.dispose();
    workerRef.current = null;
  }, []);

  const { built, doc } = state;
  const base = built ? fileName(`${built.sheets.version}-${built.sheet.kind}`) : 'cover';

  const exportPdf = useCallback(async () => {
    if (!built || !doc || busy) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      workerRef.current ??= createPdfWorker();
      const { bytes, findings: found } = await writeCoverPdf(built, doc, workerRef.current, providerRef.current, setProgress);
      setFindings(found);
      downloadBytes(bytes, `${base}.pdf`, 'application/pdf');
      announce(labels.coverExported);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      announce(labels.coverExportFailed.replace('__error__', message));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [built, doc, busy, base, labels.coverExported, labels.coverExportFailed]);

  const exportFront = useCallback(async () => {
    if (!built || !doc) return;
    const canvas = paintCoverZone(built, doc, 'front', 2400);
    const jpeg = canvas ? await canvasJpeg(canvas) : null;
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    if (!jpeg) {
      setError(labels.coverPreviewFailed);
      return;
    }
    downloadBytes(jpeg, `${fileName(`${built.sheets.version}-front`)}.jpg`, 'image/jpeg');
  }, [built, doc, labels.coverPreviewFailed]);

  return { busy, progress, error, findings, exportPdf, exportFront };
}

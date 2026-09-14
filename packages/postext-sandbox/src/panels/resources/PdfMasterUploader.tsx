'use client';

import { useCallback, useRef, useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import { deleteBlob, putBlob } from '../../storage/blobStore';
import { useSandboxLabels } from '../../context/SandboxContext';

interface PdfMasterUploaderProps {
  /** Currently attached master, if any. */
  fileId?: string;
  onAttached: (fileId: string) => void;
  onRemoved: () => void;
}

const ACCEPT = 'application/pdf,.pdf';

/** True when the bytes start with a PDF header (`%PDF`). */
function isPdfBytes(bytes: ArrayBuffer): boolean {
  const b = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  return b.length === 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;
}

/** Attach / replace / remove the vector print master of an SVG resource: a
 *  single-page PDF the PDF export embeds verbatim in place of the SVG. */
export function PdfMasterUploader({ fileId, onAttached, onRemoved }: PdfMasterUploaderProps) {
  const labels = useSandboxLabels();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const buffer = await file.arrayBuffer();
        if (!isPdfBytes(buffer)) {
          setError(labels.uploadPdfMasterInvalid);
          return;
        }
        const next = await putBlob(buffer, 'application/pdf');
        if (fileId) await deleteBlob(fileId).catch(() => undefined);
        onAttached(next);
      } catch {
        setError(labels.uploadPdfMasterFailed);
      } finally {
        setBusy(false);
      }
    },
    [fileId, onAttached, labels],
  );

  const remove = useCallback(async () => {
    if (fileId) await deleteBlob(fileId).catch(() => undefined);
    onRemoved();
  }, [fileId, onRemoved]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          aria-label={fileId ? labels.uploadPdfMasterReplace : labels.uploadPdfMasterDrop}
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded border border-dashed text-xs"
          style={{
            borderColor: dragOver ? 'var(--gilt)' : 'var(--rule)',
            backgroundColor: dragOver ? 'var(--surface)' : 'transparent',
            color: 'var(--slate)',
            padding: '8px',
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <FileText size={14} aria-hidden="true" />
          )}
          <span className="truncate">
            {busy ? labels.uploadStoring : fileId ? labels.uploadPdfMasterReplace : labels.uploadPdfMasterDrop}
          </span>
        </button>
        {fileId && !busy && (
          <button
            type="button"
            onClick={() => void remove()}
            aria-label={labels.uploadPdfMasterRemove}
            title={labels.uploadPdfMasterRemove}
            className="flex items-center justify-center rounded border px-2 text-xs"
            style={{ borderColor: 'var(--rule)', color: 'var(--slate)' }}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
      {error && (
        <span className="text-xs" style={{ color: 'var(--destructive)' }}>
          {error}
        </span>
      )}
    </div>
  );
}

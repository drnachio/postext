'use client';

import { useCallback, useRef, useState } from 'react';
import { FileCode, Loader2 } from 'lucide-react';
import { putBlob } from '../../storage/blobStore';
import { useSandboxLabels } from '../../context/SandboxContext';
import { isValidSvg, svgIntrinsicSize } from './svgIntrinsic';

/** Result of a successful SVG upload, ready to fold into a Resource. */
export interface SvgUploadResult {
  fileId: string;
  filename: string;
  /** Intrinsic size parsed from the SVG, when declared. */
  width?: number;
  height?: number;
}

interface SvgUploaderProps {
  onUploaded: (result: SvgUploadResult) => void;
  compact?: boolean;
}

const ACCEPT = 'image/svg+xml,.svg';

/** Drag/drop + file-input uploader for SVG files. Validates with `DOMParser`
 *  before persisting the source text through `putBlob`. */
export function SvgUploader({ onUploaded, compact = false }: SvgUploaderProps) {
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
        const text = await file.text();
        if (!isValidSvg(text)) {
          setError(labels.uploadSvgInvalid);
          return;
        }
        const buffer = new TextEncoder().encode(text).buffer;
        const fileId = await putBlob(buffer, 'image/svg+xml');
        const size = svgIntrinsicSize(text);
        onUploaded({ fileId, filename: file.name, ...size });
      } catch {
        setError(labels.uploadSvgFailed);
      } finally {
        setBusy(false);
      }
    },
    [onUploaded, labels],
  );

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
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        aria-label={compact ? labels.uploadSvgReplace : labels.resourceUploadSvg}
        className="flex flex-col items-center justify-center gap-1.5 rounded border border-dashed text-xs"
        style={{
          borderColor: dragOver ? 'var(--gilt)' : 'var(--rule)',
          backgroundColor: dragOver ? 'var(--surface)' : 'transparent',
          color: 'var(--slate)',
          padding: compact ? '8px' : '16px',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? (
          <Loader2 size={compact ? 14 : 20} className="animate-spin" aria-hidden="true" />
        ) : (
          <FileCode size={compact ? 14 : 20} aria-hidden="true" />
        )}
        <span>
          {busy
            ? labels.uploadStoring
            : compact
              ? labels.uploadSvgReplace
              : labels.uploadSvgDrop}
        </span>
      </button>
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

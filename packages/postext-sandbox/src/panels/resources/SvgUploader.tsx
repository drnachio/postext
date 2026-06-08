'use client';

import { useCallback, useRef, useState } from 'react';
import { FileCode, Loader2 } from 'lucide-react';
import { putBlob } from '../../storage/blobStore';

/** Result of a successful SVG upload, ready to fold into a Resource. */
export interface SvgUploadResult {
  fileId: string;
  filename: string;
}

interface SvgUploaderProps {
  onUploaded: (result: SvgUploadResult) => void;
  compact?: boolean;
}

const ACCEPT = 'image/svg+xml,.svg';

/** Validate that `text` parses as SVG XML with a root `<svg>` element. */
function isValidSvg(text: string): boolean {
  if (typeof DOMParser === 'undefined') return text.includes('<svg');
  try {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return false;
    return doc.documentElement?.tagName.toLowerCase() === 'svg';
  } catch {
    return false;
  }
}

/** Drag/drop + file-input uploader for SVG files. Validates with `DOMParser`
 *  before persisting the source text through `putBlob`. */
export function SvgUploader({ onUploaded, compact = false }: SvgUploaderProps) {
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
          setError('Not a valid SVG file.');
          return;
        }
        const buffer = new TextEncoder().encode(text).buffer;
        const fileId = await putBlob(buffer, 'image/svg+xml');
        onUploaded({ fileId, filename: file.name });
      } catch {
        setError('Failed to store SVG.');
      } finally {
        setBusy(false);
      }
    },
    [onUploaded],
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
        aria-label={compact ? 'Replace SVG' : 'Upload SVG'}
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
            ? 'Storing…'
            : compact
              ? 'Replace SVG'
              : 'Drop an SVG here or click to upload'}
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

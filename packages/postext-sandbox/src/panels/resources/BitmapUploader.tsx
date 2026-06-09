'use client';

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { putBlob } from '../../storage/blobStore';
import { useSandboxLabels } from '../../context/SandboxContext';

/** Result of a successful bitmap upload, ready to fold into a Resource. */
export interface BitmapUploadResult {
  fileId: string;
  format: string;
  width: number;
  height: number;
  filename: string;
}

interface BitmapUploaderProps {
  /** Called once the blob is decoded and stored. */
  onUploaded: (result: BitmapUploadResult) => void;
  /** Compact variant for the "replace" affordance in the detail pane. */
  compact?: boolean;
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/** Map a MIME type to a short format token stored on the resource. */
function formatFromMime(mime: string): string {
  const sub = mime.split('/')[1] ?? '';
  return sub === 'jpeg' ? 'jpeg' : sub;
}

/** Drag/drop + file-input uploader for raster images. Decodes via
 *  `createImageBitmap` to capture intrinsic width/height, then persists the
 *  bytes through `putBlob`. */
export function BitmapUploader({ onUploaded, compact = false }: BitmapUploaderProps) {
  const labels = useSandboxLabels();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.type.startsWith('image/')) {
        setError(labels.uploadImageInvalid);
        return;
      }
      setBusy(true);
      try {
        const buffer = await file.arrayBuffer();
        let width = 0;
        let height = 0;
        try {
          const bitmap = await createImageBitmap(file);
          width = bitmap.width;
          height = bitmap.height;
          bitmap.close();
        } catch {
          // Some browsers cannot decode certain GIFs/animated images via
          // createImageBitmap; fall back to zero dimensions rather than fail.
          width = 0;
          height = 0;
        }
        const fileId = await putBlob(buffer, file.type);
        onUploaded({
          fileId,
          format: formatFromMime(file.type),
          width,
          height,
          filename: file.name,
        });
      } catch {
        setError(labels.uploadImageFailed);
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
        aria-label={compact ? labels.uploadImageReplace : labels.resourceUploadImage}
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
          <ImagePlus size={compact ? 14 : 20} aria-hidden="true" />
        )}
        <span>
          {busy
            ? labels.uploadStoring
            : compact
              ? labels.uploadImageReplace
              : labels.uploadImageDrop}
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

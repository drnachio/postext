'use client';

import { useEffect, useState } from 'react';
import { FileCode, Table as TableIcon, ImageOff } from 'lucide-react';
import type { Resource, ResourceType } from 'postext';
import { getBlob } from '../../storage/blobStore';
import { parseInlinePreview } from '../../controls/InlineMarkdownInput';

// ---------------------------------------------------------------------------
// ResourcePreview — a mock embed of how a resource will appear in the document:
// the visual payload (bitmap/SVG/table) plus a caption foot with the resource
// type's prefix applied. Numbering is shown as a placeholder ("#") because the
// real running number depends on document order, which is resolved at build.
// ---------------------------------------------------------------------------

/** Subscribe to an object URL for a stored blob, revoking it on change/unmount.
 *  Returns `null` while loading or when the blob is unavailable. */
export function useBlobObjectUrl(fileId: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fileId) {
      setUrl(null);
      return;
    }
    let revoked: string | null = null;
    let cancelled = false;
    getBlob(fileId)
      .then((record) => {
        if (cancelled || !record) {
          if (!cancelled) setUrl(null);
          return;
        }
        const blob = new Blob([record.bytes], { type: record.contentType });
        const objectUrl = URL.createObjectURL(blob);
        revoked = objectUrl;
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [fileId]);
  return url;
}

interface CaptionFootProps {
  resource: Resource;
  type: ResourceType | undefined;
}

/** Render the caption foot: "<prefix> #. <caption>" with inline microformats. */
function CaptionFoot({ resource, type }: CaptionFootProps) {
  const prefix = type ? type.captionPrefix || type.shortLabel || type.name : '';
  const tokens = parseInlinePreview(resource.caption ?? '');
  if (!prefix && tokens.length === 0) return null;
  return (
    <figcaption
      className="text-xs"
      style={{ color: 'var(--slate)', lineHeight: '16px', wordBreak: 'break-word' }}
    >
      {prefix && (
        <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>
          {prefix} #.{tokens.length > 0 ? ' ' : ''}
        </span>
      )}
      {tokens.map((token, i) => (
        <span
          key={i}
          style={{
            fontWeight: token.kind === 'text' && token.bold ? 600 : undefined,
            fontStyle: token.kind === 'text' && token.italic ? 'italic' : undefined,
            fontFamily: token.kind === 'code' ? 'var(--font-mono, monospace)' : undefined,
            color: token.kind === 'ref' ? 'var(--gilt)' : undefined,
          }}
        >
          {token.text}
        </span>
      ))}
    </figcaption>
  );
}

interface BitmapBodyProps {
  fileId: string;
  altText: string;
}

function BitmapBody({ fileId, altText }: BitmapBodyProps) {
  const url = useBlobObjectUrl(fileId);
  if (!url) {
    return (
      <div
        className="flex items-center justify-center rounded"
        style={{ height: 120, backgroundColor: 'var(--surface)', color: 'var(--slate)' }}
      >
        <ImageOff size={20} aria-hidden="true" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={altText}
      className="rounded"
      style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }}
    />
  );
}

function SvgBody({ fileId, altText }: BitmapBodyProps) {
  const url = useBlobObjectUrl(fileId);
  if (!url) {
    return (
      <div
        className="flex items-center justify-center rounded"
        style={{ height: 120, backgroundColor: 'var(--surface)', color: 'var(--slate)' }}
      >
        <FileCode size={20} aria-hidden="true" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={altText}
      className="rounded"
      style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }}
    />
  );
}

interface TableBodyProps {
  resource: Resource;
}

function TableBody({ resource }: TableBodyProps) {
  const model = resource.table?.model;
  if (!model || model.rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center gap-1.5 rounded text-xs"
        style={{ height: 80, backgroundColor: 'var(--surface)', color: 'var(--slate)' }}
      >
        <TableIcon size={16} aria-hidden="true" />
        Empty table
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
        <tbody>
          {model.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                if (cell.hiddenBy) return null;
                const Tag = cell.isHeader ? 'th' : 'td';
                return (
                  <Tag
                    key={c}
                    colSpan={cell.colSpan ?? 1}
                    rowSpan={cell.rowSpan ?? 1}
                    style={{
                      border: '1px solid var(--rule)',
                      padding: '2px 5px',
                      textAlign: cell.align ?? 'left',
                      verticalAlign: cell.verticalAlign ?? 'top',
                      fontWeight: cell.isHeader ? 600 : 400,
                      color: 'var(--foreground)',
                    }}
                  >
                    {cell.content}
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ResourcePreviewProps {
  resource: Resource;
  type: ResourceType | undefined;
}

/** Mock embed of a resource (visual payload + caption foot). */
export function ResourcePreview({ resource, type }: ResourcePreviewProps) {
  const alt = resource.altText ?? '';
  return (
    <figure
      className="flex flex-col gap-2 rounded border p-2"
      style={{ borderColor: 'var(--rule)', margin: 0 }}
    >
      {resource.kind === 'bitmap' && resource.bitmap ? (
        <BitmapBody fileId={resource.bitmap.fileId} altText={alt} />
      ) : resource.kind === 'svg' && resource.svg ? (
        <SvgBody fileId={resource.svg.fileId} altText={alt} />
      ) : resource.kind === 'table' ? (
        <TableBody resource={resource} />
      ) : (
        <div
          className="flex items-center justify-center rounded text-xs"
          style={{ height: 80, backgroundColor: 'var(--surface)', color: 'var(--slate)' }}
        >
          No content yet
        </div>
      )}
      <CaptionFoot resource={resource} type={type} />
    </figure>
  );
}

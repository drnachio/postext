'use client';

import { useEffect, useState } from 'react';
import { FileCode, Table as TableIcon, ImageOff, Play } from 'lucide-react';
import type { Resource, ResourceType } from 'postext';
import { defaultCaptionLabels } from 'postext';
import { documentLanguage } from '../../context/documentDirection';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { getBlob } from '../../storage/blobStore';
import { inlineSvgFonts } from '../../controls/svgFonts';
import { parseInlinePreview } from '../../controls/InlineMarkdownInput';
import { captionPreviewLabel } from './captionLabel';
import { useRightToLeftFlow } from '../../sidebar/settings/flowSides';

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
      .then(async (record) => {
        if (cancelled || !record) {
          if (!cancelled) setUrl(null);
          return;
        }
        // SVG text renders in the sandbox's custom fonts only when they are
        // inlined; an <img> cannot reach the page's FontFaces.
        const blob = record.contentType === 'image/svg+xml'
          ? new Blob([await inlineSvgFonts(new TextDecoder().decode(record.bytes))], { type: record.contentType })
          : new Blob([record.bytes], { type: record.contentType });
        if (cancelled) return;
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

/** Render the caption foot: "<prefix> #. <caption>" with inline microformats,
 *  the label set as the engine sets it (see {@link captionPreviewLabel}). */
function CaptionFoot({ resource, type }: CaptionFootProps) {
  // The document's gap and separator around the number: as written, else
  // its language's (図1-1　 in a Japanese book, #464).
  const labelNumberGap = useSandboxSelector((s) => s.config.captionStyle?.labelNumberGap ?? defaultCaptionLabels(documentLanguage(s.config, s.locale)).labelNumberGap);
  const labelSeparator = useSandboxSelector((s) => s.config.captionStyle?.labelSeparator ?? defaultCaptionLabels(documentLanguage(s.config, s.locale)).labelSeparator);
  const label = captionPreviewLabel(type, { labelNumberGap, labelSeparator });
  const tokens = parseInlinePreview(resource.caption ?? '');
  if (!label && tokens.length === 0) return null;
  return (
    <figcaption
      dir="auto"
      className="text-xs"
      style={{ color: PAPER_MUTED, lineHeight: '16px', wordBreak: 'break-word' }}
    >
      {label && (
        <span style={{ fontWeight: 600, color: PAPER_INK }}>
          {tokens.length > 0 ? label : label.trimEnd()}
        </span>
      )}
      {tokens.map((token, i) => (
        <span
          key={i}
          style={{
            fontWeight: token.kind === 'text' && token.bold ? 600 : undefined,
            fontStyle: token.kind === 'text' && token.italic ? 'italic' : undefined,
            fontFamily: token.kind === 'code' ? 'var(--font-mono, monospace)' : undefined,
            color: token.kind === 'ref' ? 'var(--brand)' : undefined,
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

/** A video's poster with a play badge (#454): what print shows, the
 *  overlays aside. */
function VideoBody({ fileId, altText }: BitmapBodyProps) {
  return (
    <div className="relative flex items-center justify-center">
      <BitmapBody fileId={fileId} altText={altText} />
      <span className="absolute flex items-center justify-center rounded-full" style={{ width: 36, height: 36, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff' }}>
        <Play size={18} fill="currentColor" aria-hidden="true" />
      </span>
    </div>
  );
}

interface TableBodyProps {
  resource: Resource;
}

/** The image embedded in a table cell (`TableCell.image`), at the fraction
 *  of the cell width it takes on the page. Nothing when the id resolves to
 *  no image resource — the cell is then text-only on the page as well. */
function CellImage({ resourceId, width }: { resourceId: string; width: number | undefined }) {
  const resource = useSandboxSelector((s) => s.resources.find((r) => r.id === resourceId));
  const fileId = resource?.kind === 'bitmap' ? resource.bitmap?.fileId : resource?.kind === 'svg' ? resource.svg?.fileId : undefined;
  const url = useBlobObjectUrl(fileId);
  if (!url) return null;
  const pct = `${Math.round(Math.max(0.01, Math.min(1, width ?? 1)) * 100)}%`;
  return (
    <img
      src={url}
      alt={resource?.altText ?? ''}
      style={{ display: 'inline-block', width: pct, maxWidth: '100%', verticalAlign: 'top', marginBottom: 2 }}
    />
  );
}

function TableBody({ resource }: TableBodyProps) {
  const labels = useSandboxLabels();
  // The table runs its own way (`table.direction`, else the document's),
  // as in the table editor, not the interface's.
  const rtlBook = useRightToLeftFlow();
  const direction = resource.table?.direction ?? (rtlBook ? 'rtl' : 'ltr');
  const model = resource.table?.model;
  if (!model || model.rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center gap-1.5 rounded text-xs"
        style={{ height: 80, backgroundColor: 'var(--surface)', color: 'var(--slate)' }}
      >
        <TableIcon size={16} aria-hidden="true" />
        {labels.resourcePreviewEmptyTable}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table dir={direction} style={{ borderCollapse: 'collapse', fontSize: 11 }}>
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
                      border: '1px solid #c8c8c8',
                      padding: '2px 5px',
                      // `left` / `right` are the cell's start and end (#371).
                      textAlign: cell.align === 'center' ? 'center' : cell.align === 'right' || cell.align === 'end' ? 'end' : 'start',
                      verticalAlign: cell.verticalAlign ?? 'top',
                      fontWeight: cell.isHeader ? 600 : 400,
                      color: PAPER_INK,
                      backgroundColor: cell.background?.hex,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {cell.image && <CellImage resourceId={cell.image.resourceId} width={cell.image.width} />}
                    {cell.image && cell.content && <br />}
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

/** The preview is set on paper: the page's white ground and dark ink, so
 *  a figure drawn for the printed page reads as it will there, whatever
 *  the panel's theme. */
const PAPER = '#ffffff';
const PAPER_INK = '#1f1f1f';
const PAPER_MUTED = '#5c5c5c';

/** Mock embed of a resource (visual payload + caption foot). */
export function ResourcePreview({ resource, type }: ResourcePreviewProps) {
  const labels = useSandboxLabels();
  const alt = resource.altText ?? '';
  return (
    <figure
      className="flex flex-col gap-3 rounded border p-3"
      style={{ borderColor: 'var(--rule)', backgroundColor: PAPER, color: PAPER_INK, margin: 0 }}
    >
      {resource.kind === 'bitmap' && resource.bitmap ? (
        <BitmapBody fileId={resource.bitmap.fileId} altText={alt} />
      ) : resource.kind === 'svg' && resource.svg ? (
        <SvgBody fileId={resource.svg.fileId} altText={alt} />
      ) : resource.kind === 'table' ? (
        <TableBody resource={resource} />
      ) : resource.kind === 'video' && resource.video?.poster ? (
        <VideoBody fileId={resource.video.poster.fileId} altText={alt} />
      ) : (
        <div
          className="flex items-center justify-center rounded text-xs"
          style={{ height: 80, backgroundColor: 'var(--surface)', color: 'var(--slate)' }}
        >
          {labels.resourcePreviewNoContent}
        </div>
      )}
      <CaptionFoot resource={resource} type={type} />
    </figure>
  );
}

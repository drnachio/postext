'use client';

import { useMemo, type RefObject } from 'react';
import { resolvePageTemplate, type PageTemplateSource, type PostextConfig, type ResolvedPageTemplate } from 'postext';
import type { SandboxLabels } from '../../types/labels.js';
import { Popover } from '../../ui/index.js';
import { templateIds, templateThumbnail, type TemplateThumbnail } from './templateThumbnail.js';

const THUMB_HEIGHT = 140;

/** A label with `code` spans set as code. */
function withCode(text: string) {
  return text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part));
}

/** A template's empty frames on its page, drawn small: the content area
 *  dashed, a box per frame (filled when it has a style), its name in it. */
export function TemplateThumbnailSvg({ thumb, height = THUMB_HEIGHT }: { thumb: TemplateThumbnail; height?: number }) {
  const scale = height / thumb.height;
  const width = Math.max(1, Math.round(thumb.width * scale));
  const label = Math.max(6, 9 / scale);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${thumb.width} ${thumb.height}`}
      aria-hidden="true"
      style={{ display: 'block', backgroundColor: '#ffffff', boxShadow: '0 1px 2px rgba(0,0,0,0.18)', borderRadius: 1 }}
    >
      <rect x={thumb.content.x} y={thumb.content.y} width={thumb.content.width} height={thumb.content.height} fill="none" stroke="#c9c4ba" strokeWidth={1 / scale} strokeDasharray={`${3 / scale} ${3 / scale}`} />
      {thumb.frames.map((f) => {
        const r = f.rect;
        if (r.width <= 0 || r.height <= 0) return null;
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        const fill = f.role === 'chained' ? '#efeae0' : f.styled ? '#dbe8f2' : '#f4f1ea';
        return (
          <g key={f.name} transform={f.rotate ? `rotate(${f.rotate} ${cx} ${cy})` : undefined}>
            <rect x={r.x} y={r.y} width={r.width} height={r.height} fill={fill} stroke="#7d8a96" strokeWidth={1 / scale} strokeDasharray={f.role === 'chained' ? `${2 / scale} ${2 / scale}` : undefined} />
            {r.height > label * 1.2 && r.width > label * 2 && (
              <text x={r.x + label * 0.4} y={r.y + label * 1.05} fontSize={label} fill="#4a5560" fontFamily="system-ui, sans-serif">
                {f.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<Element | null>;
  config: PostextConfig;
  labels: SandboxLabels;
  /** A template was chosen. */
  onPick: (template: ResolvedPageTemplate) => void;
}

/** The editor's «Composed page» picker (#864): every page template of the
 *  book as a card with its thumbnail, its name and its number of frames. */
export function TemplatePicker({ open, onOpenChange, anchor, config, labels, onPick }: TemplatePickerProps) {
  const cards = useMemo(() => {
    if (!open) return [];
    return templateIds(config).flatMap((id) => {
      const resolved = resolvePageTemplate(config as PageTemplateSource, id, { parity: 'recto' });
      const thumb = resolved ? templateThumbnail(config, id, resolved) : null;
      return resolved && thumb ? [{ id, resolved, thumb }] : [];
    });
  }, [open, config]);

  return (
    <Popover
      open={open}
      onOpenChange={(next, _reason, event) => {
        // A press on the button that opened it toggles it there.
        const target = event?.target as Node | null | undefined;
        if (!next && target && anchor.current?.contains(target)) return;
        onOpenChange(next);
      }}
      anchor={anchor} side="bottom" align="start" ariaLabel={labels.composedPagePicker} width={360}>
      <div className="flex flex-col gap-2 text-xs" style={{ color: 'var(--foreground)' }}>
        <div className="font-medium">{labels.composedPagePicker}</div>
        {cards.length === 0 ? (
          <p style={{ color: 'var(--slate)' }}>{labels.composedPageNoTemplates}</p>
        ) : (
          <>
            <p style={{ color: 'var(--slate)' }}>{withCode(labels.composedPagePickerHint)}</p>
            <ul className="grid grid-cols-2 gap-2" role="list">
              {cards.map(({ id, resolved, thumb }) => (
                <li key={id}>
                  <button
                    type="button"
                    data-template-id={id}
                    className="flex w-full cursor-pointer flex-col items-center gap-1 rounded border p-2 text-center hover:bg-(--surface) focus-visible:outline-2 focus-visible:outline-(--brand)"
                    style={{ borderColor: 'var(--rule)' }}
                    onClick={() => {
                      onPick(resolved);
                      onOpenChange(false);
                    }}
                  >
                    <TemplateThumbnailSvg thumb={thumb} />
                    <span className="font-medium">{thumb.name}</span>
                    {thumb.name !== id && <code className="text-[0.65rem]" style={{ color: 'var(--slate)' }}>{id}</code>}
                    <span className="text-[0.65rem]" style={{ color: 'var(--slate)' }}>
                      {labels.composedPageFrameCount.replace('__n__', String(resolved.frames.length))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Popover>
  );
}

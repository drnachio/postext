'use client';

import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useSandboxDocRef, useSandboxLabels, useSandboxSelector } from '../../../../context/SandboxContext.js';
import { FieldGroup } from '../../../../controls/index.js';
import { Button, IconButton, Select } from '../../../../ui/index.js';
import { pointersOf, removePointer, setPointer } from '../../../../templates/pointerEdits.js';
import { anchorsOfTemplateFrame } from '../../../../viewport/composed/labelAnchorGeometry.js';
import { usePageTemplates } from './model.js';

/**
 * The pointers of a frame (#1064): lines from the frame (a note) to an
 * anchor of the picture another frame holds (a map), the connectors C6
 * draws (`ConnectorEnd.anchor`). The keyboard's way to what the canvas does
 * with the frame's round grip: each pointer is listed with the frame and the
 * anchor it ends at, both changeable, and taken off with a button; a new one
 * is added from a frame and one of its picture's anchors (those of the laid
 * pages, else typed). Written on the template, as the frames are.
 */
export function FramePointers({ templateId, name, frames }: { templateId: string; name: string; frames: readonly string[] }) {
  const labels = useSandboxLabels();
  const uid = useId();
  const { templates, write } = usePageTemplates();
  const docRef = useSandboxDocRef();
  const resources = useSandboxSelector((s) => s.resources);
  const pointers = pointersOf(templates, templateId, name);
  const frameNames = frames.filter((n) => n !== name);
  const anchorsIn = (frame: string) => anchorsOfTemplateFrame(docRef.current, templateId, frame, (id) => resources?.find((r) => r.id === id)?.anchors).map((a) => a.anchorId);
  const [toFrame, setToFrame] = useState('');
  const [anchor, setAnchor] = useState('');
  // The first frame whose picture has anchors, unless one was picked.
  const target = toFrame || frameNames.find((f) => anchorsIn(f).length > 0) || frameNames[0] || '';
  const offered = target ? anchorsIn(target) : [];
  const chosen = anchor && offered.includes(anchor) ? anchor : (offered[0] ?? anchor);

  const change = (id: string | undefined, frame: string, at: string) => {
    const out = setPointer(templates, templateId, { from: name, toFrame: frame, anchor: at, ...(id ? { id } : {}) });
    if (out) write(out.templates);
  };

  return (
    <FieldGroup title={labels.pointersGroup} description={labels.pointersGroupDescription}>
      {pointers.length === 0 && <p className="m-0 mb-1.5 text-xs" style={{ color: 'var(--slate)' }}>{labels.pointersEmpty}</p>}
      <ul className="m-0 mb-2 flex list-none flex-col gap-1.5 p-0">
        {pointers.map((p) => {
          const anchors = anchorsIn(p.toFrame);
          const anchorOptions = [...new Set([p.anchor, ...anchors])].map((a) => ({ value: a, label: anchors.includes(a) ? a : labels.pointersAnchorMissing.replace('__anchor__', a) }));
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-1.5 text-xs" data-pointer={p.id}>
              <span className="text-(--slate)" aria-hidden="true">→</span>
              <Select
                value={p.toFrame}
                onValueChange={(f) => change(p.id, f, p.anchor)}
                options={[...new Set([p.toFrame, ...frameNames])].map((f) => ({ value: f, label: f }))}
                ariaLabel={labels.pointersFrameOf.replace('__id__', p.id)}
                size="sm"
                className="min-w-0 flex-1"
              />
              <Select
                value={p.anchor}
                onValueChange={(a) => change(p.id, p.toFrame, a)}
                options={anchorOptions}
                ariaLabel={labels.pointersAnchorOf.replace('__id__', p.id)}
                size="sm"
                className="min-w-0 flex-1"
              />
              <IconButton
                label={labels.pointersRemove.replace('__frame__', p.toFrame).replace('__anchor__', p.anchor)}
                icon={<Trash2 size={13} aria-hidden="true" />}
                destructive
                onClick={() => {
                  const next = removePointer(templates, templateId, p.id);
                  if (next) write(next);
                }}
              />
            </li>
          );
        })}
      </ul>
      {frameNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span id={`${uid}-to`} className="text-(--slate)">{labels.pointersTo}</span>
          <Select
            value={target}
            onValueChange={(f) => { setToFrame(f); setAnchor(''); }}
            options={frameNames.map((f) => ({ value: f, label: f }))}
            ariaLabelledBy={`${uid}-to`}
            size="sm"
            className="min-w-0 flex-1"
          />
          {offered.length > 0 ? (
            <Select
              value={chosen}
              onValueChange={setAnchor}
              options={offered.map((a) => ({ value: a, label: a }))}
              ariaLabel={labels.pointersAnchor}
              size="sm"
              className="min-w-0 flex-1"
            />
          ) : (
            <input
              type="text"
              dir="auto"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value.replace(/\s+/g, ''))}
              aria-label={labels.pointersAnchor}
              aria-describedby={`${uid}-none`}
              placeholder={labels.pointersAnchor}
              className="h-7 min-w-0 flex-1 rounded-md border bg-(--surface) px-2 font-mono text-xs text-(--foreground) outline-none focus:outline-2 focus:outline-offset-1 focus:outline-(--brand) pt-large:h-11"
              style={{ borderColor: 'var(--pt-control-border)' }}
            />
          )}
          <Button size="sm" icon={<Plus size={13} aria-hidden="true" />} disabled={!target || !chosen} onClick={() => change(undefined, target, chosen)}>
            {labels.pointersAdd}
          </Button>
          {offered.length === 0 && <p id={`${uid}-none`} className="m-0 w-full text-[11px]" style={{ color: 'var(--slate)' }}>{labels.pointersNoAnchors}</p>}
        </div>
      )}
      <p className="m-0 mt-1.5 text-[11px]" style={{ color: 'var(--slate)' }}>{labels.pointersCanvasHint}</p>
    </FieldGroup>
  );
}

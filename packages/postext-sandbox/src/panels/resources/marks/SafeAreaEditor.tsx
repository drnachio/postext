'use client';

import { useState, useMemo, useEffect } from 'react';
import { Crop, MapPin, MessageCircle } from 'lucide-react';
import type { Resource, LabelStyle } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { FieldRow } from '../../../controls/FieldRow.js';
import { Button } from '../../../ui/index.js';
import { useBlobObjectUrl } from '../ResourcePreview.js';
import { type PictureMarks, marksOf, normalizeMarks } from './pictureMarks.js';
import { labelsInChapters, anchorLabelState } from './figureLabels.js';
import { type AnchorEditorRequest, takeAnchorEditorRequest, onAnchorEditorRequest } from './anchorEditorRequest.js';
import { labelStyleColor } from './LabelAnchorsPanel.js';
import { lettered, NO_LABEL_STYLES, pct, boxStyle, AVOID_COLOR, BYSTANDER_COLOR, speakerColor } from './SafeAreaEditor/markStyles.js';
import { PictureMarksDialog } from './SafeAreaEditor/PictureMarksDialog.js';

// ---------------------------------------------------------------------------
// Safe area & lettering marks of a picture. The field sums them up over a
// thumbnail; the dialog draws them over the picture in three modes:
// - Safe area (`Resource.safeArea`, #442): the rectangle that always shows
//   (drag to draw, move or resize; arrows and Shift+arrows on the focused
//   rectangle; numeric fields), with the tallest and the shortest crop the
//   layout may use;
// - Anchors (`Resource.anchors`, #866): the points a map's or a diagram's
//   `::label` lines stand at, each with a name, a label style and the label
//   fields (alignment, rotation, width); the names the text uses that the
//   picture lacks are placed by clicking (see LabelAnchorsPanel);
// - Speakers (`Resource.anchors`, #557/#569): the mouth each balloon tail
//   points at, named by the speaker id the comic's script uses, with an
//   optional head point (thought balloons) and face rectangle;
// - Avoid zones (`Resource.avoid`): rectangles no balloon covers, and, in
//   the same mode, the faces of the people who do not speak
//   (`Resource.faces`, #726): rectangles no balloon covers at any
//   fallback. A switch on each row moves a rectangle between the two.
// Every mark is a focusable target (arrow keys move it, Delete removes it)
// and every pointer target is at least 44 px on touch screens.
// ---------------------------------------------------------------------------

export type Mode = 'safe' | 'labels' | 'speakers' | 'avoid';

interface SafeAreaFieldProps {
  resource: Resource;
  /** The new marks (safe area, speakers, avoid zones), normalised. */
  onChange: (marks: PictureMarks) => void;
}

/** The "Safe area & lettering" field of a bitmap or SVG resource, or the
 *  "Safe area" field of a video's poster (the engine crops a poster like a
 *  picture). */
export function SafeAreaField({ resource, onChange }: SafeAreaFieldProps) {
  const labels = useSandboxLabels();
  const fileId = resource.kind === 'bitmap'
    ? resource.bitmap?.fileId
    : resource.kind === 'video' ? resource.video?.poster?.fileId : resource.svg?.fileId;
  const url = useBlobObjectUrl(fileId);
  const marks = marksOf(resource);
  const area = marks.safeArea;
  const withLettering = lettered(resource);
  const [openIn, setOpenIn] = useState<Mode | null>(null);
  const [request, setRequest] = useState<AnchorEditorRequest | null>(null);
  const uiLocale = useSandboxSelector((s) => s.locale);
  const labelStyles = useSandboxSelector((s) => s.config?.labelStyles) ?? NO_LABEL_STYLES;
  // The book's labels of this picture (#866), the chapter on screen as typed.
  const chapters = useSandboxSelector((s) => s.chapters);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const liveMarkdown = useSandboxSelector((s) => s.markdown);
  const figureLabels = useMemo(
    () => (withLettering ? labelsInChapters((chapters ?? []).map((c) => ({ id: c.id, markdown: c.id === activeChapterId ? liveMarkdown : c.markdown })), resource.id) : []),
    [withLettering, chapters, activeChapterId, liveMarkdown, resource.id],
  );
  const labelState = useMemo(() => anchorLabelState(marks.anchors, figureLabels), [marks.anchors, figureLabels]);
  // A warning or a label on a page asks for this picture's anchors.
  useEffect(() => {
    const take = () => {
      // Taken once the picture is there to show (its blob URL may come a
      // moment after the field).
      if (!url || !withLettering) return;
      const r = takeAnchorEditorRequest(resource.id);
      if (!r) return;
      setRequest(r);
      setOpenIn('labels');
    };
    take();
    return onAnchorEditorRequest(take);
  }, [resource.id, url, withLettering]);
  const share = (v: number) => new Intl.NumberFormat(uiLocale, { maximumFractionDigits: 1 }).format(pct(v));
  const count = (n: number) => new Intl.NumberFormat(uiLocale).format(n);

  return (
    <FieldRow
      stacked
      label={withLettering ? labels.resourceMarksLabel : labels.resourceSafeAreaLabel}
      hint={withLettering ? labels.resourceMarksHint : labels.resourceSafeAreaHint}
      className="mb-0"
    >
      <div className="flex w-full min-w-0 flex-col gap-2">
        {url && (
          <div className="relative inline-block self-start overflow-hidden rounded" style={{ maxWidth: '100%' }}>
            <img src={url} alt="" className="block" style={{ maxWidth: '100%', maxHeight: 140 }} />
            {area && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{ ...boxStyle(area), boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)', outline: '2px solid var(--brand)' }}
              />
            )}
            {withLettering && <ThumbnailMarks marks={marks} labelStyles={labelStyles} />}
          </div>
        )}
        <span className="text-xs text-(--slate)">
          {area
            ? labels.resourceSafeAreaSummary.replace('__w__', share(area.width)).replace('__h__', share(area.height))
            : labels.resourceSafeAreaNone}
        </span>
        {withLettering && figureLabels.length > 0 && (
          <span className="text-xs text-(--slate)">
            {labels.resourceLabelAnchorsSummary
              .replace('__anchors__', count(marks.anchors.length))
              .replace('__waiting__', count(labelState.waiting.length))}
          </span>
        )}
        {withLettering && figureLabels.length === 0 && (marks.anchors.length > 0 || marks.avoid.length > 0 || marks.faces.length > 0) && (
          <span className="text-xs text-(--slate)">
            {labels.resourceMarksSummary
              .replace('__speakers__', count(marks.anchors.length))
              .replace('__zones__', count(marks.avoid.length))
              .replace('__faces__', count(marks.faces.length))}
          </span>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" icon={<Crop size={13} aria-hidden="true" />} disabled={!url} onClick={() => setOpenIn('safe')}>
            {area ? labels.resourceSafeAreaEdit : labels.resourceSafeAreaMark}
          </Button>
          {withLettering && (
            <Button size="sm" icon={<MapPin size={13} aria-hidden="true" />} disabled={!url} onClick={() => { setRequest(null); setOpenIn('labels'); }}>
              {labels.resourceLabelAnchorsEdit}
            </Button>
          )}
          {withLettering && (
            <Button size="sm" icon={<MessageCircle size={13} aria-hidden="true" />} disabled={!url} onClick={() => setOpenIn('speakers')}>
              {labels.resourceMarksEditLettering}
            </Button>
          )}
          {area && (
            <Button size="sm" variant="ghost" onClick={() => onChange(normalizeMarks({ ...marks, safeArea: undefined }))}>
              {labels.resourceSafeAreaRemove}
            </Button>
          )}
        </div>
      </div>
      {url && (
        <PictureMarksDialog
          open={openIn !== null}
          initialMode={openIn ?? 'safe'}
          url={url}
          resource={resource}
          withLettering={withLettering}
          labelStyles={labelStyles}
          figureLabels={figureLabels}
          request={request}
          onClose={() => setOpenIn(null)}
          onSave={(next) => {
            onChange(normalizeMarks(next));
            setOpenIn(null);
          }}
        />
      )}
    </FieldRow>
  );
}

/** Speakers (a dot at each mouth), avoid zones and bystanders' faces over
 *  the field's thumbnail, subtly: the dialog is where they are read and
 *  edited. */
function ThumbnailMarks({ marks, labelStyles }: { marks: PictureMarks; labelStyles: readonly LabelStyle[] }) {
  if (!marks.anchors.length && !marks.avoid.length && !marks.faces.length) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {marks.avoid.map((r, i) => (
        <div key={`a${i}`} className="absolute" style={{ ...boxStyle(r), border: `1px solid ${AVOID_COLOR}`, background: 'rgba(239, 68, 68, 0.18)' }} />
      ))}
      {marks.faces.map((r, i) => (
        <div key={`f${i}`} className="absolute" style={{ ...boxStyle(r), border: `1px solid ${BYSTANDER_COLOR}`, background: `${BYSTANDER_COLOR}2e` }} />
      ))}
      {marks.anchors.map((a, i) => (
        <span
          key={`s${i}`}
          className="absolute rounded-full"
          style={{
            left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: 7, height: 7, transform: 'translate(-50%, -50%)',
            background: a.style !== undefined ? labelStyleColor(a.style, labelStyles) : speakerColor(i), boxShadow: '0 0 0 1.5px #fff, 0 0 0 2.5px rgba(0, 0, 0, 0.5)',
          }}
        />
      ))}
    </div>
  );
}

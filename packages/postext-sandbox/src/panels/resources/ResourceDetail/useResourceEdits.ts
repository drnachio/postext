// The resource's id, edited locally and committed on blur, and the file
// replacements its upload fields make.
import { useState, useCallback } from 'react';
import { slugify } from '../slugify.js';
import type { BitmapUploadResult } from '../uploads/BitmapUploader.js';
import { bitmapReplaced, svgReplaced, svgSourceSaved } from '../resourceEdits.js';
import type { SvgUploadResult } from '../svg/SvgUploader.js';
import type { SvgSourceCommit } from '../svg/SvgSourceEditor.js';
import type { Resource } from 'postext';

/** What useResourceEdits takes from ResourceDetail. */
export interface UseResourceEditsDeps {
  resource: Resource;
  otherIds: Set<string>;
  onChange: (next: Resource) => void;
  onRename: (oldId: string, next: Resource) => void;
  touch: (partial: Partial<Resource>) => Resource;
}

export function useResourceEdits(deps: UseResourceEditsDeps) {
  const {
    resource, otherIds, onChange, onRename, touch
  } = deps;
  // The id is edited locally and committed (renamed) on blur / Enter so the
  // detail pane is not remounted on every keystroke.
  const [idDraft, setIdDraft] = useState(resource.id);
  const draftSlug = slugify(idDraft);
  const idTaken = draftSlug.length > 0 && otherIds.has(draftSlug);
  const idEmpty = draftSlug.length === 0;
  const suggestedId = slugify(resource.caption ?? '') || `resource-${resource.kind}`;

  const commitId = () => {
    const next = draftSlug || suggestedId;
    setIdDraft(next);
    if (next === resource.id) return;
    if (otherIds.has(next)) return; // keep editing; collision not committed
    onRename(resource.id, { ...resource, id: next, updatedAt: Date.now() });
  };

  const applyBitmap = (r: BitmapUploadResult) => {
    onChange(touch(bitmapReplaced(resource, r)));
  };

  const applySvg = (r: SvgUploadResult) => {
    onChange(touch(svgReplaced(resource, r)));
  };

  const applyPdfMaster = (pdfFileId: string | undefined) => {
    if (!resource.svg) return;
    onChange(touch({ svg: { ...resource.svg, pdfFileId } }));
  };

  // A source edit saved as a new blob (see `svgSourceSaved`).
  const applySvgSource = useCallback(
    (c: SvgSourceCommit) => {
      onChange(touch(svgSourceSaved(resource, c)));
    },
    // `touch` closes over `resource`, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, resource],
  );
  return {
    idDraft, setIdDraft, idTaken, idEmpty, suggestedId, commitId, applyBitmap, applySvg,
    applyPdfMaster, applySvgSource
  };
}

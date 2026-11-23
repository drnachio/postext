'use client';

// A text box's name (#1669): the slot the cover's text fills it by.
// Renamed (on Enter, or on leaving the field), the box and its frames in
// the cover's Markdown move together; a name a panel or another item has
// is refused.

import { useEffect, useId, useState } from 'react';
import type { CoverTextFrame, ProductionSheet } from 'postext/production';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { FieldRow, TextControl } from '../../controls/index.js';
import { renameCoverSlot } from '../coverText.js';
import { setCoverDesigner } from '../coverStore.js';
import { useEditedDesign } from '../useEditedDesign.js';
import { patchItem, renameTextBoxRefs, usedIds } from './designerModel.js';

const NAME = /^[A-Za-z0-9_-]+$/;

export function TextBoxName({ name, sheet }: { name: string; sheet: ProductionSheet }) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const { design: cover, write } = useEditedDesign();
  const markdown = useSandboxSelector((s) => s.coverMarkdown);
  const [draft, setDraft] = useState(name);
  // An undo, or the box renamed elsewhere, replaces the draft.
  useEffect(() => setDraft(name), [name]);
  const errorId = useId();

  const problem = (text: string) => {
    const next = text.trim();
    if (next === name) return null;
    if (!NAME.test(next)) return labels.coverTextBoxNameInvalid;
    return usedIds(cover).has(next) || sheet.zones.some((z) => z.name === next) ? labels.coverTextBoxNameTaken : null;
  };
  const shown = problem(draft);
  const commit = () => {
    const next = draft.trim();
    if (next === name || problem(next)) return;
    const renamed: Partial<CoverTextFrame> = { name: next };
    write(renameTextBoxRefs(patchItem(cover, { layer: 'textBoxes', id: name }, renamed), name, next));
    dispatch({ type: 'SET_COVER_MARKDOWN', payload: renameCoverSlot(markdown, name, next) });
    setCoverDesigner({ selected: { layer: 'textBoxes', id: next } });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); commit(); }}>
      <FieldRow
        stacked
        label={labels.coverTextBoxName}
        tooltip={labels.coverTextBoxNameTooltip}
        hint={shown ? <span id={errorId} role="alert" className="text-(--destructive)">{shown}</span> : undefined}
      >
        <TextControl value={draft} onChange={setDraft} onBlur={commit} />
      </FieldRow>
    </form>
  );
}

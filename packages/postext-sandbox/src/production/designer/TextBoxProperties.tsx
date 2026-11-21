'use client';

/**
 * A text box selected in the cover designer: its words, whether it shows,
 * how it sits and turns, and the type of each of its roles.
 */

import { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Trash2 } from 'lucide-react';
import { IconButton, SegmentedControl, Select, Switch } from '../../ui/index.js';
import { fill } from '../../print/fillTokens.js';
import { RoleFields } from '../CoverDesignSections.js';
import { COVER_FIELDS, TEXT_BOX_ROLES, fieldsIn, type CoverField, type CoverTextBox, type CoverTexts, type TextBoxRole } from '../model/coverTexts.js';
import type { Labels } from '../productionUi.js';
import { fieldLabel, fieldsShown, fieldsStored, ROLE_LABEL } from './designerLabels.js';
import { NameField } from './ItemProperties.js';


/** A text box: its words (Markdown, the general texts by their names),
 *  whether it shows, how it sits and turns, and the type of each of its
 *  roles. */
export function TextBoxProperties({ box, zone, fields, families, labels, canForward, canBackward, onChange, onRestack, onDelete, onDuplicate }: {
  box: CoverTextBox;
  zone: string;
  fields: CoverTexts;
  families: string[];
  labels: Labels;
  canForward: boolean;
  canBackward: boolean;
  onChange: (box: CoverTextBox) => void;
  onRestack: (step: 1 | -1) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [role, setRole] = useState<TextBoxRole>(() => (/^#\s/.test(box.text.trim()) ? 'h1' : 'text'));
  const [draft, setDraft] = useState(() => fieldsShown(box.text, labels));
  const set = (patch: Partial<CoverTextBox>, drop: (keyof CoverTextBox)[] = []) => {
    const next = { ...box, ...patch };
    for (const k of drop) delete next[k];
    onChange(next);
  };
  const empty = COVER_FIELDS.filter((f) => fieldsIn(box.text).includes(f) && !fields[f]?.trim());
  return (
    <>
      <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-(--slate)">{labels.coverTextBox}</h3>
      <NameField value={box.name} label={labels.productionGalleryName} onChange={(name) => (name ? set({ name }) : set({}, ['name']))} />
      <p className="m-0 text-(--slate)">{fill(labels.coverElementZone, { zone })}</p>
      <label className="flex flex-col gap-1">
        {labels.coverTextBoxText}
        <textarea
          value={draft}
          rows={5}
          onChange={(e) => { setDraft(e.target.value); set({ text: fieldsStored(e.target.value, labels) }); }}
          className="rounded border border-(--pt-control-border) bg-(--background) px-2 py-1 font-mono text-xs text-(--foreground)"
        />
      </label>
      <Select
        size="sm"
        value=""
        onValueChange={(f) => {
          if (!f) return;
          const shown = `${draft.trim() ? `${draft.trimEnd()}\n\n` : ''}{{${fieldLabel(labels, f as CoverField)}}}`;
          setDraft(shown);
          set({ text: fieldsStored(shown, labels) });
        }}
        options={[{ value: '', label: labels.coverTextBoxInsert }, ...COVER_FIELDS.map((f) => ({ value: f, label: fieldLabel(labels, f) }))]}
        ariaLabel={labels.coverTextBoxInsert}
      />
      <p className="m-0 text-(--slate)">{labels.coverTextBoxHint}</p>
      {empty.length > 0 && <p className="m-0">{fill(labels.coverTextBoxEmptyFields, { fields: empty.map((f) => fieldLabel(labels, f)).join(', ') })}</p>}
      <label className="flex items-center justify-between gap-2">
        <span>{labels.coverTextBoxHidden}</span>
        <Switch checked={!!box.hidden} onCheckedChange={(on) => (on ? set({ hidden: true }) : set({}, ['hidden']))} ariaLabel={labels.coverTextBoxHidden} />
      </label>
      <div className="flex flex-col gap-1">
        {labels.productionStyleVertical}
        <SegmentedControl
          size="sm"
          value={box.vertical ?? 'top'}
          onValueChange={(v) => (v === 'top' ? set({}, ['vertical']) : set({ vertical: v }))}
          options={[
            { value: 'top', label: labels.productionVerticalTop },
            { value: 'middle', label: labels.productionVerticalMiddle },
            { value: 'bottom', label: labels.productionVerticalBottom },
          ]}
          ariaLabel={labels.productionStyleVertical}
        />
      </div>
      <div className="flex flex-col gap-1">
        {labels.coverTextBoxTurn}
        <SegmentedControl
          size="sm"
          value={box.rotate === -90 ? 'up' : box.rotate === 90 ? 'down' : 'none'}
          onValueChange={(v) => (v === 'none' ? set({}, ['rotate']) : set({ rotate: v === 'up' ? -90 : 90 }))}
          options={[
            { value: 'none', label: labels.coverTextBoxTurnNone },
            { value: 'up', label: labels.coverTextBoxTurnUp },
            { value: 'down', label: labels.coverTextBoxTurnDown },
          ]}
          ariaLabel={labels.coverTextBoxTurn}
        />
      </div>
      <div className="flex flex-col gap-1">
        {labels.coverTextBoxStyleOf}
        <SegmentedControl
          size="sm"
          value={role}
          onValueChange={setRole}
          options={TEXT_BOX_ROLES.map((r) => ({ value: r, label: String(labels[ROLE_LABEL[r]]) }))}
          ariaLabel={labels.coverTextBoxStyleOf}
        />
      </div>
      <RoleFields
        key={role}
        legend={String(labels[ROLE_LABEL[role]])}
        style={box.styles?.[role] ?? {}}
        families={families}
        labels={labels}
        more
        onChange={(st) => {
          const styles = { ...box.styles };
          if (Object.keys(st).length) styles[role] = st;
          else delete styles[role];
          if (Object.keys(styles).length) set({ styles });
          else set({}, ['styles']);
        }}
      />
      <div className="flex items-center gap-1">
        <IconButton label={labels.coverElementForward} icon={<ArrowUp size={14} aria-hidden="true" />} disabled={!canForward} onClick={() => onRestack(1)} />
        <IconButton label={labels.coverElementBackward} icon={<ArrowDown size={14} aria-hidden="true" />} disabled={!canBackward} onClick={() => onRestack(-1)} />
        <IconButton label={labels.coverElementDuplicate} icon={<Copy size={14} aria-hidden="true" />} onClick={onDuplicate} />
        <IconButton label={labels.coverElementDelete} icon={<Trash2 size={14} aria-hidden="true" />} onClick={onDelete} />
      </div>
    </>
  );
}

'use client';

import { useId, useMemo, useState } from 'react';
import { useSandboxLabels, useSandboxSelector } from '../../../../context/SandboxContext.js';
import { FieldRow, SelectInput, useFieldIds } from '../../../../controls/index.js';
import { cn } from '../../../../ui/cn.js';
import { fenceAttributeName, pageFenceAttributes } from '../../../../templates/templateUsage.js';

/** The choice that opens the box for an attribute no fence writes yet
 *  (#1095): it holds a space, so no attribute name can be it. */
const OTHER = ' other';

/** The page-fence condition of a design element (#1087). */
export interface FenceCondition {
  when?: string;
  unless?: string;
}

/** The attributes the book's page fences set, the open chapter as it is
 *  being written. */
export function useFenceAttributes(): string[] {
  const chapters = useSandboxSelector((s) => s.chapters);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const markdown = useSandboxSelector((s) => s.markdown) ?? '';
  return useMemo(
    () => pageFenceAttributes(chapters && chapters.length > 0
      ? chapters.map((c) => ({ markdown: c.id === activeChapterId ? markdown : c.markdown }))
      : [{ markdown }]),
    [chapters, activeChapterId, markdown],
  );
}

/** «Drawn when the page says» / «Not drawn when the page says»: a running
 *  head's or a composed page's decoration element drawn only on the pages
 *  whose `::::page` fence sets an attribute, or left out there. The choices
 *  are the attributes the book's fences use; a value no fence sets stays
 *  listed so it can be seen and cleared. «Another attribute…» (#1095) opens
 *  a box for one no fence writes yet, taken when it is a name a fence can
 *  write. */
export function FenceConditionFields<T extends FenceCondition>({ raw, attributes, onChange }: { raw: T; attributes: readonly string[]; onChange: (next: T) => void }) {
  const labels = useSandboxLabels();
  const set = (key: 'when' | 'unless', value: string | undefined) => {
    const next = { ...raw };
    if (value === undefined || value === '') delete next[key];
    else next[key] = value as T[typeof key];
    onChange(next);
  };
  return (
    <>
      <FenceConditionField
        label={labels.headerFooterElementWhen}
        tooltip={labels.headerFooterElementWhenTooltip}
        value={raw.when}
        attributes={attributes}
        onChange={(v) => set('when', v)}
      />
      <FenceConditionField
        label={labels.headerFooterElementUnless}
        tooltip={labels.headerFooterElementUnlessTooltip}
        value={raw.unless}
        attributes={attributes}
        onChange={(v) => set('unless', v)}
      />
    </>
  );
}

function FenceConditionField({ label, tooltip, value, attributes, onChange }: { label: string; tooltip: string; value: string | undefined; attributes: readonly string[]; onChange: (v: string | undefined) => void }) {
  const labels = useSandboxLabels();
  const [typing, setTyping] = useState(false);
  const listed = [...attributes, ...(value && !attributes.includes(value) ? [value] : [])];
  const options = [
    { value: '', label: labels.headerFooterElementFenceAny },
    ...listed.map((a) => ({ value: a, label: a })),
    { value: OTHER, label: labels.headerFooterElementFenceOther },
  ];
  return (
    <>
      <SelectInput
        label={label}
        value={typing ? OTHER : value ?? ''}
        options={options}
        onChange={(v) => {
          if (v === OTHER) {
            setTyping(true);
            return;
          }
          setTyping(false);
          onChange(v === '' ? undefined : v);
        }}
        tooltip={tooltip}
        isDefault={value === undefined}
        onReset={() => {
          setTyping(false);
          onChange(undefined);
        }}
      />
      {typing && (
        <FenceAttributeEntry
          onCommit={(name) => {
            setTyping(false);
            onChange(name);
          }}
          onCancel={() => setTyping(false)}
        />
      )}
    </>
  );
}

/** The box for an attribute no fence writes yet (#1095): taken on Enter
 *  or when the box is left, when it is a name a `::::page` line can write;
 *  else it says why and keeps the text. Escape, or leaving it empty, gives
 *  up. */
function FenceAttributeEntry({ onCommit, onCancel }: { onCommit: (name: string) => void; onCancel: () => void }) {
  const labels = useSandboxLabels();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const commit = (): void => {
    const read = fenceAttributeName(draft);
    if (read.ok) {
      onCommit(read.name);
      return;
    }
    if (read.reason === 'empty') {
      onCancel();
      return;
    }
    setError(read.reason === 'reserved' ? labels.headerFooterElementFenceNameReserved : labels.headerFooterElementFenceNameInvalid);
  };
  return (
    <FieldRow label={labels.headerFooterElementFenceName} tooltip={labels.headerFooterElementFenceNameTooltip} stacked isDefault>
      <AttributeInput
        value={draft}
        error={error}
        onChange={(v) => {
          setDraft(v);
          setError(null);
        }}
        onCommit={commit}
        onCancel={onCancel}
      />
    </FieldRow>
  );
}

function AttributeInput({ value, error, onChange, onCommit, onCancel }: { value: string; error: string | null; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void }) {
  const ids = useFieldIds();
  const errorId = useId();
  const describedBy = [ids?.descriptionId, error ? errorId : undefined].filter(Boolean).join(' ');
  return (
    <div className="flex w-full flex-col gap-1">
      <input
        type="text"
        dir="ltr"
        // Opened by the reader's own choice in the list just above: the
        // caret goes to the box.
        autoFocus
        spellCheck={false}
        autoComplete="off"
        id={ids?.controlId}
        aria-labelledby={ids?.labelId}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        className={cn(
          'h-7 pt-large:h-11 w-full rounded-md border bg-(--surface) px-2 font-mono text-xs text-(--foreground) outline-none',
          'hover:border-(--slate) focus:border-(--brand) focus:outline-2 focus:outline-offset-1 focus:outline-(--brand)',
          error ? 'border-(--destructive)' : 'border-(--pt-control-border)',
        )}
      />
      {error && (
        <p id={errorId} role="alert" className="m-0 text-xs" style={{ color: 'var(--destructive)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

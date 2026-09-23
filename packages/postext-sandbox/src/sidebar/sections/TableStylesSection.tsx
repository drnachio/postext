'use client';

import { memo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { NamedTableStyleConfig, ResolvedTableStyleConfig, TableStyleConfig } from 'postext';
import { resolveBodyTextConfig, resolveTableStylesConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxResources, useSandboxSelector } from '../../context/SandboxContext';
import { CollapsibleSection } from '../../controls';
import { Button, ConfirmPopover, IconButton } from '../../ui';
import { FieldRow } from '../../controls/FieldRow';
import { SearchScope } from '../search/SearchScope';
import { TableStyleFields } from './TableStyleSection';

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--rule)', color: 'var(--foreground)' } as const;

/** Turn free text into a style id (lowercase, dashes). */
function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nextStyleId(existing: NamedTableStyleConfig[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (taken.has(`table-${n}`)) n++;
  return `table-${n}`;
}

interface TableStyleCardProps {
  style: NamedTableStyleConfig;
  resolved: ResolvedTableStyleConfig;
  otherIds: Set<string>;
  onChange: (partial: Partial<NamedTableStyleConfig>) => void;
  onResetField: (field: keyof TableStyleConfig) => void;
  onRename: (nextId: string) => void;
  onRemove: () => void;
}

/** One named table style: id (renamed on blur / Enter, never to a colliding
 *  id), display name, and the table style controls, each showing the value
 *  it inherits from the document's table style until set. */
function TableStyleCard({ style, resolved, otherIds, onChange, onResetField, onRename, onRemove }: TableStyleCardProps) {
  const labels = useSandboxLabels();
  const [idDraft, setIdDraft] = useState(style.id);
  const draftSlug = slugifyStyleId(idDraft);
  const idTaken = draftSlug.length > 0 && draftSlug !== style.id && otherIds.has(draftSlug);
  const idEmpty = draftSlug.length === 0;

  const commitId = () => {
    if (idEmpty || idTaken) {
      setIdDraft(style.id);
      return;
    }
    setIdDraft(draftSlug);
    if (draftSlug !== style.id) onRename(draftSlug);
  };

  return (
    <SearchScope title={`${style.name ?? ''} ${style.id}`} overridden>
    <div className="mb-3 rounded border p-2" style={{ borderColor: 'var(--rule)' }}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="truncate text-xs font-medium" style={{ color: 'var(--foreground)' }} title={style.name ?? style.id}>
          {style.name || style.id}
        </span>
        <ConfirmPopover message={labels.tableStyleDeleteConfirm} onConfirm={onRemove}>
          {({ open }) => (
            <IconButton label={labels.tableStyleDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
          )}
        </ConfirmPopover>
      </div>

      <div className="mb-2 flex flex-col gap-2">
        <FieldRow stacked label={labels.idLabel} hint={idTaken ? labels.tableStyleIdHintDuplicate : labels.tableStyleUsageHint} className="mb-0">
          <input
            type="text"
            value={idDraft}
            onChange={(e) => setIdDraft(e.target.value)}
            onBlur={commitId}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-label={labels.tableStyleIdAria}
            className={inputClass}
            style={{ ...inputStyle, borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--rule)' }}
          />
        </FieldRow>
        <FieldRow stacked label={labels.tableStyleNameLabel} className="mb-0">
          <input
            type="text"
            value={style.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value.length > 0 ? e.target.value : undefined })}
            aria-label={labels.tableStyleNameAria}
            placeholder={style.id}
            className={inputClass}
            style={inputStyle}
          />
        </FieldRow>
      </div>

      <TableStyleFields
        raw={style}
        resolved={resolved}
        onChange={onChange}
        onResetField={onResetField}
        sectionIdPrefix={`tableStyles.${style.id}`}
        fieldIdPrefix={`tableStyles-${style.id}`}
      />
    </div>
    </SearchScope>
  );
}

/** Config-panel section for the named table styles a table resource picks
 *  with `table.styleId` (`config.tableStyles`). Each style inherits every
 *  field it leaves unset from the document's table style. */
export const TableStylesSection = memo(function TableStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const resources = useSandboxResources();
  const raw = useSandboxSelector((s) => s.config.tableStyles);
  const base = useSandboxSelector((s) => s.config.tableStyle);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const docLocale = useSandboxSelector((s) => s.config.locale ?? s.config.bodyText?.hyphenation?.locale ?? s.locale);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const styles: NamedTableStyleConfig[] = raw ?? [];
  const resolved = resolveTableStylesConfig(styles, base, bodyText, docLocale);

  const write = (next: NamedTableStyleConfig[]) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { tableStyles: next.length > 0 ? next : undefined } });
  };

  const addStyle = () => {
    write([...styles, { id: nextStyleId(styles), name: labels.tableStyleNewName }]);
  };

  const updateStyle = (id: string, partial: Partial<NamedTableStyleConfig>) => {
    write(styles.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  };

  const resetStyleField = (id: string, field: keyof TableStyleConfig) => {
    write(
      styles.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s };
        delete next[field];
        return next;
      }),
    );
  };

  // A rename carries the tables that use the style along with it.
  const renameStyle = (id: string, nextId: string) => {
    if (styles.some((s) => s.id === nextId)) return;
    write(styles.map((s) => (s.id === id ? { ...s, id: nextId } : s)));
    for (const r of resources) {
      if (r.table?.styleId !== id) continue;
      dispatch({ type: 'UPSERT_RESOURCE', payload: { ...r, table: { ...r.table, styleId: nextId }, updatedAt: Date.now() } });
    }
  };

  const removeStyle = (id: string) => {
    write(styles.filter((s) => s.id !== id));
  };

  return (
    <CollapsibleSection
      title={labels.tableStylesSection}
      sectionId="tableStyles"
      hasOverrides={styles.length > 0}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { tableStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.tableStylesResetConfirm}
    >
      {styles.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.tableStylesEmpty}
        </p>
      )}
      {styles.map((style, i) => (
        <TableStyleCard
          key={style.id}
          style={style}
          resolved={resolved[i]!}
          otherIds={new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id))}
          onChange={(partial) => updateStyle(style.id, partial)}
          onResetField={(field) => resetStyleField(style.id, field)}
          onRename={(nextId) => renameStyle(style.id, nextId)}
          onRemove={() => removeStyle(style.id)}
        />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addStyle} className="mt-1">
        {labels.tableStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});

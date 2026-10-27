'use client';

import { memo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { NamedScoreStyleConfig, ResolvedScoreStyleConfig, ScoreStyleConfig } from 'postext';
import { resolveBodyTextConfig, resolveScoreStylesConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxResources, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, ItemCard, ItemCardListActions, moveCardState, openCard } from '../../../controls/index.js';
import { Button, ConfirmPopover, IconButton } from '../../../ui/index.js';
import { FieldRow } from '../../../controls/FieldRow.js';
import { SearchScope } from '../../search/SearchScope.js';
import { ScoreStyleFields } from './ScoreStyleSection.js';

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;

/** Turn free text into a style id (lowercase, dashes). */
function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nextStyleId(existing: NamedScoreStyleConfig[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (taken.has(`score-${n}`)) n++;
  return `score-${n}`;
}

interface ScoreStyleCardProps {
  style: NamedScoreStyleConfig;
  resolved: ResolvedScoreStyleConfig;
  otherIds: Set<string>;
  onChange: (partial: Partial<NamedScoreStyleConfig>) => void;
  onResetField: (field: keyof ScoreStyleConfig) => void;
  onRename: (nextId: string) => void;
  onRemove: () => void;
}

/** One named score style: id (renamed on blur / Enter, never to a colliding
 *  id), display name, and the score style controls, each showing the value
 *  it inherits from the document's score style until set. */
function ScoreStyleCard({ style, resolved, otherIds, onChange, onResetField, onRename, onRemove }: ScoreStyleCardProps) {
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
    <ItemCard
      list="scoreStyles"
      id={style.id}
      styleId={style.id}
      title={style.name || style.id}
      subtitle={style.name && style.name !== style.id ? style.id : undefined}
      actions={
        <ConfirmPopover message={labels.scoreStyleDeleteConfirm} onConfirm={onRemove}>
          {({ open }) => (
            <IconButton label={labels.scoreStyleDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
          )}
        </ConfirmPopover>
      }
    >

      <div className="mb-2 flex flex-col gap-2">
        <FieldRow stacked label={labels.idLabel} tooltip={labels.styleIdHelp} hint={idTaken ? labels.scoreStyleIdHintDuplicate : labels.scoreStyleUsageHint} className="mb-0">
          <input
            dir="ltr"
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
            aria-label={labels.scoreStyleIdAria}
            className={inputClass}
            style={{ ...inputStyle, borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--rule)' }}
          />
        </FieldRow>
        <FieldRow stacked label={labels.scoreStyleNameLabel} tooltip={labels.styleNameHelp} className="mb-0">
          <input
            dir="auto"
            type="text"
            value={style.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value.length > 0 ? e.target.value : undefined })}
            aria-label={labels.scoreStyleNameAria}
            placeholder={style.id}
            className={inputClass}
            style={inputStyle}
          />
        </FieldRow>
      </div>

      <ScoreStyleFields
        raw={style}
        resolved={resolved}
        onChange={onChange}
        onResetField={onResetField}
        fieldIdPrefix={`scoreStyles-${style.id}`}
      />
    </ItemCard>
    </SearchScope>
  );
}

/** Config-panel section for the named score styles (#1173) a score picks
 *  with its fence's `style` or `score.styleId` (`config.scoreStyles`). Each
 *  style inherits every field it leaves unset from the document's score
 *  style. */
export const ScoreStylesSection = memo(function ScoreStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const resources = useSandboxResources();
  const raw = useSandboxSelector((s) => s.config.scoreStyles);
  const base = useSandboxSelector((s) => s.config.scoreStyle);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const styles: NamedScoreStyleConfig[] = raw ?? [];
  const resolved = resolveScoreStylesConfig(styles, base, bodyText);

  const write = (next: NamedScoreStyleConfig[]) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { scoreStyles: next.length > 0 ? next : undefined } });
  };

  const addStyle = () => {
    const id = nextStyleId(styles);
    openCard('scoreStyles', id);
    write([...styles, { id, name: labels.scoreStyleNewName }]);
  };

  const updateStyle = (id: string, partial: Partial<NamedScoreStyleConfig>) => {
    write(styles.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  };

  const resetStyleField = (id: string, field: keyof ScoreStyleConfig) => {
    write(
      styles.map((s) => {
        if (s.id !== id) return s;
        const next: ScoreStyleConfig & NamedScoreStyleConfig = { ...s };
        delete next[field];
        return next;
      }),
    );
  };

  // A rename carries the scores that use the style along with it.
  const renameStyle = (id: string, nextId: string) => {
    if (styles.some((s) => s.id === nextId)) return;
    moveCardState('scoreStyles', id, nextId);
    write(styles.map((s) => (s.id === id ? { ...s, id: nextId } : s)));
    for (const r of resources) {
      if (r.score?.styleId !== id) continue;
      dispatch({ type: 'UPSERT_RESOURCE', payload: { ...r, score: { ...r.score, styleId: nextId }, updatedAt: Date.now() } });
    }
  };

  const removeStyle = (id: string) => {
    write(styles.filter((s) => s.id !== id));
  };

  return (
    <CollapsibleSection
      title={labels.scoreStylesSection}
      sectionId="scoreStyles"
      hasOverrides={styles.length > 0}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { scoreStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.scoreStylesResetConfirm}
    >
      {styles.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.scoreStylesEmpty}
        </p>
      )}
      <ItemCardListActions list="scoreStyles" ids={styles.map((s) => s.id)} />
      {styles.map((style, i) => (
        <ScoreStyleCard
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
        {labels.scoreStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});

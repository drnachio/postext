'use client';

import { memo, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ColorValue, Dimension, FrameLookEntry } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, ColorPicker, DimensionInput, FieldGroup, ItemCard, ItemCardListActions, moveCardState, openCard } from '../../../controls/index.js';
import { FieldRow } from '../../../controls/FieldRow.js';
import { Button, ConfirmPopover, IconButton } from '../../../ui/index.js';
import { applyViewerEdit } from '../../../editor/viewerEdits.js';
import { useBookTexts } from '../../../frameStyles/useBookTexts.js';
import { lookUsage, renameLookChanges } from '../../../templates/frameLooks.js';
import { SearchScope } from '../../search/SearchScope.js';
import type { SandboxLabels } from '../../../types/labels.js';

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;
const LIST = 'frameLooks';
/** A colour the look leaves unset: shown as no colour. */
const UNSET: ColorValue = { hex: '', model: 'hex' };

/** Turn free text into a look id (lowercase, dashes). */
export function slugifyLookId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

export function nextLookId(existing: readonly FrameLookEntry[]): string {
  const taken = new Set(existing.map((l) => l.id));
  let n = existing.length + 1;
  while (taken.has(`look-${n}`)) n++;
  return `look-${n}`;
}

/** The value at a path of a look. */
function lookAt(look: FrameLookEntry, path: readonly string[]): unknown {
  return path.reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), look);
}

/** `look` with the value at `path` set, or taken off (empty objects go
 *  with their last value). */
export function lookWith(look: FrameLookEntry, path: readonly string[], value: unknown): FrameLookEntry {
  const next = structuredClone(look) as unknown as Record<string, unknown>;
  const parents: Record<string, unknown>[] = [next];
  for (const key of path.slice(0, -1)) {
    const here = parents[parents.length - 1]!;
    if (value === undefined && !here[key]) return look;
    here[key] = (here[key] as Record<string, unknown> | undefined) ?? {};
    parents.push(here[key] as Record<string, unknown>);
  }
  const last = path[path.length - 1]!;
  if (value === undefined) delete parents[parents.length - 1]![last];
  else parents[parents.length - 1]![last] = value;
  for (let i = parents.length - 1; i > 0; i--) if (Object.keys(parents[i]!).length === 0) delete parents[i - 1]![path[i - 1]!];
  return next as unknown as FrameLookEntry;
}

/** The colours a look may set, grouped as the box draws them. */
function colourFields(labels: SandboxLabels): { title: string; fields: { path: string[]; label: string }[] }[] {
  return [
    {
      title: labels.frameLookGroupBox,
      fields: [
        { path: ['background'], label: labels.pageTemplatesLookBackground },
        { path: ['border', 'color'], label: labels.pageTemplatesLookBorder },
        { path: ['stripe', 'color'], label: labels.frameLookStripe },
      ],
    },
    {
      title: labels.frameLookGroupText,
      fields: [
        { path: ['body', 'color'], label: labels.pageTemplatesLookText },
        { path: ['body', 'boldColor'], label: labels.frameLookBold },
        { path: ['body', 'italicColor'], label: labels.frameLookItalic },
        { path: ['titleStyle', 'color'], label: labels.frameLookTitle },
      ],
    },
    {
      title: labels.frameLookGroupTab,
      fields: [
        { path: ['label', 'background'], label: labels.pageTemplatesLookTab },
        { path: ['label', 'color'], label: labels.pageTemplatesLookTabText },
        { path: ['label', 'rule', 'color'], label: labels.frameLookTabRule },
        { path: ['icon', 'color'], label: labels.frameLookIcon },
        { path: ['marker', 'color'], label: labels.frameLookMarker },
        { path: ['marker', 'rule', 'color'], label: labels.frameLookMarkerRule },
      ],
    },
  ];
}

/** A small sample of the look: its fill, border and text colour. */
function LookSwatch({ look }: { look: FrameLookEntry }) {
  const hex = (path: string[]) => (lookAt(look, path) as ColorValue | undefined)?.hex;
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-5 w-8 shrink-0 items-center justify-center rounded text-[0.6rem] font-semibold"
      style={{
        backgroundColor: hex(['background']) ?? 'transparent',
        border: `2px solid ${hex(['border', 'color']) ?? 'var(--rule)'}`,
        color: hex(['body', 'color']) ?? 'var(--foreground)',
      }}
    >
      Aa
    </span>
  );
}

interface FrameLookCardProps {
  look: FrameLookEntry;
  uses: number;
  otherIds: ReadonlySet<string>;
  onChange: (next: FrameLookEntry) => void;
  onRename: (nextId: string) => void;
  onRemove: () => void;
}

/** One named look: id (renamed on blur or Enter, never onto another
 *  look's; the pieces that name it follow), name, and every colour it may
 *  set, unset until written. */
function FrameLookCard({ look, uses, otherIds, onChange, onRename, onRemove }: FrameLookCardProps) {
  const labels = useSandboxLabels();
  const [idDraft, setIdDraft] = useState(look.id);
  const draftSlug = slugifyLookId(idDraft);
  const idTaken = draftSlug.length > 0 && draftSlug !== look.id && otherIds.has(draftSlug);
  const idEmpty = draftSlug.length === 0;
  const commitId = () => {
    if (idEmpty || idTaken) {
      setIdDraft(look.id);
      return;
    }
    setIdDraft(draftSlug);
    if (draftSlug !== look.id) onRename(draftSlug);
  };
  const tracking = lookAt(look, ['body', 'letterSpacing']) as Dimension | undefined;
  return (
    <SearchScope title={`${look.name ?? ''} ${look.id}`} overridden>
      <ItemCard
        list={LIST}
        id={look.id}
        styleId={look.id}
        title={look.name || look.id}
        subtitle={`${look.name && look.name !== look.id ? `${look.id} · ` : ''}${labels.frameLookUses.replace('__n__', String(uses))}`}
        actions={
          <span className="flex items-center gap-1">
            <LookSwatch look={look} />
            <ConfirmPopover message={labels.frameLookDeleteConfirm} onConfirm={onRemove}>
              {({ open }) => <IconButton label={labels.frameLookDelete} icon={<Trash2 size={13} />} destructive onClick={open} />}
            </ConfirmPopover>
          </span>
        }
      >
        <div className="mb-2 flex flex-col gap-2">
          <FieldRow stacked label={labels.idLabel} tooltip={labels.frameLookIdHelp} hint={idTaken ? labels.frameLookIdTaken : undefined} className="mb-0">
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
              aria-label={labels.frameLookIdAria}
              aria-invalid={idEmpty || idTaken}
              className={inputClass}
              style={{ ...inputStyle, borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--rule)' }}
            />
          </FieldRow>
          <FieldRow stacked label={labels.frameLookNameLabel} tooltip={labels.styleNameHelp} className="mb-0">
            <input
              dir="auto"
              type="text"
              value={look.name ?? ''}
              onChange={(e) => onChange(lookWith(look, ['name'], e.target.value.length > 0 ? e.target.value : undefined))}
              aria-label={labels.frameLookNameAria}
              placeholder={look.id}
              className={inputClass}
              style={inputStyle}
            />
          </FieldRow>
        </div>
        {colourFields(labels).map((group) => (
          <FieldGroup key={group.title} title={group.title}>
            {group.fields.map((f) => {
              const value = lookAt(look, f.path) as ColorValue | undefined;
              return (
                <ColorPicker
                  key={f.path.join('.')}
                  label={f.label}
                  value={value ?? UNSET}
                  onChange={(c) => onChange(lookWith(look, f.path, c))}
                  isDefault={value === undefined}
                  onReset={() => onChange(lookWith(look, f.path, undefined))}
                  fieldId={`frameLooks-${look.id}-${f.path.join('-')}`}
                />
              );
            })}
            {group.title === labels.frameLookGroupText && (
              <DimensionInput
                label={labels.pageTemplatesLookTracking}
                value={tracking ?? { value: 0, unit: 'em' }}
                onChange={(d) => onChange(lookWith(look, ['body', 'letterSpacing'], d))}
                min={-1}
                step={0.005}
                units={['em', 'pt', 'px']}
                isDefault={tracking === undefined}
                onReset={() => onChange(lookWith(look, ['body', 'letterSpacing'], undefined))}
              />
            )}
          </FieldGroup>
        ))}
      </ItemCard>
    </SearchScope>
  );
}

/** Design › Boxes › Frame looks (#1089): the named looks a `:::frame`
 *  piece of a composed page wears with `look="…"`, laid over its frame's
 *  style and template look. Each card says how many pieces of the book
 *  name it; renaming one rewrites those pieces. */
export const FrameLooksSection = memo(function FrameLooksSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.frameLooks);
  const looks: FrameLookEntry[] = useMemo(() => raw ?? [], [raw]);
  const texts = useBookTexts();
  const uses = useMemo(() => {
    const out = new Map<string, number>();
    for (const ch of texts) for (const [id, n] of lookUsage(ch.markdown)) out.set(id, (out.get(id) ?? 0) + n);
    return out;
  }, [texts]);

  const write = (next: FrameLookEntry[]) => dispatch({ type: 'UPDATE_CONFIG', payload: { frameLooks: next.length > 0 ? next : undefined } });
  const add = () => {
    const id = nextLookId(looks);
    openCard(LIST, id);
    write([...looks, { id, name: labels.frameLookNewName }]);
  };
  const rename = (id: string, nextId: string) => {
    if (looks.some((l) => l.id === nextId)) return;
    moveCardState(LIST, id, nextId);
    write(looks.map((l) => (l.id === id ? { ...l, id: nextId } : l)));
    // The pieces that name the look follow it.
    for (const ch of texts) {
      const changes = renameLookChanges(ch.markdown, id, nextId);
      if (changes.length > 0) applyViewerEdit(dispatch, ch.id, changes, ch.markdown.length);
    }
  };

  return (
    <CollapsibleSection
      title={labels.frameLooksSection}
      sectionId="frameLooks"
      hasOverrides={looks.length > 0}
      onReset={() => write([])}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.frameLooksResetConfirm}
    >
      <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
        {looks.length === 0 ? labels.frameLooksEmpty : labels.frameLooksHint}
      </p>
      <ItemCardListActions list={LIST} ids={looks.map((l) => l.id)} />
      {looks.map((look) => (
        <FrameLookCard
          key={look.id}
          look={look}
          uses={uses.get(look.id) ?? 0}
          otherIds={new Set(looks.filter((l) => l.id !== look.id).map((l) => l.id))}
          onChange={(next) => write(looks.map((l) => (l.id === look.id ? next : l)))}
          onRename={(nextId) => rename(look.id, nextId)}
          onRemove={() => write(looks.filter((l) => l.id !== look.id))}
        />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={add} className="mt-1">
        {labels.frameLookAdd}
      </Button>
    </CollapsibleSection>
  );
});

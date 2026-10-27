'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { AnchorEdge, Dimension, ElementPlacement, FrameGroupConfig } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { DimensionInput, FieldRow, ItemCard, ItemCardListActions, moveCardState, NumberInput, openCard, SelectInput, TextControl, ToggleSwitch } from '../../../../controls/index.js';
import { Button, ConfirmPopover, IconButton } from '../../../../ui/index.js';
import { addGroup, moveMember, namesInUse, removeGroup, renameFrame, slugify, templateAt, uniqueName, updateGroup, type TemplateScope } from '../../../../templates/templateEdits.js';
import { modulesGroupParents, moduleTemplates } from '../../../../templates/moduleEdits.js';
import { resolveAt, usePageTemplates } from './model.js';

const MM0: Dimension = { value: 0, unit: 'mm' };

interface GroupsEditorProps {
  templateId: string;
  scope: TemplateScope;
}

/** The template's groups: frames stacked or set in a row that share the
 *  space between them (`kind`, members in page order, `gap`, `align`). */
export function GroupsEditor({ templateId, scope }: GroupsEditorProps) {
  const labels = useSandboxLabels();
  const { templates, write } = usePageTemplates();
  const template = resolveAt({ pageTemplates: templates }, templateId, scope);
  if (!template) return null;
  const own = templateAt(templates, templateId)?.template;
  const entries = (scope === 'base' ? own?.groups : own?.variants?.[scope]?.groups) ?? [];

  const cardList = `templateGroups:${templateId}:${scope}`;
  // A modules group may lie inside another modules group of the template
  // (#1088; #1095: a row or a grid too, to any depth), and take some of the
  // book's modules.
  const modules = moduleTemplates(templates).map((t) => t.id);
  const add = () => {
    const name = uniqueName(namesInUse(templates, templateId), 'group');
    openCard(cardList, name);
    write(addGroup(templates, templateId, scope, { name, kind: 'stack', frames: [] }));
  };

  return (
    <div>
      {template.groups.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>{labels.pageTemplatesGroupsEmpty}</p>
      )}
      <ItemCardListActions list={cardList} ids={template.groups.map((g) => g.name)} />
      {template.groups.map((g) => {
        const entry = entries.find((e) => e.name === g.name);
        const inOther = new Set(template.groups.filter((o) => o.name !== g.name).flatMap((o) => o.frames));
        return (
          <GroupCard
            key={g.name}
            cardList={cardList}
            group={g}
            entry={entry}
            frames={template.frames.map((f) => f.name)}
            targets={[...template.frames.map((f) => ({ name: f.name, group: false })), ...template.groups.filter((o) => o.name !== g.name).map((o) => ({ name: o.name, group: true }))]}
            taken={inOther}
            parents={g.modules ? modulesGroupParents(template.groups, g.name) : []}
            modules={modules}
            onChange={(patch) => write(updateGroup(templates, templateId, scope, g.name, patch))}
            onRename={(next) => {
              if (namesInUse(templates, templateId).has(next)) return;
              moveCardState(cardList, g.name, next);
              write(renameFrame(templates, templateId, g.name, next));
            }}
            onRemove={() => write(removeGroup(templates, templateId, scope, g.name))}
          />
        );
      })}
      <Button variant="outline" size="xs" icon={<Plus size={12} aria-hidden="true" />} onClick={add}>
        {labels.pageTemplatesGroupAdd}
      </Button>
    </div>
  );
}

interface GroupCardProps {
  /** Where the card's fold is kept (#1031). */
  cardList: string;
  group: {
    name: string;
    kind: 'stack' | 'row' | 'grid';
    frames: string[];
    gap: Dimension;
    align: string;
    placement?: ElementPlacement;
    columns?: number;
    columnGap?: Dimension;
    rowGap?: Dimension;
    rowAlign?: 'start' | 'center' | 'end' | 'stretch';
    repeat?: { frames: string[]; max?: number };
    modules?: true;
    overflow?: { continueIn?: string };
    within?: string;
    templates?: string[];
  };
  entry: FrameGroupConfig | undefined;
  frames: string[];
  /** What the group's own box may hang from: the frames and the other
   *  groups. */
  targets: { name: string; group: boolean }[];
  /** Frames that belong to another group (a frame is in one at most). */
  taken: Set<string>;
  /** The template's other modules groups a modules group may lie in
   *  (#1088, #1095): none inside it. */
  parents: string[];
  /** The book's module templates. */
  modules: string[];
  onChange: (patch: Partial<Record<keyof FrameGroupConfig, unknown>>) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}

function GroupCard({ cardList, group, entry, frames, targets, taken, parents, modules, onChange, onRename, onRemove }: GroupCardProps) {
  const labels = useSandboxLabels();
  const [draft, setDraft] = useState(group.name);
  useEffect(() => setDraft(group.name), [group.name]);
  const has = (k: keyof FrameGroupConfig) => entry?.[k] !== undefined;
  const members = group.frames;
  // A frame ticked joins at the end; the order is the one listed, and the
  // arrows change it (#991).
  const toggle = (name: string, on: boolean) => {
    onChange({ frames: on ? [...members, name] : members.filter((m) => m !== name) });
  };
  const listed = [...members.filter((m) => frames.includes(m)), ...frames.filter((f) => !members.includes(f))];
  return (
    <ItemCard
      list={cardList}
      id={group.name}
      title={group.name}
      actions={
        <ConfirmPopover message={labels.pageTemplatesGroupDeleteConfirm.replace('__name__', group.name)} onConfirm={onRemove}>
          {({ open }) => <IconButton label={labels.pageTemplatesGroupDelete} icon={<Trash2 size={12} aria-hidden="true" />} onClick={open} />}
        </ConfirmPopover>
      }
    >
      <FieldRow label={labels.pageTemplatesGroupName}>
        <TextControl
          value={draft}
          onChange={setDraft}
          onBlur={() => {
            const next = slugify(draft);
            if (next && next !== group.name) onRename(next);
            else setDraft(group.name);
          }}
          ariaLabel={labels.pageTemplatesGroupName}
          widthCh={14}
        />
      </FieldRow>
      {/* A modules group (#1062, #1065): the page's :::module blocks, in a
          stack, a row or a grid (#1088); its members are not read. */}
      <ToggleSwitch
        label={labels.pageTemplatesGroupModules}
        tooltip={labels.pageTemplatesGroupModulesTooltip}
        checked={!!group.modules}
        onChange={(on) => onChange(on ? { modules: true, frames: undefined, repeat: undefined } : { modules: undefined, overflow: undefined, within: undefined, templates: undefined })}
        isDefault={!has('modules')}
      />
      {group.modules && (parents.length > 0 || group.within !== undefined) && (
        <SelectInput
          label={labels.pageTemplatesGroupWithin}
          tooltip={labels.pageTemplatesGroupWithinTooltip}
          value={group.within ?? ''}
          options={[{ value: '', label: labels.pageTemplatesGroupWithinNone }, ...parents.map((n) => ({ value: n, label: n })), ...(group.within && !parents.includes(group.within) ? [{ value: group.within, label: group.within }] : [])]}
          onChange={(v) => onChange(v ? { within: v, overflow: undefined } : { within: undefined, templates: undefined })}
          isDefault={!has('within')}
          onReset={() => onChange({ within: undefined, templates: undefined })}
        />
      )}
      {group.modules && group.within !== undefined && modules.length > 0 && (
        <fieldset className="m-0 mt-1 border-0 p-0">
          <legend className="mb-1 p-0 text-xs" style={{ color: 'var(--slate)' }}>{labels.pageTemplatesGroupTemplates}</legend>
          <p className="mb-1 text-[0.7rem]" style={{ color: 'var(--slate)' }}>{labels.pageTemplatesGroupTemplatesHint}</p>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {modules.map((m) => {
              const list = group.templates ?? [];
              return (
                <li key={m} className="flex min-h-11 items-center text-xs">
                  <label className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={list.includes(m)}
                      onChange={(e) => {
                        const next = e.target.checked ? [...list, m] : list.filter((x) => x !== m);
                        onChange({ templates: next.length > 0 ? next : undefined });
                      }}
                    />
                    <span className="truncate" dir="ltr">{m}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}
      {group.modules && group.within === undefined && (
        <ToggleSwitch
          label={labels.pageTemplatesGroupModulesContinue}
          tooltip={labels.pageTemplatesGroupModulesContinueTooltip}
          checked={group.overflow?.continueIn !== undefined}
          onChange={(on) => onChange({ overflow: on ? { continueIn: 'next-page' } : undefined })}
          isDefault={!has('overflow')}
        />
      )}
      <SelectInput
        label={labels.pageTemplatesGroupKind}
        value={group.kind}
        variant="segmented"
        options={[
          { value: 'stack', label: labels.pageTemplatesGroupKindStack },
          { value: 'row', label: labels.pageTemplatesGroupKindRow },
          { value: 'grid', label: labels.pageTemplatesGroupKindGrid },
        ]}
        onChange={(v) => onChange(v === 'grid' ? { kind: v } : v === 'row' && group.modules ? { kind: v, columns: undefined, columnGap: undefined, rowGap: undefined, repeat: undefined } : { kind: v, columns: undefined, columnGap: undefined, rowGap: undefined, rowAlign: undefined, repeat: undefined })}
        tooltip={group.modules ? labels.pageTemplatesGroupModulesKindTooltip : labels.pageTemplatesGroupKindTooltip}
        isDefault={!has('kind')}
        onReset={() => onChange({ kind: undefined, columns: undefined, columnGap: undefined, rowGap: undefined, rowAlign: undefined, repeat: undefined })}
      />
      <DimensionInput label={labels.pageTemplatesGroupGap} value={group.gap ?? MM0} onChange={(d) => onChange({ gap: d })} isDefault={!has('gap')} onReset={() => onChange({ gap: undefined })} />
      {group.kind === 'grid' && (
        <GridFields group={group} entry={entry} frames={frames} taken={taken} onChange={onChange} />
      )}
      {group.modules && group.kind === 'row' && <RowAlignField value={group.rowAlign} isDefault={!has('rowAlign')} onChange={(v) => onChange({ rowAlign: v })} />}
      {!group.modules && group.kind !== 'grid' && (
        <SelectInput
          label={labels.pageTemplatesGroupAlign}
          value={group.align}
          options={[
            { value: 'start', label: labels.pageTemplatesGroupAlignStart },
            { value: 'center', label: labels.pageTemplatesGroupAlignCenter },
            { value: 'end', label: labels.pageTemplatesGroupAlignEnd },
            { value: 'space-between', label: labels.pageTemplatesGroupAlignBetween },
          ]}
          onChange={(v) => onChange({ align: v })}
          tooltip={labels.pageTemplatesGroupAlignTooltip}
          isDefault={!has('align')}
          onReset={() => onChange({ align: undefined })}
        />
      )}
      <GroupBoxFields placement={group.placement} targets={targets} isSet={has('placement')} onChange={(p) => onChange({ placement: p })} />
      {!group.modules && !(group.kind === 'grid' && group.repeat) && (
      <fieldset className="m-0 mt-1 border-0 p-0">
        <legend className="mb-1 p-0 text-xs" style={{ color: 'var(--slate)' }}>{labels.pageTemplatesGroupMembers}</legend>
        <p className="mb-1 text-[0.7rem]" style={{ color: 'var(--slate)' }}>{labels.pageTemplatesGroupMembersHint}</p>
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {listed.map((f) => {
            const at = members.indexOf(f);
            return (
              <li key={f} className="flex min-h-6 items-center gap-1 text-xs" style={{ opacity: taken.has(f) ? 0.5 : 1 }}>
                <label className="flex min-w-0 flex-1 items-center gap-1.5">
                  <input type="checkbox" checked={at >= 0} disabled={taken.has(f)} onChange={(e) => toggle(f, e.target.checked)} />
                  <span className="w-4 shrink-0 text-end tabular-nums" aria-hidden="true" style={{ color: 'var(--slate)' }}>{at >= 0 ? at + 1 : ''}</span>
                  <span className="truncate" dir="ltr">{f}</span>
                </label>
                {at >= 0 && (
                  <>
                    <IconButton size={24} label={labels.pageTemplatesGroupMemberUp.replace('__name__', f)} icon={<ArrowUp size={12} aria-hidden="true" />} disabled={at === 0} onClick={() => onChange({ frames: moveMember(members, f, -1) })} />
                    <IconButton size={24} label={labels.pageTemplatesGroupMemberDown.replace('__name__', f)} icon={<ArrowDown size={12} aria-hidden="true" />} disabled={at === members.length - 1} onClick={() => onChange({ frames: moveMember(members, f, 1) })} />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>
      )}
    </ItemCard>
  );
}

/** A grid's own fields (#1061, #1065): its columns, gaps, how a short cell
 *  stands in its row, and the set of frames it repeats per item. */
function GridFields({ group, entry, frames, taken, onChange }: Pick<GroupCardProps, 'group' | 'entry' | 'frames' | 'taken' | 'onChange'>) {
  const labels = useSandboxLabels();
  const has = (k: keyof FrameGroupConfig) => entry?.[k] !== undefined;
  const repeat = group.repeat;
  const free = frames.filter((f) => !taken.has(f));
  const main = repeat?.frames[0];
  const setRepeat = (next: { frames: string[]; max?: number } | undefined) => onChange({ repeat: next });
  return (
    <>
      <NumberInput
        label={labels.pageTemplatesGroupColumns}
        tooltip={labels.pageTemplatesGroupColumnsTooltip}
        value={group.columns ?? 1}
        min={1}
        max={12}
        onChange={(n) => onChange({ columns: n })}
        isDefault={!has('columns')}
        onReset={() => onChange({ columns: undefined })}
      />
      <DimensionInput label={labels.pageTemplatesGroupColumnGap} value={group.columnGap ?? group.gap ?? MM0} onChange={(d) => onChange({ columnGap: d })} isDefault={!has('columnGap')} onReset={() => onChange({ columnGap: undefined })} />
      <DimensionInput label={labels.pageTemplatesGroupRowGap} value={group.rowGap ?? group.gap ?? MM0} onChange={(d) => onChange({ rowGap: d })} isDefault={!has('rowGap')} onReset={() => onChange({ rowGap: undefined })} />
      <RowAlignField value={group.rowAlign} isDefault={!has('rowAlign')} onChange={(v) => onChange({ rowAlign: v })} />
      {/* A grid of modules (#1088) has its modules for cells. */}
      {!group.modules && (
      <ToggleSwitch
        label={labels.pageTemplatesGroupRepeat}
        tooltip={labels.pageTemplatesGroupRepeatTooltip}
        checked={!!repeat}
        onChange={(on) => setRepeat(on ? { frames: [group.frames[0] ?? free[0] ?? ''].filter(Boolean) } : undefined)}
        isDefault={!has('repeat')}
      />
      )}
      {!group.modules && repeat && (
        <>
          <SelectInput
            label={labels.pageTemplatesGroupRepeatMain}
            tooltip={labels.pageTemplatesGroupRepeatMainTooltip}
            value={main ?? ''}
            options={free.map((f) => ({ value: f, label: f }))}
            onChange={(v) => setRepeat({ ...repeat, frames: [v, ...repeat.frames.filter((m) => m !== v)] })}
          />
          <fieldset className="m-0 mt-1 border-0 p-0">
            <legend className="mb-1 p-0 text-xs" style={{ color: 'var(--slate)' }}>{labels.pageTemplatesGroupRepeatMembers}</legend>
            <p className="mb-1 text-[0.7rem]" style={{ color: 'var(--slate)' }}>{labels.pageTemplatesGroupRepeatMembersHint}</p>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {free.filter((f) => f !== main).map((f) => (
                <li key={f} className="flex min-h-6 items-center text-xs">
                  <label className="flex min-w-0 flex-1 items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={repeat.frames.includes(f)}
                      onChange={(e) => setRepeat({ ...repeat, frames: e.target.checked ? [...repeat.frames, f] : repeat.frames.filter((m) => m !== f) })}
                    />
                    <span className="truncate" dir="ltr">{f}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <NumberInput
            label={labels.pageTemplatesGroupRepeatMax}
            tooltip={labels.pageTemplatesGroupRepeatMaxTooltip}
            value={repeat.max ?? 0}
            min={0}
            max={99}
            onChange={(n) => setRepeat({ frames: repeat.frames, ...(n > 0 ? { max: n } : {}) })}
            isDefault={repeat.max === undefined}
          />
        </>
      )}
    </>
  );
}

/** Where a cell (or a module, #1088) shorter than its row stands. */
function RowAlignField({ value, isDefault, onChange }: { value: string | undefined; isDefault: boolean; onChange: (v: string | undefined) => void }) {
  const labels = useSandboxLabels();
  return (
    <SelectInput
      label={labels.pageTemplatesGroupRowAlign}
      tooltip={labels.pageTemplatesGroupRowAlignTooltip}
      value={value ?? 'stretch'}
      options={[
        { value: 'start', label: labels.pageTemplatesGroupRowAlignStart },
        { value: 'center', label: labels.pageTemplatesGroupRowAlignCenter },
        { value: 'end', label: labels.pageTemplatesGroupRowAlignEnd },
        { value: 'stretch', label: labels.pageTemplatesGroupRowAlignStretch },
      ]}
      onChange={(v) => onChange(v)}
      isDefault={isDefault}
      onReset={() => onChange(undefined)}
    />
  );
}

const NINE_POINT: AnchorEdge[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const ELEMENT_EDGES: AnchorEdge[] = ['below', 'above', 'right-of', 'left-of', 'align-top', 'align-bottom', 'align-left', 'align-right'];

/** A group's own box (#856): without one the group is the union of its
 *  frames' boxes; with one, its spare room is shared out (`grow`, `align`)
 *  and its frames yield inside it (`shrink`). */
function GroupBoxFields({ placement, targets, isSet, onChange }: {
  placement: ElementPlacement | undefined;
  targets: { name: string; group: boolean }[];
  isSet: boolean;
  onChange: (p: ElementPlacement | undefined) => void;
}) {
  const labels = useSandboxLabels();
  const to = placement?.anchor.to ?? 'none';
  const element = to.startsWith('#');
  const edges = element ? [...ELEMENT_EDGES, ...NINE_POINT] : NINE_POINT;
  const edgeLabel: Record<string, string> = {
    'top-left': labels.headerFooterFrameEdgeTopLeft, top: labels.headerFooterFrameEdgeTop, 'top-right': labels.headerFooterFrameEdgeTopRight,
    left: labels.headerFooterFrameEdgeLeft, center: labels.headerFooterFrameEdgeCenter, right: labels.headerFooterFrameEdgeRight,
    'bottom-left': labels.headerFooterFrameEdgeBottomLeft, bottom: labels.headerFooterFrameEdgeBottom, 'bottom-right': labels.headerFooterFrameEdgeBottomRight,
    'right-of': labels.headerFooterElementEdgeRightOf, 'left-of': labels.headerFooterElementEdgeLeftOf, below: labels.headerFooterElementEdgeBelow,
    above: labels.headerFooterElementEdgeAbove, 'align-top': labels.headerFooterElementEdgeAlignTop, 'align-bottom': labels.headerFooterElementEdgeAlignBottom,
    'align-left': labels.headerFooterElementEdgeAlignLeft, 'align-right': labels.headerFooterElementEdgeAlignRight,
  };
  const options = [
    { value: 'none', label: labels.pageTemplatesGroupBoxUnion },
    { value: 'container', label: labels.pageTemplatesAnchorArea },
    { value: 'page', label: labels.headerFooterAnchorToPage },
    { value: 'bleed', label: labels.headerFooterAnchorToBleed },
    ...targets.map((t) => ({ value: `#${t.name}`, label: (t.group ? labels.pageTemplatesAnchorGroup : labels.pageTemplatesAnchorFrame).replace('__name__', t.name) })),
  ];
  if (!options.some((o) => o.value === to)) options.push({ value: to, label: to });
  const size = placement?.size;
  const sizeField = (k: 'width' | 'height', label: string) => {
    const v = size?.[k];
    const fixed = typeof v === 'object' && v !== null;
    return (
      <>
        <SelectInput
          label={label}
          value={fixed ? 'fixed' : 'fill'}
          options={[{ value: 'fixed', label: labels.pageTemplatesSizeFixed }, { value: 'fill', label: labels.pageTemplatesSizeFill }]}
          onChange={(m) => onChange({ ...placement!, size: { ...(size ?? {}), [k]: m === 'fixed' ? { value: k === 'width' ? 100 : 80, unit: 'mm' } : 'fill' } })}
          isDefault={!fixed}
        />
        {fixed && <DimensionInput label={labels.pageTemplatesSizeValue} value={v as Dimension} onChange={(d) => onChange({ ...placement!, size: { ...(size ?? {}), [k]: d } })} />}
      </>
    );
  };
  return (
    <>
      <SelectInput
        label={labels.pageTemplatesGroupBox}
        value={to}
        options={options}
        onChange={(v) => {
          if (v === 'none') return onChange(undefined);
          const el = v.startsWith('#');
          const keep = placement && placement.anchor.to.startsWith('#') === el;
          onChange({ ...(placement ?? {}), anchor: { to: v as ElementPlacement['anchor']['to'], edge: keep ? placement!.anchor.edge : el ? 'below' : 'top-left' }, offset: placement?.offset ?? { x: MM0, y: MM0 } });
        }}
        tooltip={labels.pageTemplatesGroupBoxTooltip}
        isDefault={!isSet}
        onReset={() => onChange(undefined)}
      />
      {placement && (
        <>
          <SelectInput
            label={element ? labels.headerFooterElementEdge : labels.headerFooterFrameEdge}
            value={placement.anchor.edge}
            options={edges.map((e) => ({ value: e, label: edgeLabel[e] ?? e }))}
            onChange={(v) => onChange({ ...placement, anchor: { ...placement.anchor, edge: v as AnchorEdge } })}
          />
          <DimensionInput label={labels.headerFooterElementOffsetX} value={placement.offset?.x ?? MM0} min={-2000} onChange={(d) => onChange({ ...placement, offset: { x: d, y: placement.offset?.y ?? MM0 } })} />
          <DimensionInput label={labels.headerFooterElementOffsetY} value={placement.offset?.y ?? MM0} min={-2000} onChange={(d) => onChange({ ...placement, offset: { x: placement.offset?.x ?? MM0, y: d } })} />
          {sizeField('width', labels.pageTemplatesWidth)}
          {sizeField('height', labels.pageTemplatesHeight)}
        </>
      )}
    </>
  );
}

'use client';

import { Plus, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { useSandboxLabels, useSandboxSelector } from '../../../../context/SandboxContext.js';
import { DEFAULT_RULE_ELEMENT, DEFAULT_BOX_ELEMENT, DEFAULT_MAIN_COLOR, resolveBodyTextConfig } from 'postext';
import type {
  DesignSlot,
  DesignElement,
  DesignRuleElement,
  DesignBoxElement,
  DesignImageElement,
  DesignPathElement,
  ResolvedDesignElement,
  ResolvedDesignSlot,
} from 'postext';
import { Button, ConfirmPopover, IconButton as UiIconButton } from '../../../../ui/index.js';
import { SearchScope } from '../../../search/SearchScope.js';
import { ShowingDefaultsContext } from '../../../../controls/fieldContext.js';
import { ItemCard, ItemCardListActions, openCard, ToggleSwitch } from '../../../../controls/index.js';
import { TextElementEditor } from './TextElementEditor.js';
import { RuleElementEditor } from './RuleElementEditor.js';
import { BoxElementEditor } from './BoxElementEditor.js';
import { ImageElementEditor } from './ImageElementEditor.js';
import { PathElementEditor } from './PathElementEditor.js';
import { ConnectorElementEditor, type ConnectorHost } from './ConnectorElementEditor.js';
import { elementKindLabel } from './elementKind.js';
import { PATH_PRESETS } from './shapeEdits.js';
import { newConnector } from '../../../../templates/connectorEdits.js';
import { applyAlign, type SlotKind } from './placementAdapter.js';
import { foreEdgeElements } from './foreEdge.js';
import { newTextElement } from './elementTemplates.js';
import type { FrameTarget } from './sizeTo.js';
import { FenceConditionFields, useFenceAttributes } from './FenceConditionFields.js';

interface SlotEditorProps {
  slotKey: SlotKind;
  raw: DesignSlot | undefined;
  resolved: ResolvedDesignSlot;
  onUpdate: (slot: DesignSlot | undefined) => void;
  /** Placeholders this slot reads beyond its kind's: `['leader']` for a
   *  contents part row (#889). */
  extraPlaceholders?: readonly string[];
  /** The slot's JSON pointer in the configuration (`/header`,
   *  `/pageTemplates/0/decoration`): each element's card carries its own,
   *  so an element picked on a page opens at its card (#899). */
  configPath?: string;
  /** The frames and groups of the page template, when the slot is a
   *  composed page's decoration: a size can run to their edges (#945). */
  frames?: readonly FrameTarget[];
  /** The page template and scope the slot is the decoration of: it can
   *  then hold connectors, picked on the page (#1063). */
  connectorHost?: ConnectorHost;
  /** A composed page's decoration (#1189): whether its texts paint over
   *  the frames by default (a module's do). Unset: no such switch. */
  textOverDefault?: boolean;
}

function generateId(kind: 'text' | 'rule' | 'box' | 'image' | 'path' | 'connector', used: Set<string>): string {
  let i = 1;
  while (used.has(`${kind}${i}`)) i++;
  return `${kind}${i}`;
}

export function SlotEditor({ slotKey, raw, resolved, onUpdate, extraPlaceholders, configPath, frames, connectorHost, textOverDefault }: SlotEditorProps) {
  const labels = useSandboxLabels();
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  // Running heads and a page template's decoration read the page fence's
  // attributes (#1087): an element drawn only where the page says so.
  const fenceConditions = slotKey === 'header' || slotKey === 'footer' || connectorHost !== undefined;
  const fenceAttributes = useFenceAttributes();

  // When there's no override, show the resolved (library-default) elements
  // so the list is never mysteriously empty. Any edit then materialises the
  // full current snapshot as an override.
  const currentRaw: DesignElement[] = (raw?.elements ?? resolved.elements) as DesignElement[];
  const resolvedElements: ResolvedDesignElement[] = resolved.elements;

  const commit = (elements: DesignElement[]) => {
    onUpdate({ elements });
  };

  const existingIds = new Set(currentRaw.map((el) => el.id));
  // The fold of each element's card (#1031) is kept per slot.
  const cardList = `slot:${configPath ?? slotKey}`;

  /** New elements join at the end with their cards open. */
  const append = (...added: DesignElement[]) => {
    for (const el of added) openCard(cardList, el.id);
    commit([...currentRaw, ...added]);
  };

  const addText = () => {
    append(newTextElement(generateId('text', existingIds), slotKey));
  };

  const addRule = () => {
    const id = generateId('rule', existingIds);
    const template: DesignRuleElement = {
      ...DEFAULT_RULE_ELEMENT,
      id,
      placement: applyAlign(DEFAULT_RULE_ELEMENT.placement, slotKey, 'center'),
    };
    append(template);
  };

  const addBox = () => {
    const id = generateId('box', existingIds);
    const template: DesignBoxElement = {
      ...DEFAULT_BOX_ELEMENT,
      id,
      placement: applyAlign(DEFAULT_BOX_ELEMENT.placement, slotKey, 'center'),
    };
    append(template);
  };

  const addImage = () => {
    const id = generateId('image', existingIds);
    const template: DesignImageElement = {
      kind: 'image',
      id,
      resourceId: '',
      placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: { value: 20, unit: 'mm' }, height: 'auto' } },
    };
    append(template);
  };

  /** A shape (#1063): a bar filled with the main colour, ready for a
   *  preset or a path of its own. */
  const addPath = () => {
    const id = generateId('path', existingIds);
    const template: DesignPathElement = {
      kind: 'path',
      id,
      d: PATH_PRESETS.bar,
      fill: { ...DEFAULT_MAIN_COLOR },
      placement: applyAlign(DEFAULT_BOX_ELEMENT.placement, slotKey, 'center'),
    };
    append(template);
  };

  /** A connector between the template's first two frames (#1063), whose
   *  ends are then picked on the page or in its lists. */
  const addConnector = () => {
    append(newConnector(generateId('connector', existingIds), (frames ?? []).filter((f) => f.kind === 'frame').map((f) => f.name)));
  };

  /** The fore-edge heads of a vertical book, at 80 % of the body size
   *  (see `foreEdgeElements`). */
  const addForeEdge = () => {
    append(...foreEdgeElements(existingIds, resolveBodyTextConfig(bodyTextRaw).fontSize));
  };

  const updateAt = (index: number, next: DesignElement) => {
    const arr = currentRaw.slice();
    arr[index] = next;
    commit(arr);
  };

  /** `reserve` is left out of the element unless it is switched off. */
  const setReserve = (index: number, reserve: boolean) => {
    const next = { ...currentRaw[index]! };
    if (next.kind === 'connector') return;
    if (reserve) delete next.reserve;
    else next.reserve = false;
    updateAt(index, next);
  };

  const removeAt = (index: number) => {
    const arr = currentRaw.slice();
    arr.splice(index, 1);
    commit(arr);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const arr = currentRaw.slice();
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    commit(arr);
  };

  const moveDown = (index: number) => {
    if (index === currentRaw.length - 1) return;
    const arr = currentRaw.slice();
    [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
    commit(arr);
  };

  return (
    <div className="mt-2">
      {currentRaw.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.headerFooterNoElements}
        </p>
      )}
      <ShowingDefaultsContext value={raw === undefined}>
      <ItemCardListActions list={cardList} ids={currentRaw.map((el) => el.id)} />
      {currentRaw.map((rawEl, idx) => {
        const resolvedEl = resolvedElements[idx];
        // A connector (#1056) is not placed by an anchor: nothing anchors to it.
        const siblings = currentRaw
          .map((s, i) => ({ id: s.id, kind: s.kind, index: i }))
          .filter((s): s is typeof s & { kind: Exclude<typeof s.kind, 'connector'> } => s.id !== rawEl.id && s.kind !== 'connector');
        const isFirst = idx === 0;
        const isLast = idx === currentRaw.length - 1;
        const elementTitle = elementKindLabel(labels, rawEl.kind);
        return (
          <SearchScope key={`${slotKey}-${rawEl.id}-${idx}`} title={`${elementTitle} ${idx + 1}`} overridden={raw !== undefined}>
          <ItemCard
            list={cardList}
            id={rawEl.id}
            configPath={configPath ? `${configPath}/elements/${idx}` : undefined}
            title={`${elementTitle} #${idx + 1}`}
            actions={
              <div className="flex items-center gap-1">
                <IconButton label={labels.headerFooterMoveUp} disabled={isFirst} onClick={() => moveUp(idx)}>
                  <ArrowUp size={12} aria-hidden="true" />
                </IconButton>
                <IconButton label={labels.headerFooterMoveDown} disabled={isLast} onClick={() => moveDown(idx)}>
                  <ArrowDown size={12} aria-hidden="true" />
                </IconButton>
                {/* Deleting an element asks first (WCAG 3.3.6): its settings
                    cannot be brought back. */}
                <ConfirmPopover message={labels.headerFooterDeleteConfirm} onConfirm={() => removeAt(idx)}>
                  {({ open }) => (
                    <UiIconButton label={labels.headerFooterDelete} icon={<Trash2 size={12} aria-hidden="true" />} onClick={open} tooltipSide="top" />
                  )}
                </ConfirmPopover>
              </div>
            }
          >
            <div>
              {rawEl.kind === 'text' && resolvedEl?.kind === 'text' ? (
                <TextElementEditor
                  raw={rawEl}
                  resolved={resolvedEl}
                  slotKind={slotKey}
                  siblings={siblings}
                  frames={frames as FrameTarget[] | undefined}
                  extraPlaceholders={extraPlaceholders}
                  overDefault={textOverDefault}
                  onChange={(next) => updateAt(idx, next)}
                />
              ) : rawEl.kind === 'rule' && resolvedEl?.kind === 'rule' ? (
                <RuleElementEditor
                  raw={rawEl}
                  resolved={resolvedEl}
                  slotKind={slotKey}
                  siblings={siblings}
                  frames={frames as FrameTarget[] | undefined}
                  onChange={(next) => updateAt(idx, next)}
                />
              ) : rawEl.kind === 'box' && resolvedEl?.kind === 'box' ? (
                <BoxElementEditor
                  raw={rawEl}
                  resolved={resolvedEl}
                  slotKind={slotKey}
                  siblings={siblings}
                  frames={frames as FrameTarget[] | undefined}
                  onChange={(next) => updateAt(idx, next)}
                />
              ) : rawEl.kind === 'image' && resolvedEl?.kind === 'image' ? (
                <ImageElementEditor
                  raw={rawEl}
                  resolved={resolvedEl}
                  slotKind={slotKey}
                  siblings={siblings}
                  frames={frames as FrameTarget[] | undefined}
                  onChange={(next) => updateAt(idx, next)}
                />
              ) : rawEl.kind === 'path' && resolvedEl?.kind === 'path' ? (
                <PathElementEditor
                  raw={rawEl}
                  resolved={resolvedEl}
                  slotKind={slotKey}
                  siblings={siblings}
                  frames={frames as FrameTarget[] | undefined}
                  onChange={(next) => updateAt(idx, next)}
                />
              ) : rawEl.kind === 'connector' ? (
                <ConnectorElementEditor
                  raw={rawEl}
                  siblings={siblings}
                  frames={frames as FrameTarget[] | undefined}
                  host={connectorHost}
                  onChange={(next) => updateAt(idx, next)}
                />
              ) : null}
              {fenceConditions && (
                <FenceConditionFields raw={rawEl} attributes={fenceAttributes} onChange={(next) => updateAt(idx, next)} />
              )}
              {(slotKey === 'heading' || slotKey === 'box') && rawEl.kind !== 'connector' && (
                <ToggleSwitch
                  label={labels.headerFooterElementReserve}
                  checked={rawEl.reserve !== false}
                  onChange={(v) => setReserve(idx, v)}
                  tooltip={labels.headerFooterElementReserveTooltip}
                  isDefault={rawEl.reserve !== false}
                  onReset={() => setReserve(idx, true)}
                />
              )}
            </div>
          </ItemCard>
          </SearchScope>
        );
      })}
      </ShowingDefaultsContext>

      <div className="mt-2 flex flex-wrap gap-2">
        <AddButton label={labels.headerFooterAddText} onClick={addText} />
        <AddButton label={labels.headerFooterAddRule} onClick={addRule} />
        <AddButton label={labels.headerFooterAddBox} onClick={addBox} />
        <AddButton label={labels.headerFooterAddImage} onClick={addImage} />
        <AddButton label={labels.headerFooterAddPath} onClick={addPath} />
        {/* Connectors join frames: a page template's decoration only. */}
        {frames && frames.length > 0 && <AddButton label={labels.headerFooterAddConnector} onClick={addConnector} />}
      </div>
      {slotKey === 'header' && (
        <div className="mt-2 flex gap-2">
          <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addForeEdge} title={labels.headerFooterAddForeEdgeTooltip}>
            {labels.headerFooterAddForeEdge}
          </Button>
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return <UiIconButton size={18} label={label} icon={children} onClick={onClick} disabled={disabled} tooltipSide="top" />;
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={onClick}>
      {label}
    </Button>
  );
}

'use client';

import { Plus, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { useSandboxLabels } from '../../../context/SandboxContext';
import { DEFAULT_TEXT_ELEMENT, DEFAULT_RULE_ELEMENT, DEFAULT_BOX_ELEMENT } from 'postext';
import type {
  DesignSlot,
  DesignElement,
  DesignTextElement,
  DesignRuleElement,
  DesignBoxElement,
  ResolvedDesignElement,
  ResolvedDesignSlot,
} from 'postext';
import { Tooltip } from '../../../panels/Tooltip';
import { TextElementEditor } from './TextElementEditor';
import { RuleElementEditor } from './RuleElementEditor';
import { BoxElementEditor } from './BoxElementEditor';
import { applyAlign, type SlotKind } from './placementAdapter';

interface SlotEditorProps {
  slotKey: SlotKind;
  raw: DesignSlot | undefined;
  resolved: ResolvedDesignSlot;
  onUpdate: (slot: DesignSlot | undefined) => void;
}

function generateId(kind: 'text' | 'rule' | 'box', used: Set<string>): string {
  let i = 1;
  while (used.has(`${kind}${i}`)) i++;
  return `${kind}${i}`;
}

export function SlotEditor({ slotKey, raw, resolved, onUpdate }: SlotEditorProps) {
  const labels = useSandboxLabels();

  // When there's no override, show the resolved (library-default) elements
  // so the list is never mysteriously empty. Any edit then materialises the
  // full current snapshot as an override.
  const currentRaw: DesignElement[] = (raw?.elements ?? resolved.elements) as DesignElement[];
  const resolvedElements: ResolvedDesignElement[] = resolved.elements;

  const commit = (elements: DesignElement[]) => {
    onUpdate({ elements });
  };

  const existingIds = new Set(currentRaw.map((el) => el.id));

  const addText = () => {
    const id = generateId('text', existingIds);
    const template: DesignTextElement = {
      ...DEFAULT_TEXT_ELEMENT,
      id,
      content: '',
      // Default anchor aligned to the body edge for this slot.
      placement: applyAlign(DEFAULT_TEXT_ELEMENT.placement, slotKey, 'center'),
    };
    commit([...currentRaw, template]);
  };

  const addRule = () => {
    const id = generateId('rule', existingIds);
    const template: DesignRuleElement = {
      ...DEFAULT_RULE_ELEMENT,
      id,
      placement: applyAlign(DEFAULT_RULE_ELEMENT.placement, slotKey, 'center'),
    };
    commit([...currentRaw, template]);
  };

  const addBox = () => {
    const id = generateId('box', existingIds);
    const template: DesignBoxElement = {
      ...DEFAULT_BOX_ELEMENT,
      id,
      placement: applyAlign(DEFAULT_BOX_ELEMENT.placement, slotKey, 'center'),
    };
    commit([...currentRaw, template]);
  };

  const updateAt = (index: number, next: DesignElement) => {
    const arr = currentRaw.slice();
    arr[index] = next;
    commit(arr);
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
      {currentRaw.map((rawEl, idx) => {
        const resolvedEl = resolvedElements[idx];
        const isFirst = idx === 0;
        const isLast = idx === currentRaw.length - 1;
        return (
          <div
            key={`${slotKey}-${rawEl.id}-${idx}`}
            className="mb-2 rounded border"
            style={{ borderColor: 'var(--rule)' }}
          >
            <div
              className="flex items-center justify-between border-b px-2 py-1"
              style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--surface)' }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--gilt)' }}>
                {rawEl.kind === 'text'
                  ? labels.headerFooterElementText
                  : rawEl.kind === 'rule'
                    ? labels.headerFooterElementRule
                    : (labels.headerFooterElementBox ?? 'Box')}
                {' '}#{idx + 1}
              </span>
              <div className="flex items-center gap-1">
                <IconButton label={labels.headerFooterMoveUp} disabled={isFirst} onClick={() => moveUp(idx)}>
                  <ArrowUp size={12} aria-hidden="true" />
                </IconButton>
                <IconButton label={labels.headerFooterMoveDown} disabled={isLast} onClick={() => moveDown(idx)}>
                  <ArrowDown size={12} aria-hidden="true" />
                </IconButton>
                <IconButton label={labels.headerFooterDelete} onClick={() => removeAt(idx)}>
                  <Trash2 size={12} aria-hidden="true" />
                </IconButton>
              </div>
            </div>
            <div className="px-2 py-2">
              {rawEl.kind === 'text' && resolvedEl?.kind === 'text' ? (
                <TextElementEditor
                  raw={rawEl}
                  resolved={resolvedEl}
                  slotKind={slotKey}
                  siblings={currentRaw.map((s, i) => ({ id: s.id, kind: s.kind, index: i })).filter((s) => s.id !== rawEl.id)}
                  onChange={(next) => updateAt(idx, next)}
                />
              ) : rawEl.kind === 'rule' && resolvedEl?.kind === 'rule' ? (
                <RuleElementEditor
                  raw={rawEl}
                  resolved={resolvedEl}
                  slotKind={slotKey}
                  onChange={(next) => updateAt(idx, next)}
                />
              ) : rawEl.kind === 'box' && resolvedEl?.kind === 'box' ? (
                <BoxElementEditor
                  raw={rawEl}
                  resolved={resolvedEl}
                  slotKind={slotKey}
                  onChange={(next) => updateAt(idx, next)}
                />
              ) : null}
            </div>
          </div>
        );
      })}

      <div className="mt-2 flex gap-2">
        <AddButton label={labels.headerFooterAddText} onClick={addText} />
        <AddButton label={labels.headerFooterAddRule} onClick={addRule} />
        <AddButton label={labels.headerFooterAddBox ?? 'Add box'} onClick={addBox} />
      </div>
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
  return (
    <Tooltip content={label} side="top">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="flex h-5 w-5 items-center justify-center rounded transition-colors"
        style={{
          color: disabled ? 'var(--rule)' : 'var(--slate)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          border: 'none',
          background: 'none',
        }}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.color = 'var(--foreground)';
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.color = 'var(--slate)';
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors"
      style={{
        borderColor: 'var(--rule)',
        color: 'var(--slate)',
        backgroundColor: 'var(--surface)',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
    >
      <Plus size={12} aria-hidden="true" />
      {label}
    </button>
  );
}

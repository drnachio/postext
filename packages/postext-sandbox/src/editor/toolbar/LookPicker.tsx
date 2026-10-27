'use client';

import type { RefObject } from 'react';
import type { ColorValue, FrameLookEntry } from 'postext';
import type { SandboxLabels } from '../../types/labels.js';
import { Popover } from '../../ui/index.js';
import type { FramePiece } from '../../templates/frameLooks.js';

/** A label with `code` spans set as code. */
function withCode(text: string) {
  return text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part));
}

/** A small sample of a look: its fill, border and text colour. */
function Swatch({ look }: { look: FrameLookEntry | null }) {
  const hex = (c: ColorValue | undefined) => c?.hex;
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-6 w-9 shrink-0 items-center justify-center rounded text-[0.65rem] font-semibold"
      style={{
        backgroundColor: hex(look?.background) ?? 'transparent',
        border: `2px ${look ? 'solid' : 'dashed'} ${hex(look?.border?.color) ?? 'var(--rule)'}`,
        color: hex(look?.body?.color) ?? 'var(--foreground)',
      }}
    >
      Aa
    </span>
  );
}

interface LookPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<Element | null>;
  /** The book's named looks (`frameLooks`). */
  looks: readonly FrameLookEntry[];
  /** The `:::frame` piece the caret is in, when it is in one. */
  piece: FramePiece | null;
  labels: SandboxLabels;
  /** A look was chosen for the piece (`null`: none). */
  onPick: (id: string | null) => void;
}

/** The editor's «Frame look» picker (#1089): the book's named looks, and
 *  none, for the `:::frame` piece the caret is in; the one it names is
 *  marked. Picking one writes `look="…"` on the piece's fence. */
export function LookPicker({ open, onOpenChange, anchor, looks, piece, labels, onPick }: LookPickerProps) {
  const current = piece?.look?.text.trim() || null;
  const item = (id: string | null, look: FrameLookEntry | null, title: string, sub?: string) => {
    const pressed = current === id;
    return (
      <li key={id ?? ''}>
        <button
          type="button"
          data-look-id={id ?? ''}
          aria-pressed={pressed}
          className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded border px-2 py-1 text-start hover:bg-(--surface) focus-visible:outline-2 focus-visible:outline-(--brand)"
          style={{ borderColor: pressed ? 'var(--brand)' : 'var(--rule)', borderWidth: pressed ? 2 : 1 }}
          onClick={() => {
            onPick(id);
            onOpenChange(false);
          }}
        >
          <Swatch look={look} />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">{title}</span>
            {sub && <code className="text-[0.65rem]" style={{ color: 'var(--slate)' }}>{sub}</code>}
          </span>
        </button>
      </li>
    );
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next, _reason, event) => {
        // A press on the button that opened it toggles it there.
        const target = event?.target as Node | null | undefined;
        if (!next && target && anchor.current?.contains(target)) return;
        onOpenChange(next);
      }}
      anchor={anchor} side="bottom" align="start" ariaLabel={labels.frameLookPicker} width={300}>
      <div className="flex flex-col gap-2 text-xs" style={{ color: 'var(--foreground)' }}>
        <div className="font-medium">{labels.frameLookPicker}</div>
        {!piece ? (
          <p style={{ color: 'var(--slate)' }}>{withCode(labels.frameLookPickerNoPiece)}</p>
        ) : (
          <>
            <p style={{ color: 'var(--slate)' }}>{withCode(labels.frameLookPickerHint.replace('__slot__', piece.slot))}</p>
            {looks.length === 0 && <p style={{ color: 'var(--slate)' }}>{labels.frameLookPickerEmpty}</p>}
            <ul className="flex flex-col gap-1" role="list">
              {item(null, null, labels.frameLookNone)}
              {looks.map((l) => item(l.id, l, l.name || l.id, l.name && l.name !== l.id ? l.id : undefined))}
            </ul>
          </>
        )}
      </div>
    </Popover>
  );
}

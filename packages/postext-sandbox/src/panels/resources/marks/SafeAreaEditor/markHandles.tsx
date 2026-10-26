'use client';

// The handles of the marks dialog: a rectangle's resize handles, a mark's
// tag, a point mark and a label's handle (#1276: split out of
// SafeAreaEditor.tsx).
import type { ReactNode, KeyboardEvent } from 'react';
import { Type } from 'lucide-react';
import { HANDLES, type Point } from '../pictureMarks.js';

/** The eight resize handles of a rectangle being edited: 12 px squares
 *  whose hit area grows to 28 px, and to 44 px with large targets or on a
 *  touch screen. */
export function RectHandles({ color }: { color: string }) {
  return (
    <>
      {HANDLES.map((h) => (
        <span
          key={h}
          data-handle={h}
          aria-hidden="true"
          className="absolute h-3 w-3 rounded-sm border border-white after:absolute after:-inset-2 pointer-coarse:after:-inset-4 pt-large:after:-inset-4"
          style={{
            background: color,
            left: h.includes('w') ? -7 : h.includes('e') ? 'calc(100% - 5px)' : 'calc(50% - 6px)',
            top: h.includes('n') ? -7 : h.includes('s') ? 'calc(100% - 5px)' : 'calc(50% - 6px)',
            cursor: `${h === 'n' || h === 's' ? 'ns' : h === 'e' || h === 'w' ? 'ew' : h === 'ne' || h === 'sw' ? 'nesw' : 'nwse'}-resize`,
          }}
        />
      ))}
    </>
  );
}

/** A small label pinned to a mark's corner (a speaker id, a zone number). */
export function MarkTag({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute start-0 top-0 inline-flex items-center gap-1 whitespace-nowrap rounded-br px-1 text-[10px] font-semibold leading-[14px] text-white"
      style={{ background: 'rgba(0, 0, 0, 0.72)', borderInlineStart: `3px solid ${color}` }}
    >
      {children}
    </span>
  );
}

interface PointMarkProps {
  markRef?: (el: HTMLElement | null) => void;
  kind: 'mouth' | 'head';
  index: number;
  point: Point;
  color: string;
  active: boolean;
  selected?: boolean;
  /** Ticked for a change of several anchors together (#931). */
  ticked?: boolean;
  /** The pointer enters or leaves the point. */
  onHover?: (on: boolean) => void;
  label: string;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
  tag?: ReactNode;
}

/** A draggable point: a 44 px target centred on it, drawn as a filled dot
 *  (mouth) or a ring (head), with the speaker id beside the mouth. */
export function PointMark({ markRef, kind, index, point, color, active, selected, ticked, onHover, label, onKeyDown, onFocus, tag }: PointMarkProps) {
  const dot = kind === 'mouth' ? 14 : 12;
  return (
    <div
      ref={markRef}
      data-mark={kind}
      data-index={index}
      role={active ? 'group' : undefined}
      tabIndex={active ? 0 : undefined}
      aria-label={active ? label : undefined}
      onKeyDown={active ? onKeyDown : undefined}
      onFocus={active ? onFocus : undefined}
      onPointerEnter={onHover ? () => onHover(true) : undefined}
      onPointerLeave={onHover ? () => onHover(false) : undefined}
      className="group absolute flex items-center justify-center rounded-full outline-none"
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, width: 44, height: 44, transform: 'translate(-50%, -50%)', cursor: active ? 'grab' : undefined }}
    >
      <span
        aria-hidden="true"
        className="block rounded-full group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-white"
        style={{
          width: dot,
          height: dot,
          background: kind === 'mouth' ? color : 'rgba(0, 0, 0, 0.35)',
          border: kind === 'mouth' ? '2px solid #fff' : `3px solid ${color}`,
          boxShadow: selected ? `0 0 0 3px rgba(0, 0, 0, 0.55), 0 0 0 6px ${color}` : ticked ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : '0 0 0 1.5px rgba(0, 0, 0, 0.6)',
        }}
      />
      {tag && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inline-flex items-center gap-1 whitespace-nowrap rounded px-1 text-[10px] font-semibold leading-[14px] text-white"
          style={{ left: 30, top: 2, background: 'rgba(0, 0, 0, 0.72)', borderInlineStart: `3px solid ${color}` }}
        >
          {tag}
        </span>
      )}
    </div>
  );
}

interface LabelHandleProps {
  markRef?: (el: HTMLElement | null) => void;
  index: number;
  point: Point;
  /** The label stands away from its point; else this is the grip by the
   *  point that sets it away. */
  away: boolean;
  color: string;
  text: string;
  label: string;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
}

/** The handle of a label set away from its point (#1064): a tag with the
 *  label's words where it stands, or, for the anchor picked, a grip beside
 *  its point. Dragged or nudged with the arrows it moves `labelAt`; Delete
 *  sets the label back at its point. A 44 px target. */
export function LabelHandle({ markRef, index, point, away, color, text, label, onKeyDown, onFocus }: LabelHandleProps) {
  return (
    <div
      ref={markRef}
      data-mark="label"
      data-index={index}
      role="group"
      tabIndex={0}
      aria-label={label}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      className="group absolute flex items-center justify-center outline-none"
      style={{
        left: `${point.x * 100}%`,
        top: `${point.y * 100}%`,
        minWidth: 44,
        height: 44,
        // The grip stands up and to the right of the point it leaves.
        transform: away ? 'translate(-50%, -50%)' : 'translate(4px, calc(-100% - 4px))',
        cursor: 'grab',
      }}
    >
      <span
        aria-hidden="true"
        className="inline-flex max-w-[11rem] items-center gap-1 whitespace-nowrap rounded px-1.5 text-[10px] font-semibold leading-[18px] text-white group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-white"
        style={{ background: 'rgba(0, 0, 0, 0.78)', border: `2px ${away ? 'solid' : 'dashed'} ${color}` }}
      >
        <Type size={10} aria-hidden="true" />
        {away && <span dir="auto" className="truncate">{text}</span>}
      </span>
    </div>
  );
}

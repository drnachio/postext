'use client';

import { useId, useState, type RefObject } from 'react';
import type { Resource } from 'postext';
import type { SandboxLabels } from '../../types/labels.js';
import { Button, NumberField, Popover, SegmentedControl, Select } from '../../ui/index.js';
import { iconDirective, type IconSpec } from '../syntax/labelAttrs.js';

// ---------------------------------------------------------------------------
// The editor's symbol picker (#1064): the `:icon[alt]{…}` of a map's key or a
// label (#1058), written at the caret. A picture of the book (a bitmap or an
// SVG resource), a glyph in a face (a row of common map symbols, or any
// typed), or a line sample (solid, dashed, dotted); an optional colour (a
// hex or a palette id) and size, and the words a reader hears for it.
// ---------------------------------------------------------------------------

/** Symbols a map's key often uses, offered as one-press buttons. */
export const COMMON_GLYPHS = ['⊙', '●', '○', '■', '□', '▲', '★', '✈', '⚓', '✚'] as const;

type Kind = IconSpec['kind'];
type Line = Extract<IconSpec, { kind: 'line' }>['line'];

export interface IconPickerState {
  kind: Kind;
  resource: string;
  glyph: string;
  font: string;
  line: Line;
  color: string;
  size: number;
  alt: string;
}

export const INITIAL_ICON_PICKER: IconPickerState = { kind: 'glyph', resource: '', glyph: '⊙', font: '', line: 'solid', color: '', size: 0, alt: '' };

/** The directive the picker's state writes, or null while it names no
 *  symbol (no picture chosen, an empty glyph). */
export function pickerDirective(s: IconPickerState): string | null {
  const spec: IconSpec | null = s.kind === 'resource' ? (s.resource ? { kind: 'resource', resource: s.resource } : null)
    : s.kind === 'glyph' ? (s.glyph.trim() ? { kind: 'glyph', glyph: s.glyph.trim(), ...(s.font.trim() ? { font: s.font.trim() } : {}) } : null)
      : { kind: 'line', line: s.line };
  if (!spec) return null;
  return iconDirective(spec, s.alt, { ...(s.color.trim() ? { color: s.color.trim() } : {}), ...(s.size > 0 ? { size: s.size } : {}) });
}

/** The resources a symbol may show: pictures. */
export const pictureResources = (resources: readonly Resource[]): Resource[] => resources.filter((r) => r.kind === 'bitmap' || r.kind === 'svg');

interface IconPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: RefObject<Element | null>;
  labels: SandboxLabels;
  resources: readonly Resource[];
  /** The directive chosen, to write at the caret. */
  onInsert: (directive: string) => void;
  /** Starting state (tests). */
  initial?: IconPickerState;
}

export function IconPicker({ open, onOpenChange, anchor, labels, resources, onInsert, initial }: IconPickerProps) {
  const [s, setS] = useState<IconPickerState>(initial ?? INITIAL_ICON_PICKER);
  const uid = useId();
  const set = (patch: Partial<IconPickerState>) => setS((x) => ({ ...x, ...patch }));
  const pictures = pictureResources(resources);
  const directive = pickerDirective(s);
  const inputClass = 'h-7 min-w-0 flex-1 rounded-md border bg-(--surface) px-2 text-xs text-(--foreground) outline-none focus:outline-2 focus:outline-offset-1 focus:outline-(--brand) pt-large:h-11';
  const inputStyle = { borderColor: 'var(--pt-control-border)' };
  const hex = /^#[0-9a-f]{6}$/i.test(s.color.trim()) ? s.color.trim() : '#000000';
  return (
    <Popover
      open={open}
      onOpenChange={(next, _reason, event) => {
        const target = event?.target as Node | null | undefined;
        if (!next && target && anchor.current?.contains(target)) return;
        onOpenChange(next);
      }}
      anchor={anchor}
      side="bottom"
      align="start"
      ariaLabel={labels.iconPickerTitle}
      width={340}
    >
      <div className="flex flex-col gap-2 text-xs" style={{ color: 'var(--foreground)' }} data-testid="icon-picker">
        <div className="font-medium">{labels.iconPickerTitle}</div>
        <p className="m-0" style={{ color: 'var(--slate)' }}>{labels.iconPickerHint}</p>
        <SegmentedControl<Kind>
          size="sm"
          value={s.kind}
          onValueChange={(kind) => set({ kind })}
          ariaLabel={labels.iconPickerKind}
          options={[
            { value: 'resource', label: labels.iconPickerPicture },
            { value: 'glyph', label: labels.iconPickerGlyph },
            { value: 'line', label: labels.iconPickerLine },
          ]}
        />
        {s.kind === 'resource' && (
          pictures.length === 0 ? (
            <p className="m-0" style={{ color: 'var(--slate)' }}>{labels.iconPickerNoPictures}</p>
          ) : (
            <div className="flex items-center gap-2">
              <span id={`${uid}-res`} className="w-20 shrink-0 text-(--slate)">{labels.iconPickerPicture}</span>
              <Select
                value={s.resource}
                onValueChange={(resource) => set({ resource })}
                options={[{ value: '', label: labels.iconPickerChoosePicture }, ...pictures.map((r) => ({ value: r.id, label: r.id }))]}
                ariaLabelledBy={`${uid}-res`}
                muted={!s.resource}
                className="min-w-0 flex-1"
                size="sm"
              />
            </div>
          )
        )}
        {s.kind === 'glyph' && (
          <>
            <div role="group" aria-label={labels.iconPickerCommon} className="flex flex-wrap gap-1">
              {COMMON_GLYPHS.map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={s.glyph === g}
                  aria-label={labels.iconPickerUseGlyph.replace('__glyph__', g)}
                  onClick={() => set({ glyph: g })}
                  className="inline-flex size-7 cursor-pointer items-center justify-center rounded border text-sm pt-large:size-11 focus-visible:outline-2 focus-visible:outline-(--brand)"
                  style={{ borderColor: s.glyph === g ? 'var(--brand)' : 'var(--pt-control-border)', background: s.glyph === g ? 'var(--brand-soft, var(--surface))' : 'transparent' }}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor={`${uid}-glyph`} className="w-20 shrink-0 text-(--slate)">{labels.iconPickerGlyph}</label>
              <input id={`${uid}-glyph`} type="text" dir="auto" value={s.glyph} onChange={(e) => set({ glyph: e.target.value })} className={inputClass} style={inputStyle} />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor={`${uid}-font`} className="w-20 shrink-0 text-(--slate)">{labels.iconPickerFont}</label>
              <input id={`${uid}-font`} type="text" value={s.font} placeholder={labels.iconPickerFontPlaceholder} onChange={(e) => set({ font: e.target.value })} className={inputClass} style={inputStyle} />
            </div>
          </>
        )}
        {s.kind === 'line' && (
          <div className="flex items-center gap-2">
            <span id={`${uid}-line`} className="w-20 shrink-0 text-(--slate)">{labels.iconPickerLine}</span>
            <SegmentedControl<Line>
              size="sm"
              value={s.line}
              onValueChange={(line) => set({ line })}
              ariaLabelledBy={`${uid}-line`}
              ariaLabel={labels.iconPickerLine}
              options={[
                { value: 'solid', label: labels.leaderDashSolid },
                { value: 'dashed', label: labels.leaderDashDashed },
                { value: 'dotted', label: labels.leaderDashDotted },
              ]}
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <label htmlFor={`${uid}-color`} className="w-20 shrink-0 text-(--slate)">{labels.iconPickerColor}</label>
          <input
            type="color"
            value={hex}
            onChange={(e) => set({ color: e.target.value })}
            aria-label={labels.iconPickerColorSwatch}
            className="h-7 w-9 shrink-0 cursor-pointer rounded border bg-transparent pt-large:h-11 pt-large:w-11"
            style={inputStyle}
          />
          <input id={`${uid}-color`} type="text" dir="ltr" value={s.color} placeholder={labels.iconPickerColorPlaceholder} onChange={(e) => set({ color: e.target.value })} className={inputClass} style={inputStyle} />
        </div>
        <div className="flex items-center gap-2">
          <span id={`${uid}-size`} className="w-20 shrink-0 text-(--slate)">{labels.iconPickerSize}</span>
          <NumberField value={s.size} onValueChange={(v) => set({ size: Number.isFinite(v) && v > 0 ? v : 0 })} min={0} max={4} step={0.05} widthCh={5} ariaLabelledBy={`${uid}-size`} ariaDescribedBy={`${uid}-size-hint`} muted={s.size === 0} />
          <span className="text-(--slate)">em</span>
        </div>
        <p id={`${uid}-size-hint`} className="m-0 text-[11px] text-(--slate)">{labels.iconPickerSizeHint}</p>
        <div className="flex items-center gap-2">
          <label htmlFor={`${uid}-alt`} className="w-20 shrink-0 text-(--slate)">{labels.iconPickerAlt}</label>
          <input id={`${uid}-alt`} type="text" dir="auto" value={s.alt} onChange={(e) => set({ alt: e.target.value })} aria-describedby={`${uid}-alt-hint`} className={inputClass} style={inputStyle} />
        </div>
        <p id={`${uid}-alt-hint`} className="m-0 text-[11px] text-(--slate)">{labels.iconPickerAltHint}</p>
        <code dir="ltr" className="block overflow-x-auto whitespace-pre rounded px-1.5 py-1 text-[11px]" style={{ background: 'var(--surface)' }} aria-label={labels.iconPickerPreview}>
          {directive ?? '…'}
        </code>
        <Button
          variant="primary"
          size="sm"
          disabled={!directive}
          className="self-end"
          onClick={() => {
            if (!directive) return;
            onInsert(directive);
            onOpenChange(false);
          }}
        >
          {labels.iconPickerInsert}
        </Button>
      </div>
    </Popover>
  );
}

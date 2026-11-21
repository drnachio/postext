'use client';

import { useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  resolveBodyTextConfig,
  resolveHeadingsConfig,
  type PostextConfig,
  type Resource,
} from 'postext';
import { Button, IconButton, SegmentedControl, Select, cn } from '../ui/index.js';
import {
  DESIGN_ZONES,
  type CoverDesignSettings,
  type DesignZone,
  type RoleStyle,
  type TextRole,
  type ZoneStyle,
} from './model/bookProduction.js';
import { INPUT, type Labels } from './productionUi.js';
import { PICTURE_ACCEPT } from './library/printFiles.js';

const DESIGN_ZONE_LABEL: Record<DesignZone, keyof Labels> = {
  front: 'productionZoneFront',
  spine: 'productionZoneSpine',
  back: 'productionZoneBack',
  flaps: 'productionDesignFlaps',
};

/** A colour or none: the swatch, and a button that clears it. */
function ColorField({ label, value, fallback = '#ffffff', clearLabel, onChange }: {
  label: string;
  value: string | undefined;
  /** The colour in use while none is set (the paper, the book's text):
   *  shown faded, so choosing any other is a change. */
  fallback?: string;
  clearLabel: string;
  onChange: (hex: string | undefined) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="color"
          aria-label={label}
          value={value ?? fallback}
          onChange={(e) => onChange(e.target.value)}
          className={cn('h-6 w-9 cursor-pointer rounded border border-(--pt-control-border) bg-transparent p-0', !value && 'opacity-40')}
        />
        {value && <IconButton label={`${clearLabel}: ${label}`} icon={<X size={12} aria-hidden="true" />} onClick={() => onChange(undefined)} />}
      </span>
    </div>
  );
}

/** The cover's look, shared by every version: a ground for the whole
 *  sheet, one of the book's pictures over it, a ground per zone, and the
 *  colour of the text. Its controls alone, without a heading: the Cover
 *  panel folds them, the designer opens them in its Background layer. */
export function DesignSection({ design, resources, bookTextHex, labels, onChange, onUpload }: {
  design: CoverDesignSettings;
  resources: readonly Resource[];
  /** Upload a picture (into the cover's gallery): its resource id, to
   *  set as the background picture. */
  onUpload?: (file: File) => Promise<string | undefined>;
  /** The book's text colour, the text's until the design sets one. */
  bookTextHex: string;
  labels: Labels;
  onChange: (d: CoverDesignSettings) => void;
}) {
  const pictures = resources.filter((r) => r.kind === 'bitmap' || r.kind === 'svg');
  const uploadRef = useRef<HTMLInputElement>(null);
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const id = file && onUpload ? await onUpload(file) : undefined;
    if (id) set('image', { resourceId: id, ...(design.image?.area ? { area: design.image.area } : {}) });
  };
  const NONE = '__none__';
  const set = <K extends keyof CoverDesignSettings>(key: K, value: CoverDesignSettings[K] | undefined) => {
    const next = { ...design };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  const setZone = (zone: DesignZone, hex: string | undefined) => {
    const zones = { ...design.zones };
    if (hex) zones[zone] = hex;
    else delete zones[zone];
    set('zones', Object.keys(zones).length > 0 ? zones : undefined);
  };
  return (
    <>
      <p className="m-0 text-xs text-(--slate)">{labels.productionDesignIntro}</p>
      <ColorField label={labels.productionDesignBackground} value={design.background} clearLabel={labels.productionDesignClear} onChange={(v) => set('background', v)} />
      <label className="flex flex-col gap-1 text-xs">
        {labels.productionDesignImage}
        <Select
          size="sm"
          value={design.image?.resourceId ?? NONE}
          onValueChange={(id) => set('image', id === NONE ? undefined : { resourceId: id, ...(design.image?.area ? { area: design.image.area } : {}) })}
          options={[
            { value: NONE, label: labels.productionDesignNoImage },
            ...pictures.map((r) => ({ value: r.id, label: r.caption?.trim() || r.altText?.trim() || r.id })),
          ]}
          ariaLabel={labels.productionDesignImage}
        />
      </label>
      {onUpload && (
        <div>
          <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => uploadRef.current?.click()}>{labels.coverUploadPicture}</Button>
          <input ref={uploadRef} type="file" accept={PICTURE_ACCEPT} className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => void upload(e)} />
        </div>
      )}
      {design.image && (
        <SegmentedControl
          size="sm"
          value={design.image.area ?? 'sheet'}
          onValueChange={(area) => set('image', { resourceId: design.image!.resourceId, ...(area === 'front' ? { area } : {}) })}
          options={[{ value: 'sheet', label: labels.productionDesignImageSheet }, { value: 'front', label: labels.productionDesignImageFront }]}
          ariaLabel={labels.productionDesignImage}
        />
      )}
      <p className="m-0 mt-1 text-xs text-(--slate)">{labels.productionDesignZones}</p>
      {DESIGN_ZONES.map((zone) => (
        <ColorField
          key={zone}
          label={String(labels[DESIGN_ZONE_LABEL[zone]])}
          value={design.zones?.[zone]}
          clearLabel={labels.productionDesignClear}
          onChange={(v) => setZone(zone, v)}
        />
      ))}
      <ColorField label={labels.productionDesignTextColor} value={design.textColor} fallback={bookTextHex} clearLabel={labels.productionDesignClear} onChange={(v) => set('textColor', v)} />
    </>
  );
}

/** The type families the book uses: its body, its headings and the fonts
 *  it carries. */
export function bookFamilies(config: PostextConfig): string[] {
  const out = new Set<string>();
  out.add(resolveBodyTextConfig(config.bodyText, config.locale).fontFamily);
  const headings = resolveHeadingsConfig(config.headings);
  out.add(headings.fontFamily);
  for (const l of headings.levels) out.add(l.fontFamily);
  for (const f of config.customFonts ?? []) out.add(f.name);
  return [...out].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/** A role's type: its font, size, weight and alignment; with `more`, as a
 *  text box sets it, its leading, colour, tracking, capitals and the space
 *  after each paragraph too. */
export function RoleFields({ role, legend: ownLegend, style, families, labels, more = false, onChange }: {
  role?: TextRole;
  legend?: string;
  style: RoleStyle;
  families: string[];
  labels: Labels;
  more?: boolean;
  onChange: (s: RoleStyle) => void;
}) {
  const BOOK = '__book__';
  const set = <K extends keyof RoleStyle>(key: K, value: RoleStyle[K] | undefined) => {
    const next = { ...style };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  const legend = ownLegend ?? (role === 'title' ? labels.productionStyleTitle : labels.productionStyleText);
  const numberField = (key: 'lineHeight' | 'tracking' | 'spaceAfter', label: string, min: number, max: number, step: number) => (
    <label className="flex items-center justify-between gap-2">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={style[key] ?? ''}
        placeholder="—"
        onChange={(e) => {
          const n = Number(e.target.value);
          set(key, e.target.value.trim() && Number.isFinite(n) ? n : undefined);
        }}
        className={cn(INPUT, 'w-16')}
      />
    </label>
  );
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 rounded border border-(--rule) p-2">
      <legend className="px-1 text-xs font-semibold">{legend}</legend>
      <label className="flex flex-col gap-1 text-xs">
        {labels.productionStyleFont}
        <Select
          size="sm"
          value={style.fontFamily ?? BOOK}
          onValueChange={(f) => set('fontFamily', f === BOOK ? undefined : f)}
          options={[{ value: BOOK, label: labels.productionStyleBookFont }, ...families.map((f) => ({ value: f, label: f }))]}
          ariaLabel={`${legend}: ${labels.productionStyleFont}`}
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <label className="flex items-center gap-2">
          {labels.productionStyleSize}
          <input
            type="number"
            min={4}
            max={300}
            step={0.5}
            value={style.fontSize ?? ''}
            placeholder="—"
            onChange={(e) => {
              const n = Number(e.target.value);
              set('fontSize', e.target.value.trim() && Number.isFinite(n) && n > 0 ? n : undefined);
            }}
            className={cn(INPUT, 'w-16')}
          />
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={!!style.bold} onChange={(e) => set('bold', e.target.checked || undefined)} />
          {labels.productionStyleBold}
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={!!style.italic} onChange={(e) => set('italic', e.target.checked || undefined)} />
          {labels.productionStyleItalic}
        </label>
      </div>
      <SegmentedControl
        size="sm"
        value={style.align ?? 'left'}
        onValueChange={(a) => set('align', a === 'left' ? undefined : a)}
        options={[
          { value: 'left', label: labels.productionAlignLeft },
          { value: 'center', label: labels.productionAlignCenter },
          { value: 'right', label: labels.productionAlignRight },
          { value: 'justify', label: labels.productionAlignJustify },
        ]}
        ariaLabel={`${legend}: ${labels.productionStyleAlign}`}
      />
      {more && (
        <div className="flex flex-col gap-2 text-xs">
          {numberField('lineHeight', labels.coverStyleLeading, 2, 400, 0.5)}
          {numberField('tracking', labels.coverStyleTracking, -200, 1000, 5)}
          {numberField('spaceAfter', labels.coverStyleSpaceAfter, 0, 200, 0.5)}
          <label className="flex items-center justify-between gap-2">
            {labels.coverStyleColor}
            <span className="flex items-center gap-1">
              <input type="color" aria-label={`${legend}: ${labels.coverStyleColor}`} value={style.color ?? '#000000'} onChange={(e) => set('color', e.target.value)} className="h-6 w-9 cursor-pointer rounded border border-(--pt-control-border) bg-transparent p-0" />
              {style.color && <IconButton label={labels.coverStyleColorClear} icon={<X size={12} aria-hidden="true" />} onClick={() => set('color', undefined)} />}
            </span>
          </label>
          <SegmentedControl
            size="sm"
            value={style.caps ?? 'none'}
            onValueChange={(c) => set('caps', c === 'none' ? undefined : c)}
            options={[
              { value: 'none', label: labels.coverStyleCapsNone },
              { value: 'upper', label: labels.coverStyleCapsUpper },
              { value: 'small', label: labels.coverStyleCapsSmall },
            ]}
            ariaLabel={`${legend}: ${labels.coverStyleCaps}`}
          />
        </div>
      )}
    </fieldset>
  );
}

/** The type of each zone: its title and its text, and where they sit. */
export function ZoneStylesSection({ design, config, hasFlaps, labels, onChange }: {
  design: CoverDesignSettings;
  config: PostextConfig;
  hasFlaps: boolean;
  labels: Labels;
  onChange: (d: CoverDesignSettings) => void;
}) {
  const zones = DESIGN_ZONES.filter((z) => z !== 'flaps' || hasFlaps);
  const [zone, setZone] = useState<DesignZone>('front');
  const shown = zones.includes(zone) ? zone : 'front';
  const families = useMemo(() => bookFamilies(config), [config]);
  const current: ZoneStyle = design.zoneStyles?.[shown] ?? {};
  const setStyle = (next: ZoneStyle) => {
    const all = { ...design.zoneStyles };
    if (Object.keys(next).length > 0) all[shown] = next;
    else delete all[shown];
    const d = { ...design };
    if (Object.keys(all).length > 0) d.zoneStyles = all;
    else delete d.zoneStyles;
    onChange(d);
  };
  const setRole = (role: TextRole, s: RoleStyle) => {
    const next = { ...current };
    if (Object.keys(s).length > 0) next[role] = s;
    else delete next[role];
    setStyle(next);
  };
  return (
    <>
      <p className="m-0 text-xs text-(--slate)">{labels.productionStylesIntro}</p>
      <SegmentedControl
        size="sm"
        value={shown}
        onValueChange={setZone}
        options={zones.map((z) => ({ value: z, label: String(labels[DESIGN_ZONE_LABEL[z]]) }))}
        ariaLabel={labels.productionStyles}
      />
      <RoleFields role="title" style={current.title ?? {}} families={families} labels={labels} onChange={(s) => setRole('title', s)} />
      <RoleFields role="text" style={current.text ?? {}} families={families} labels={labels} onChange={(s) => setRole('text', s)} />
      {shown !== 'spine' && (
        <div className="flex flex-col gap-1 text-xs">
          {labels.productionStyleVertical}
          <SegmentedControl
            size="sm"
            value={current.vertical ?? 'top'}
            onValueChange={(v) => {
              const next = { ...current };
              if (v === 'top') delete next.vertical;
              else next.vertical = v;
              setStyle(next);
            }}
            options={[
              { value: 'top', label: labels.productionVerticalTop },
              { value: 'middle', label: labels.productionVerticalMiddle },
              { value: 'bottom', label: labels.productionVerticalBottom },
            ]}
            ariaLabel={labels.productionStyleVertical}
          />
        </div>
      )}
    </>
  );
}


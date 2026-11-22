'use client';

// The cover's texts, a field per zone of the sheet, written into the
// cover's Markdown frame by frame. The front and the spine take the
// book's title, subtitle and author unless the field replaces them.

import { useId } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { ToggleSwitch } from '../../controls/index.js';
import { coverSlotTexts, hasCoverSlot, setCoverSlotText } from '../coverText.js';
import { ZONE_LABEL } from './coverLabels.js';

/** Zones whose text is the book's metadata until the field replaces it. */
const FROM_METADATA = new Set(['front', 'spine']);

function ZoneText({ slot, value, onChange }: { slot: string; value: string; onChange: (text: string) => void }) {
  const labels = useSandboxLabels();
  const id = useId();
  const key = ZONE_LABEL[slot];
  return (
    <div className="flex flex-col gap-1 px-3 py-1.5">
      <label htmlFor={id} className="text-xs text-(--slate)">{key ? String(labels[key]) : slot}</label>
      <textarea
        id={id}
        dir="auto"
        value={value}
        rows={slot === 'spine' ? 1 : 4}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full resize-y rounded border border-(--rule) bg-(--background) px-2 py-1 font-mono text-xs text-(--foreground) outline-(--brand) focus-visible:outline-2"
      />
    </div>
  );
}

export function CoverTexts({ slots }: { slots: readonly string[] }) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const markdown = useSandboxSelector((s) => s.coverMarkdown);
  const texts = coverSlotTexts(markdown);
  const write = (slot: string, text: string | null) => dispatch({ type: 'SET_COVER_MARKDOWN', payload: setCoverSlotText(markdown, slot, text) });
  return (
    <div className="flex flex-col pb-2">
      <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverTextsIntro}</p>
      {slots.map((slot) => {
        if (!FROM_METADATA.has(slot)) return <ZoneText key={slot} slot={slot} value={texts[slot] ?? ''} onChange={(t) => write(slot, t.trim() ? t : null)} />;
        const own = hasCoverSlot(markdown, slot);
        const key = ZONE_LABEL[slot];
        return (
          <div key={slot}>
            <ToggleSwitch
              label={`${key ? String(labels[key]) : slot}: ${labels.coverOverride}`}
              checked={own}
              onChange={(on) => write(slot, on ? '' : null)}
            />
            {own && <ZoneText slot={slot} value={texts[slot] ?? ''} onChange={(t) => write(slot, t)} />}
          </div>
        );
      })}
    </div>
  );
}

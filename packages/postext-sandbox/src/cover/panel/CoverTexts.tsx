'use client';

// The cover's texts, a field per zone of the sheet, written into the
// cover's Markdown frame by frame. The front and the spine take the
// book's title, subtitle and author unless the field replaces them. On a
// case, a jacket or an endpaper a slot may also have a text for that
// sheet alone (#1673, `:::frame{slot="front" sheet="case"}`), which takes
// the shared text's place there.

import { useEffect, useId, useState } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import type { DocumentMetadata } from 'postext';
import { ToggleSwitch } from '../../controls/index.js';
import { coverSlotTexts, hasCoverSlot, metadataSlotTexts, setCoverSlotText } from '../coverText.js';
import { ZONE_LABEL } from './coverLabels.js';

/** Zones whose text is the book's metadata until the field replaces it. */
const FROM_METADATA = new Set(['front', 'spine']);

function ZoneText({ slot, value, onChange, label }: { slot: string; value: string; onChange: (text: string) => void; label?: string }) {
  const labels = useSandboxLabels();
  const id = useId();
  const key = ZONE_LABEL[slot];
  // The cover's Markdown keeps each text trimmed: the field keeps what is
  // typed (a space before the next word) and takes the stored text only
  // when it differs from it by more than its ends.
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft((d) => (d.trim() === value.trim() ? d : value));
  }, [value]);
  return (
    <div className="flex flex-col gap-1 px-3 py-1.5">
      <label htmlFor={id} className="text-xs text-(--slate)">{label ?? (key ? String(labels[key]) : slot)}</label>
      <textarea
        id={id}
        dir="auto"
        value={draft}
        rows={slot === 'spine' ? 1 : 4}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        className="min-h-11 w-full resize-y rounded border border-(--rule) bg-(--background) px-2 py-1 font-mono text-xs text-(--foreground) outline-(--brand) focus-visible:outline-2"
      />
    </div>
  );
}

/**
 * `sheets`: the names of the shown sheet, most particular first (`case`
 * then `cover`…); a sheet that is the book's cover itself (a paperback's)
 * has no texts of its own.
 */
export function CoverTexts({ slots, sheets, metadata }: { slots: readonly string[]; sheets?: readonly string[]; metadata?: DocumentMetadata }) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const markdown = useSandboxSelector((s) => s.coverMarkdown);
  const texts = coverSlotTexts(markdown);
  const sheetOwn = sheets && sheets.length > 0 && sheets[0] !== 'cover' ? sheets : undefined;
  const ownTexts = sheetOwn ? coverSlotTexts(markdown, sheetOwn) : {};
  const write = (slot: string, text: string | null, on?: readonly string[]) => dispatch({ type: 'SET_COVER_MARKDOWN', payload: setCoverSlotText(markdown, slot, text, on) });
  // What the front and the spine print while no frame replaces them: the
  // frames the cover writes from the metadata, styles and all, which a
  // field switched on starts from (#1675).
  const fromBook = metadataSlotTexts(metadata);
  const plain = (slot: string) => {
    const m = metadata ?? {};
    const parts = slot === 'spine' ? [m.title, m.author] : [m.title, m.subtitle, m.author];
    return parts.filter((p) => typeof p === 'string' && p.trim()).join(slot === 'spine' ? ' · ' : ' / ');
  };
  const zoneName = (slot: string) => (ZONE_LABEL[slot] ? String(labels[ZONE_LABEL[slot]!]) : slot);
  return (
    <div className="flex flex-col pb-2">
      <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverTextsIntro}</p>
      {slots.map((slot) => {
        const shared = !FROM_METADATA.has(slot)
          ? <ZoneText slot={slot} value={texts[slot] ?? ''} onChange={(t) => write(slot, t.trim() ? t : null)} />
          : (() => {
            const own = hasCoverSlot(markdown, slot);
            return (
              <>
                <ToggleSwitch label={`${zoneName(slot)}: ${labels.coverOverride}`} checked={own} onChange={(on) => write(slot, on ? (fromBook[slot] ?? '') : null)} />
                {own ? (
                  <ZoneText slot={slot} value={texts[slot] ?? ''} onChange={(t) => write(slot, t)} />
                ) : plain(slot) ? (
                  <p className="px-3 pb-1.5 text-xs text-(--slate)" dir="auto">{labels.coverTextFromBook.replace('__text__', plain(slot))}</p>
                ) : null}
              </>
            );
          })();
        if (!sheetOwn) return <div key={slot}>{shared}</div>;
        const mine = hasCoverSlot(markdown, slot, sheetOwn);
        return (
          <div key={slot}>
            {shared}
            <ToggleSwitch
              label={`${zoneName(slot)}: ${labels.coverTextSheetOwn}`}
              tooltip={labels.coverTextSheetOwnTooltip.replace('__sheet__', sheetOwn[0]!)}
              checked={mine}
              onChange={(on) => write(slot, on ? (texts[slot] ?? '') : null, sheetOwn)}
            />
            {mine && (
              <ZoneText
                slot={slot}
                label={labels.coverTextSheetField.replace('__zone__', zoneName(slot))}
                value={ownTexts[slot] ?? ''}
                onChange={(t) => write(slot, t, sheetOwn)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

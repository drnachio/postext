'use client';

import { allowedPlaceholdersFor } from 'postext';
import type { DesignContextKind } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import type { SlotKind } from './placementAdapter.js';

/** What a box design reads beyond the heading set: the box's content,
 *  whole or its first paragraph (any `{boxText.<n>}` works). */
const BOX_PLACEHOLDERS = ['boxText', 'boxText.1'] as const;

interface Props {
  onInsert: (placeholderName: string) => void;
  slotKind?: SlotKind;
  /** Placeholders of this slot alone, listed after the slot kind's: the
   *  `{leader}` of a contents part row (#889). */
  extra?: readonly string[];
}

export function PlaceholderPicker({ onInsert, slotKind = 'header', extra = [] }: Props) {
  const labels = useSandboxLabels();

  // Human labels for the names the engine knows. The list itself comes from
  // the engine allow-list for this slot kind, so a placeholder added there
  // shows up here (falling back to its raw name until a label exists).
  const LABELS: Record<string, string | undefined> = {
    pageNumber: labels.headerFooterPlaceholderPageNumber,
    totalPages: labels.headerFooterPlaceholderTotalPages,
    bookTotalPages: labels.headerFooterPlaceholderBookTotalPages,
    title: labels.headerFooterPlaceholderTitle,
    subtitle: labels.headerFooterPlaceholderSubtitle,
    author: labels.headerFooterPlaceholderAuthor,
    publishDate: labels.headerFooterPlaceholderPublishDate,
    chapterTitle: labels.headerFooterPlaceholderChapterTitle,
    chapterNumber: labels.headerFooterPlaceholderChapterNumber,
    chapterTitleAtTop: labels.headerFooterPlaceholderChapterTitleAtTop,
    chapterNumberAtTop: labels.headerFooterPlaceholderChapterNumberAtTop,
    partTitle: labels.headerFooterPlaceholderPartTitle,
    partNumber: labels.headerFooterPlaceholderPartNumber,
    titleText: labels.headerFooterPlaceholderHeadingTitle,
    number: labels.headerFooterPlaceholderHeadingNumber,
    numberDecimal: labels.headerFooterPlaceholderNumberDecimal,
    numberRoman: labels.headerFooterPlaceholderNumberRoman,
    numberRomanLower: labels.headerFooterPlaceholderNumberRomanLower,
    numberAlpha: labels.headerFooterPlaceholderNumberAlpha,
    numberAlphaLower: labels.headerFooterPlaceholderNumberAlphaLower,
    numberWords: labels.headerFooterPlaceholderNumberWords,
    numberWordsLower: labels.headerFooterPlaceholderNumberWordsLower,
    numberOrdinalWords: labels.headerFooterPlaceholderNumberOrdinalWords,
    numberOrdinalWordsLower: labels.headerFooterPlaceholderNumberOrdinalWordsLower,
    numberHan: labels.headerFooterPlaceholderNumberHan,
    headingNumber: labels.headerFooterPlaceholderFrameHeadingNumber,
    leader: labels.headerFooterPlaceholderLeader,
    boxText: labels.headerFooterPlaceholderBoxText,
    'boxText.1': labels.headerFooterPlaceholderBoxTextItem,
  };

  // A box style's design (#1014) is laid out with the heading set, and
  // reads the box's own content besides.
  const kind: DesignContextKind = slotKind === 'box' ? 'heading' : slotKind;
  const own = slotKind === 'box' ? BOX_PLACEHOLDERS : [];
  const items = [...allowedPlaceholdersFor(kind), ...own, ...extra].map((name) => ({
    name,
    label: LABELS[name] ?? name,
  }));

  return (
    <div className="mb-2">
      <div className="mb-1 text-xs" style={{ color: 'var(--slate)' }}>
        {labels.headerFooterPlaceholdersLabel}
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <button
            key={item.name}
            type="button"
            onClick={() => onInsert(item.name)}
            title={`{${item.name}}`}
            className="rounded border px-1.5 py-0.5 text-xs transition-colors"
            style={{
              borderColor: 'var(--rule)',
              color: 'var(--slate)',
              backgroundColor: 'var(--surface)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-1 text-xs" style={{ color: 'var(--slate)' }}>
        <code>{'{attr.key}'}</code>
        {' — '}
        {slotKind === 'box' ? labels.headerFooterPlaceholderBoxAttrHint : labels.headerFooterPlaceholderAttrHint}
      </div>
      {slotKind === 'box' && (
        <div className="mt-1 text-xs" style={{ color: 'var(--slate)' }}>
          <code>{'{boxText.n}'}</code>
          {' — '}
          {labels.headerFooterPlaceholderBoxTextHint}
        </div>
      )}
      {(slotKind === 'header' || slotKind === 'footer') && (
        <div className="mt-1 text-xs" style={{ color: 'var(--slate)' }}>
          <code>{'{firstMark.h2}'}</code>
          {' / '}
          <code>{'{lastMark.h2}'}</code>
          {' — '}
          {labels.headerFooterPlaceholderMarkHint}
        </div>
      )}
    </div>
  );
}

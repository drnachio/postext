'use client';

import { allowedPlaceholdersFor } from 'postext';
import type { DesignContextKind } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext';
import type { SlotKind } from './placementAdapter';

interface Props {
  onInsert: (placeholderName: string) => void;
  slotKind?: SlotKind;
}

export function PlaceholderPicker({ onInsert, slotKind = 'header' }: Props) {
  const labels = useSandboxLabels();

  // Human labels for the names the engine knows. The list itself comes from
  // the engine allow-list for this slot kind, so a placeholder added there
  // shows up here (falling back to its raw name until a label exists).
  const LABELS: Record<string, string | undefined> = {
    pageNumber: labels.headerFooterPlaceholderPageNumber,
    totalPages: labels.headerFooterPlaceholderTotalPages,
    title: labels.headerFooterPlaceholderTitle,
    subtitle: labels.headerFooterPlaceholderSubtitle,
    author: labels.headerFooterPlaceholderAuthor,
    publishDate: labels.headerFooterPlaceholderPublishDate,
    chapterTitle: labels.headerFooterPlaceholderChapterTitle,
    chapterNumber: labels.headerFooterPlaceholderChapterNumber,
    partTitle: labels.headerFooterPlaceholderPartTitle,
    partNumber: labels.headerFooterPlaceholderPartNumber,
    titleText: labels.headerFooterPlaceholderHeadingTitle,
    number: labels.headerFooterPlaceholderHeadingNumber,
    numberDecimal: labels.headerFooterPlaceholderNumberDecimal,
    numberRoman: labels.headerFooterPlaceholderNumberRoman,
    numberRomanLower: labels.headerFooterPlaceholderNumberRomanLower,
    numberAlpha: labels.headerFooterPlaceholderNumberAlpha,
    numberAlphaLower: labels.headerFooterPlaceholderNumberAlphaLower,
  };

  const kind: DesignContextKind = slotKind;
  const items = Array.from(allowedPlaceholdersFor(kind)).map((name) => ({
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
        {labels.headerFooterPlaceholderAttrHint}
      </div>
    </div>
  );
}

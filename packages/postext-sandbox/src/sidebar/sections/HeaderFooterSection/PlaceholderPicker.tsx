'use client';

import { useSandboxLabels } from '../../../context/SandboxContext';

interface Props {
  onInsert: (placeholderName: string) => void;
}

export function PlaceholderPicker({ onInsert }: Props) {
  const labels = useSandboxLabels();

  const ITEMS: { name: string; label: string }[] = [
    { name: 'pageNumber', label: labels.headerFooterPlaceholderPageNumber },
    { name: 'totalPages', label: labels.headerFooterPlaceholderTotalPages },
    { name: 'title', label: labels.headerFooterPlaceholderTitle },
    { name: 'subtitle', label: labels.headerFooterPlaceholderSubtitle },
    { name: 'author', label: labels.headerFooterPlaceholderAuthor },
    { name: 'publishDate', label: labels.headerFooterPlaceholderPublishDate },
    { name: 'chapterTitle', label: labels.headerFooterPlaceholderChapterTitle },
  ];

  return (
    <div className="mb-2">
      <div className="mb-1 text-xs" style={{ color: 'var(--slate)' }}>
        {labels.headerFooterPlaceholdersLabel}
      </div>
      <div className="flex flex-wrap gap-1">
        {ITEMS.map((item) => (
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
    </div>
  );
}

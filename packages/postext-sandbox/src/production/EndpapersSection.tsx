'use client';

/**
 * What a book puts on its endpapers (a case's): the collection whose
 * catalogue its advertisements come from, and for the front and back
 * endpaper a paper colour and, on each page (the pastedown, glued to the
 * board, and the flyleaf, the free leaf), nothing, an advertisement or a
 * text.
 */

import { X } from 'lucide-react';
import { IconButton, Select } from '../ui/index.js';
import type { BookEndpapers, CollectionRecord, EndpaperPage, EndpaperSide } from './library/collections.js';
import { Fold } from './Fold.js';
import { INPUT, type Labels } from './productionUi.js';

const NONE = '';
const TEXT = '__text__';

export function EndpapersSection({ endpapers, collections, labels, onChange }: {
  endpapers: BookEndpapers | undefined;
  collections: readonly CollectionRecord[];
  labels: Labels;
  onChange: (next: BookEndpapers | undefined) => void;
}) {
  const collection = collections.find((c) => c.id === endpapers?.collectionId);
  const ads = collection?.ads ?? [];
  const set = (next: BookEndpapers) => onChange(Object.keys(next).length ? next : undefined);
  const setSide = (key: 'front' | 'back', side: EndpaperSide) => {
    const next = { ...endpapers };
    if (Object.keys(side).length) next[key] = side;
    else delete next[key];
    set(next);
  };
  const setPage = (key: 'front' | 'back', page: 'pastedown' | 'flyleaf', value: EndpaperPage | undefined) => {
    const side = { ...endpapers?.[key] };
    if (value && Object.keys(value).length) side[page] = value;
    else delete side[page];
    setSide(key, side);
  };
  const count = (['front', 'back'] as const).filter((k) => endpapers?.[k]).length;

  return (
    <Fold title={labels.productionEndpapers} {...(count ? { note: String(count) } : {})}>
      <p className="m-0 text-xs text-(--slate)">{labels.productionEndpapersIntro}</p>
      <label className="flex flex-col gap-1 text-xs">
        {labels.productionEndpaperCollection}
        <Select
          size="sm"
          value={collection?.id ?? NONE}
          onValueChange={(id) => {
            const next = { ...endpapers };
            if (id) next.collectionId = id;
            else delete next.collectionId;
            set(next);
          }}
          options={[{ value: NONE, label: labels.productionEndpaperNoCollection }, ...collections.map((c) => ({ value: c.id, label: c.name }))]}
          ariaLabel={labels.productionEndpaperCollection}
        />
      </label>
      {collections.length === 0 && <p className="m-0 text-xs text-(--slate)">{labels.productionEndpaperNoCollections}</p>}

      {(['front', 'back'] as const).map((key) => {
        const side = endpapers?.[key];
        return (
          <div key={key} className="flex flex-col gap-2 border-t border-(--rule) pt-2 text-xs">
            <h4 className="m-0 font-semibold">{key === 'front' ? labels.productionSheetEndpaperFront : labels.productionSheetEndpaperBack}</h4>
            <div className="flex items-center justify-between gap-2">
              <span>{labels.productionEndpaperColour}</span>
              <span className="flex items-center gap-1">
                <input
                  type="color"
                  aria-label={labels.productionEndpaperColour}
                  value={side?.colour ?? '#ffffff'}
                  onChange={(e) => setSide(key, { ...side, colour: e.target.value })}
                  className="h-6 w-9 cursor-pointer rounded border border-(--pt-control-border) bg-transparent p-0"
                />
                {side?.colour && (
                  <IconButton label={labels.productionDesignClear} icon={<X size={12} aria-hidden="true" />} onClick={() => { const s = { ...side }; delete s.colour; setSide(key, s); }} />
                )}
              </span>
            </div>
            {(['pastedown', 'flyleaf'] as const).map((page) => {
              const p = side?.[page];
              const value = p?.ad && ads.some((a) => a.id === p.ad) ? p.ad : p?.text !== undefined ? TEXT : NONE;
              return (
                <div key={page} className="flex flex-col gap-1">
                  <label className="flex flex-col gap-1">
                    {page === 'pastedown' ? labels.productionEndpaperPastedown : labels.productionEndpaperFlyleaf}
                    <Select
                      size="sm"
                      value={value}
                      onValueChange={(v) => setPage(key, page, v === NONE ? undefined : v === TEXT ? { text: p?.text ?? '' } : { ad: v })}
                      options={[
                        { value: NONE, label: labels.productionEndpaperBlank },
                        { value: TEXT, label: labels.productionEndpaperText },
                        ...ads.map((a) => ({ value: a.id, label: a.title })),
                      ]}
                      ariaLabel={page === 'pastedown' ? labels.productionEndpaperPastedown : labels.productionEndpaperFlyleaf}
                    />
                  </label>
                  {value === TEXT && (
                    <textarea
                      rows={3}
                      value={p?.text ?? ''}
                      aria-label={labels.productionEndpaperText}
                      onChange={(e) => setPage(key, page, { text: e.target.value })}
                      className={`${INPUT} font-mono`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </Fold>
  );
}

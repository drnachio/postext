'use client';

// The collection's catalogue in the Cover panel (#1673): its titles in
// order, each with an id, its title and a picture of the book's, added,
// removed and moved up or down; and which of them this book is. The
// cover's text sets them with `::catalogue`, the designer's catalogue item
// lays their pictures out. Every change is a step of the history.

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { ProductionConfig } from 'postext/production';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { FieldRow, SelectInput, TextControl, TextInput } from '../../controls/index.js';
import { Button, IconButton } from '../../ui/index.js';
import { setCollection } from '../versions.js';
import { addTitle, catalogueIdValid, moveTitle, patchTitle, removeTitle, setVolume, type CatalogueEntry } from '../collection.js';

/** A title's id, written on Enter or on leaving the field; one that is
 *  not valid or another title has is shown and not written. */
function IdField({ entry, taken, onCommit }: { entry: CatalogueEntry; taken: (id: string) => boolean; onCommit: (id: string) => void }) {
  const labels = useSandboxLabels();
  const [draft, setDraft] = useState(entry.id);
  useEffect(() => setDraft(entry.id), [entry.id]);
  const next = draft.trim();
  const problem = next === entry.id ? null : !catalogueIdValid(next) ? labels.coverTextBoxNameInvalid : taken(next) ? labels.coverCatalogueIdTaken : null;
  const commit = () => { if (next !== entry.id && !problem) onCommit(next); };
  return (
    <form onSubmit={(e) => { e.preventDefault(); commit(); }}>
      <FieldRow label={labels.coverCatalogueId} tooltip={labels.coverCatalogueIdTooltip} hint={problem ? <span role="alert" className="text-(--destructive)">{problem}</span> : undefined}>
        <TextControl value={draft} onChange={setDraft} onBlur={commit} widthCh={12} />
      </FieldRow>
    </form>
  );
}

export function CatalogueSection({ production, write }: { production: ProductionConfig | undefined; write: (next: ProductionConfig | undefined) => void }) {
  const labels = useSandboxLabels();
  const resources = useSandboxSelector((s) => s.resources);
  const collection = production?.collection;
  const catalogue = collection?.catalogue ?? [];
  const pictures = resources.filter((r) => (r.kind === 'bitmap' && r.bitmap) || (r.kind === 'svg' && r.svg));
  const put = (next: NonNullable<ProductionConfig['collection']>) => write(setCollection(production, next));

  return (
    <div className="mt-1 flex flex-col border-t border-(--rule) pt-1 pb-2">
      <h3 className="m-0 px-3 pt-1 text-xs font-semibold">{labels.coverCatalogue}</h3>
      <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverCatalogueIntro}</p>
      {catalogue.length === 0 && <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverCatalogueEmpty}</p>}
      <ol className="m-0 flex list-none flex-col p-0">
        {catalogue.map((entry, i) => (
          <li key={entry.id} className="flex flex-col border-b border-(--rule) py-1" aria-label={labels.coverCatalogueEntry.replace('__n__', String(i + 1))}>
            <div className="flex items-center gap-1 px-2">
              <span className="min-w-0 flex-1 truncate px-1 text-xs font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {i + 1}. {entry.title || entry.id}
              </span>
              <IconButton label={labels.coverCatalogueUp} icon={<ArrowUp size={13} />} disabled={i === 0} onClick={() => put(moveTitle(collection, entry.id, -1))} />
              <IconButton label={labels.coverCatalogueDown} icon={<ArrowDown size={13} />} disabled={i === catalogue.length - 1} onClick={() => put(moveTitle(collection, entry.id, 1))} />
              <IconButton label={labels.coverCatalogueRemove} icon={<Trash2 size={13} />} destructive onClick={() => put(removeTitle(collection, entry.id))} />
            </div>
            <TextInput label={labels.coverCatalogueTitle} value={entry.title} widthCh={18} onChange={(title) => put(patchTitle(collection, entry.id, { title }))} />
            <IdField entry={entry} taken={(id) => catalogue.some((e) => e.id === id)} onCommit={(id) => put(patchTitle(collection, entry.id, { id }))} />
            <SelectInput
              label={labels.coverCataloguePicture}
              value={entry.resource ?? ''}
              options={[{ value: '', label: labels.coverDesignImageNone }, ...pictures.map((r) => ({ value: r.id, label: r.id }))]}
              onChange={(resource) => put(patchTitle(collection, entry.id, { resource: resource || undefined }))}
            />
          </li>
        ))}
      </ol>
      <div className="px-3 py-2">
        <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => put(addTitle(collection))}>{labels.coverCatalogueAdd}</Button>
      </div>
      {catalogue.length > 0 && (
        <SelectInput
          label={labels.coverCollectionVolume}
          tooltip={labels.coverCollectionVolumeTooltip}
          value={collection?.volume ?? ''}
          options={[{ value: '', label: labels.coverCollectionVolumeNone }, ...catalogue.map((e, i) => ({ value: e.id, label: `${i + 1}. ${e.title || e.id}` }))]}
          onChange={(volume) => put(setVolume(collection, volume || undefined))}
        />
      )}
    </div>
  );
}

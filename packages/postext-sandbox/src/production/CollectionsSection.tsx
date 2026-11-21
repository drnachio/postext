'use client';

/**
 * The Cover panel's library of collections: each with its catalogue of
 * advertisements for the endpapers (novelties, titles, the collection
 * itself), pictures made for an endpaper's page, which each book then
 * picks from (./EndpapersSection.tsx).
 */

import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, ConfirmPopover, IconButton, announce } from '../ui/index.js';
import { fill } from '../print/fillTokens.js';
import { PICTURE_ACCEPT, pictureName, readPictureFile } from './library/printFiles.js';
import { newCollectionId, type CatalogueAd, type CollectionRecord } from './library/collections.js';
import { pictureSize, useObjectUrl } from './library/coverImages.js';
import { Fold } from './Fold.js';
import { deleteCollection, putCollection } from './store/productionStore.js';
import { INPUT, type Labels } from './productionUi.js';
import { useCollections } from './store/useProduction.js';

function Thumb({ ad }: { ad: CatalogueAd }) {
  const url = useObjectUrl(ad.bytes, ad.mime);
  return (
    <span className="h-10 w-8 shrink-0 overflow-hidden rounded border border-(--rule) bg-white">
      {url && <img src={url} alt="" className="h-full w-full object-contain" />}
    </span>
  );
}

function CollectionCard({ collection, labels }: { collection: CollectionRecord; labels: Labels }) {
  const ref = useRef<HTMLInputElement>(null);
  const save = (next: Partial<CollectionRecord>) => void putCollection({ ...collection, ...next });
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    const added: CatalogueAd[] = [];
    for (const file of files) {
      const got = await readPictureFile(file);
      if (!got || got === 'postscript') {
        announce(got ? fill(labels.productionPicturePostscript, { name: file.name }) : labels.productionPictureUnreadable);
        continue;
      }
      for (const { bytes, mime, page } of got) {
        const size = await pictureSize(bytes, mime).catch(() => ({ width: 100, height: 140 }));
        added.push({ id: newCollectionId('ad'), title: pictureName(file.name, page), mime, bytes, ...size });
      }
    }
    if (added.length) save({ ads: [...collection.ads, ...added] });
  };
  return (
    <li className="flex flex-col gap-2 border-t border-(--rule) pt-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          aria-label={labels.productionCollectionName}
          defaultValue={collection.name}
          onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== collection.name) save({ name }); }}
          className={`${INPUT} min-w-0 flex-1 font-semibold`}
        />
        <ConfirmPopover message={fill(labels.productionGalleryDelete, { name: collection.name })} confirmLabel={labels.productionLogoDelete} onConfirm={() => void deleteCollection(collection.id)}>
          {({ open }) => <IconButton label={fill(labels.productionGalleryDelete, { name: collection.name })} icon={<Trash2 size={14} aria-hidden="true" />} onClick={open} />}
        </ConfirmPopover>
      </div>
      {collection.ads.length === 0 && <p className="m-0 text-xs text-(--slate)">{labels.productionCatalogueEmpty}</p>}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
        {collection.ads.map((ad) => (
          <li key={ad.id} className="flex items-center gap-2">
            <Thumb ad={ad} />
            <input
              type="text"
              aria-label={labels.productionAdTitle}
              defaultValue={ad.title}
              onBlur={(e) => { const title = e.target.value.trim(); if (title && title !== ad.title) save({ ads: collection.ads.map((a) => (a.id === ad.id ? { ...a, title } : a)) }); }}
              className={`${INPUT} min-w-0 flex-1`}
            />
            <IconButton label={fill(labels.productionGalleryDelete, { name: ad.title })} icon={<Trash2 size={14} aria-hidden="true" />} onClick={() => save({ ads: collection.ads.filter((a) => a.id !== ad.id) })} />
          </li>
        ))}
      </ul>
      <div>
        <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => ref.current?.click()}>{labels.productionAdUpload}</Button>
      </div>
      <input ref={ref} type="file" multiple accept={PICTURE_ACCEPT} className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => void upload(e)} />
    </li>
  );
}

export function CollectionsSection({ labels }: { labels: Labels }) {
  const collections = useCollections();
  const [name, setName] = useState('');
  const add = () => {
    const n = name.trim();
    if (!n) return;
    void putCollection({ id: newCollectionId('col'), name: n, ads: [], updatedAt: Date.now() });
    setName('');
  };
  return (
    <Fold title={labels.productionCollections} {...(collections.length ? { note: String(collections.length) } : {})}>
      <p className="m-0 text-xs text-(--slate)">{labels.productionCollectionsIntro}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {collections.map((c) => <CollectionCard key={c.id} collection={c} labels={labels} />)}
      </ul>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          placeholder={labels.productionCollectionName}
          aria-label={labels.productionCollectionName}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          className={`${INPUT} min-w-0 flex-1`}
        />
        <Button variant="outline" size="sm" icon={<Plus size={13} />} disabled={!name.trim()} onClick={add}>{labels.productionCollectionAdd}</Button>
      </div>
    </Fold>
  );
}

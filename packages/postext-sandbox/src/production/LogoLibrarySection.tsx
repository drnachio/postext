'use client';

/**
 * The Cover panel's logo library: the publisher's, the collections' and
 * seals, uploaded once and placed on any book's cover from the designer.
 * Each keeps its clear space; the library goes between users as a file.
 */

import { useRef } from 'react';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { Button, ConfirmPopover, IconButton, NumberField, Select, announce } from '../ui/index.js';
import { downloadBytes } from '../storage/persistence.js';
import { fill } from '../print/fillTokens.js';
import { PICTURE_ACCEPT, pictureName, readPictureFile } from './library/printFiles.js';
import {
  DEFAULT_LOGO_CLEARANCE,
  LOGO_GROUPS,
  exportLogos,
  importLogos,
  newLogoId,
  type LogoGroup,
  type LogoRecord,
} from './library/logoLibrary.js';
import { deleteLogo, putLogos } from './store/productionStore.js';
import { useLogos } from './store/useProduction.js';
import { pictureSize, useObjectUrl } from './library/coverImages.js';
import { INPUT, type Labels } from './productionUi.js';
import { Fold } from './Fold.js';

const GROUP_LABEL: Record<LogoGroup, keyof Labels> = {
  publisher: 'productionLogoGroupPublisher',
  collection: 'productionLogoGroupCollection',
  seal: 'productionLogoGroupSeal',
};

function Thumb({ logo }: { logo: LogoRecord }) {
  const url = useObjectUrl(logo.bytes, logo.mime);
  return url ? <img src={url} alt="" className="h-8 w-12 shrink-0 rounded border border-(--rule) bg-white object-contain p-0.5" /> : null;
}

export function LogoLibrary({ labels }: { labels: Labels }) {
  const logos = useLogos();
  const uploadRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    const added: LogoRecord[] = [];
    for (const file of files) {
      const got = await readPictureFile(file);
      if (!got || got === 'postscript') {
        announce(got ? fill(labels.productionPicturePostscript, { name: file.name }) : labels.productionPictureUnreadable);
        continue;
      }
      for (const { bytes, mime, page } of got) {
        const size = await pictureSize(bytes, mime).catch(() => ({ width: 100, height: 100 }));
        added.push({
          id: newLogoId(),
          name: pictureName(file.name, page),
          group: 'publisher',
          clearance: DEFAULT_LOGO_CLEARANCE,
          mime,
          bytes,
          ...size,
          updatedAt: Date.now(),
        });
      }
    }
    await putLogos(added);
  };
  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const read = importLogos(JSON.parse(await file.text()));
      if (!read.ok || read.logos.length === 0) {
        announce(labels.productionLogosImportFailed);
        return;
      }
      await putLogos(read.logos);
      announce(fill(labels.productionLogosImported, { count: String(read.logos.length) }));
    } catch {
      announce(labels.productionLogosImportFailed);
    }
  };
  const change = (logo: LogoRecord, patch: Partial<LogoRecord>) => void putLogos([{ ...logo, ...patch, updatedAt: Date.now() }]);

  return (
    <Fold title={labels.productionLogos} note={logos.length > 0 ? String(logos.length) : undefined}>
      <p className="m-0 text-xs text-(--slate)">{logos.length === 0 ? labels.productionLogoEmpty : labels.productionLogosIntro}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 text-xs">
        {logos.map((logo) => (
          <li key={logo.id} className="flex flex-col gap-1 border-t border-(--rule) pt-2">
            <div className="flex items-center gap-2">
              <Thumb logo={logo} />
              <input
                type="text"
                aria-label={labels.productionVersionName}
                defaultValue={logo.name}
                onBlur={(e) => { if (e.target.value.trim() && e.target.value !== logo.name) change(logo, { name: e.target.value.trim() }); }}
                className={`${INPUT} min-w-0 flex-1`}
              />
              <ConfirmPopover message={`${labels.productionLogoDelete}: ${logo.name}`} confirmLabel={labels.productionLogoDelete} onConfirm={() => void deleteLogo(logo.id)}>
                {({ open }) => <IconButton label={`${labels.productionLogoDelete}: ${logo.name}`} icon={<Trash2 size={14} aria-hidden="true" />} onClick={open} />}
              </ConfirmPopover>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Select
                size="sm"
                value={logo.group}
                onValueChange={(group) => change(logo, { group })}
                options={LOGO_GROUPS.map((g) => ({ value: g, label: String(labels[GROUP_LABEL[g]]) }))}
                ariaLabel={`${logo.name}: ${labels.productionLogoGroupPublisher}`}
              />
              <label className="flex items-center gap-1">
                <span className="text-(--slate)">{labels.coverLogoClearance}</span>
                <NumberField value={logo.clearance} onValueChange={(v) => change(logo, { clearance: Math.max(0, v) })} step={0.5} min={0} widthCh={5} ariaLabel={`${logo.name}: ${labels.coverLogoClearance}`} />
              </label>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => uploadRef.current?.click()}>{labels.productionLogoUpload}</Button>
        <Button variant="outline" size="sm" icon={<Upload size={13} />} onClick={() => importRef.current?.click()}>{labels.productionLogoImport}</Button>
        {logos.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            icon={<Download size={13} />}
            onClick={() => downloadBytes(JSON.stringify(exportLogos(logos)), 'logos.postext-logos.json', 'application/json')}
          >
            {labels.productionLogoExport}
          </Button>
        )}
      </div>
      <input ref={uploadRef} type="file" multiple accept={PICTURE_ACCEPT} className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => void upload(e)} />
      <input ref={importRef} type="file" accept=".json,application/json" className="hidden" aria-hidden="true" tabIndex={-1} onChange={(e) => void importFile(e)} />
    </Fold>
  );
}

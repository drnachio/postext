'use client';

// The Books panel's "New book from an InDesign package": a zipped package
// that holds more than one IDML document asks which one becomes the book
// (#1538). The one picked goes to the import dialog with the package,
// whose fonts and linked pictures the import takes.

import { useId } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { FileText, X } from 'lucide-react';
import { useSandboxLabels } from '../context/SandboxContext.js';
import { IconButton, Button, usePortalContainer } from '../ui/index.js';
import { POPUP_SURFACE, POPUP_Z_INDEX } from '../ui/layout/surface.js';
import { isolate } from '../word/WordImportDialog.js';
import type { IdmlPackageFile } from './sandboxIdmlImport.js';

export interface IdmlPackageDialogProps {
  pkg: IdmlPackageFile | null;
  onChoose: (path: string) => void;
  onClose: () => void;
}

const sizeOf = (bytes: number | undefined): string => (bytes === undefined ? '' : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function IdmlPackageDialog({ pkg, onChoose, onClose }: IdmlPackageDialogProps) {
  const labels = useSandboxLabels();
  const container = usePortalContainer();
  const titleId = useId();
  return (
    <Dialog.Root open={pkg !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      {pkg && (
        <Dialog.Portal container={container}>
          <Dialog.Backdrop className="fixed inset-0" style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }} />
          <Dialog.Popup
            data-postext-popup=""
            data-testid="idml-package-dialog"
            aria-labelledby={titleId}
            className="fixed left-1/2 top-1/2 flex max-h-[calc(100dvh-16px)] -translate-x-1/2 -translate-y-1/2 flex-col"
            style={{ ...POPUP_SURFACE, zIndex: POPUP_Z_INDEX, width: 'min(560px, calc(100vw - 16px))', fontSize: 13, lineHeight: '19px' }}
          >
            <div className="flex items-start justify-between gap-2 px-4 pt-3">
              <Dialog.Title id={titleId} style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: '10px 0 0', overflowWrap: 'anywhere' }}>
                {labels.idmlPackageChooseTitle.replace('__file__', isolate(pkg.name))}
              </Dialog.Title>
              <IconButton label={labels.wordCancel} icon={<X size={14} aria-hidden="true" />} onClick={onClose} />
            </div>
            <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-4 pb-3">
              <Dialog.Description className="text-xs text-(--slate)" style={{ margin: 0 }}>
                {labels.idmlPackageChooseIntro.replace('__count__', String(pkg.archive.documents.length))}
              </Dialog.Description>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {pkg.archive.documents.map((path, i) => {
                  const name = path.split('/').pop() ?? path;
                  const folder = path.slice(0, path.length - name.length).replace(/\/$/, '');
                  return (
                    <li key={path}>
                      <Button
                        variant="outline"
                        size="sm"
                        autoFocus={i === 0}
                        icon={<FileText size={14} aria-hidden="true" />}
                        onClick={() => onChoose(path)}
                        className="h-auto min-h-11 w-full justify-start py-1.5 text-start"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="font-semibold" style={{ overflowWrap: 'anywhere' }}>{isolate(name)}</span>
                          <span className="text-xs text-(--slate)" style={{ overflowWrap: 'anywhere' }}>
                            {[folder && isolate(folder), sizeOf(pkg.archive.size(path))].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex justify-end border-t border-(--pt-control-border) px-4 py-3">
              <Button variant="outline" size="sm" onClick={onClose}>{labels.wordCancel}</Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}

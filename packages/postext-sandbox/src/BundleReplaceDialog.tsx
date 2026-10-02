'use client';

import { useRef } from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { useSandboxBundleReplacePrompt, useSandboxLabels } from './context/SandboxContext';
import { Button, usePortalContainer } from './ui';
import { POPUP_SURFACE, POPUP_Z_INDEX } from './ui/surface';

/** Asks, when a host bundle link (`#recipe=…`) names a book the reader
 *  imported before, whether to open their copy or replace it with the
 *  published one. Escape keeps the copy. */
export function BundleReplaceDialog() {
  const labels = useSandboxLabels();
  const { prompt, answer } = useSandboxBundleReplacePrompt();
  const container = usePortalContainer();
  const keepRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog.Root open={prompt !== null} onOpenChange={(open) => { if (!open) answer(false); }}>
      <AlertDialog.Portal container={container}>
        <AlertDialog.Backdrop
          className="fixed inset-0"
          style={{ zIndex: POPUP_Z_INDEX, backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
        />
        <AlertDialog.Popup
          data-postext-popup=""
          initialFocus={keepRef}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            ...POPUP_SURFACE,
            zIndex: POPUP_Z_INDEX,
            width: 'min(420px, calc(100vw - 32px))',
            padding: 16,
            fontSize: 13,
            lineHeight: '19px',
          }}
        >
          <AlertDialog.Title style={{ fontSize: 15, lineHeight: '20px', fontWeight: 600, margin: '0 0 8px' }}>
            {labels.hashBundleReplaceTitle}
          </AlertDialog.Title>
          <AlertDialog.Description style={{ margin: '0 0 16px' }}>
            {labels.hashBundleReplaceMessage.replace('__name__', prompt?.name ?? '')}
          </AlertDialog.Description>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button ref={keepRef} variant="outline" size="sm" onClick={() => answer(false)}>
              {labels.hashBundleReplaceKeep}
            </Button>
            <Button variant="primary" size="sm" onClick={() => answer(true)}>
              {labels.hashBundleReplaceConfirm}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

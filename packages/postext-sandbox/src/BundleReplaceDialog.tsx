'use client';

import { useRef } from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { useSandboxBundleReplacePrompt, useSandboxLabels } from './context/SandboxContext';
import { Button, usePortalContainer } from './ui';
import { POPUP_SURFACE, POPUP_Z_INDEX } from './ui/surface';

/** Asks, when a link names a book the reader has their own version of — a
 *  host bundle link (`#recipe=…`) to a book imported before, or a homepage
 *  link (`restore=ask`) to a preset they edited — whether to open their
 *  version or replace it with the published one. Escape keeps theirs. */
export function BundleReplaceDialog() {
  const labels = useSandboxLabels();
  const { prompt, answer } = useSandboxBundleReplacePrompt();
  const container = usePortalContainer();
  const keepRef = useRef<HTMLButtonElement>(null);
  const preset = prompt?.kind === 'preset';

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
            {preset ? labels.presetDraftReplaceTitle : labels.hashBundleReplaceTitle}
          </AlertDialog.Title>
          <AlertDialog.Description style={{ margin: '0 0 16px' }}>
            {(preset ? labels.presetDraftReplaceMessage : labels.hashBundleReplaceMessage).replace('__name__', prompt?.name ?? '')}
          </AlertDialog.Description>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button ref={keepRef} variant="outline" size="sm" onClick={() => answer(false)}>
              {preset ? labels.presetDraftReplaceKeep : labels.hashBundleReplaceKeep}
            </Button>
            <Button variant="primary" size="sm" onClick={() => answer(true)}>
              {preset ? labels.presetDraftReplaceConfirm : labels.hashBundleReplaceConfirm}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

'use client';

/** The cover designer's top bar: its title and the version, undo and
 *  redo, the preview or editing mode, and closing it. */

import { Dialog } from '@base-ui/react/dialog';
import { Redo2, Undo2, X } from 'lucide-react';
import { IconButton, SegmentedControl } from '../../ui/index.js';
import { closeCoverDesigner } from '../store/coverDesignerStore.js';
import type { Labels } from '../productionUi.js';

export function DesignerHeader({ labels, version, canUndo, canRedo, mode, onTravel, onMode }: {
  labels: Labels;
  version: string | undefined;
  canUndo: boolean;
  canRedo: boolean;
  mode: 'preview' | 'edit';
  onTravel: (dir: 'undo' | 'redo') => void;
  onMode: (mode: 'preview' | 'edit') => void;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-(--rule) px-3 py-2">
      <Dialog.Title className="m-0 text-sm font-semibold">{labels.coverDesignerTitle}</Dialog.Title>
      {version && <span className="text-xs text-(--slate)">{version}</span>}
      <div className="ms-auto flex items-center gap-2">
        <IconButton label={labels.coverUndo} icon={<Undo2 size={15} aria-hidden="true" />} disabled={!canUndo} onClick={() => onTravel('undo')} />
        <IconButton label={labels.coverRedo} icon={<Redo2 size={15} aria-hidden="true" />} disabled={!canRedo} onClick={() => onTravel('redo')} />
        <SegmentedControl
          size="sm"
          value={mode}
          onValueChange={onMode}
          options={[{ value: 'preview', label: labels.coverDesignerPreview }, { value: 'edit', label: labels.coverDesignerEdit }]}
          ariaLabel={labels.coverDesignerMode}
        />
        <IconButton label={labels.coverDesignerClose} icon={<X size={16} aria-hidden="true" />} onClick={closeCoverDesigner} />
      </div>
    </header>
  );
}

'use client';

// Which design the shown sheet is drawn with (#1673): the book's cover
// design, or one of its own for a case, a jacket or an endpaper (both
// endpapers' shared one, or this endpaper's alone). A new one starts as a
// copy of the book's; going back to the book's drops it. Each choice is a
// step of the history. A paperback's cover has no choice: its design is
// the book's.

import type { CoverSheetName } from 'postext/production';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { SelectInput } from '../../controls/index.js';
import type { SandboxLabels } from '../../types/labels.js';
import { chooseSheetDesign, sheetDesignChoices } from '../sheetDesign.js';
import { useEditedDesign } from '../useEditedDesign.js';

const OWN_LABEL: Partial<Record<CoverSheetName, keyof SandboxLabels>> = {
  case: 'coverSheetDesignOwn',
  jacket: 'coverSheetDesignOwn',
  endpapers: 'coverSheetDesignEndpapers',
  endpaperFront: 'coverSheetDesignEndpaperOwn',
  endpaperBack: 'coverSheetDesignEndpaperOwn',
};

export function SheetDesignChoice() {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const cover = useSandboxSelector((s) => s.config.cover);
  const { names, target } = useEditedDesign();
  const choices = sheetDesignChoices(names);
  if (choices.length === 0) return null;
  return (
    <SelectInput
      label={labels.coverSheetDesign}
      tooltip={labels.coverSheetDesignTooltip}
      value={target && choices.includes(target) ? target : ''}
      options={[
        { value: '', label: labels.coverSheetDesignBook },
        ...[...choices].reverse().map((n) => ({ value: n, label: String(labels[OWN_LABEL[n] ?? 'coverSheetDesignOwn']) })),
      ]}
      onChange={(v) => dispatch({
        type: 'UPDATE_CONFIG',
        payload: { cover: chooseSheetDesign(cover, names, (v || null) as CoverSheetName | null) },
        history: { merge: false },
      })}
    />
  );
}

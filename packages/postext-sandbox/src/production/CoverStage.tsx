'use client';

/**
 * What the preview shows while the Cover panel is open: the sheet chosen
 * there (the cover or the case, the jacket, an endpaper, a promotional
 * picture) as it is now, instead of the book's pages, which are not what
 * the panel works on. The designer opens from here too.
 */

import { useMemo } from 'react';
import { useSandboxLabels, useSandboxSelector } from '../context/SandboxContext.js';
import { Pencil } from 'lucide-react';
import { Button, Select } from '../ui/index.js';
import { bookTrimMm, coverDocumentInput, isPromo, pickSheet, sheetChoices } from './model/bookProduction.js';
import { CoverCanvas } from './canvas/CoverCanvas.js';
import { chooseCoverSheet, openCoverDesigner, useCoverSheet } from './store/coverDesignerStore.js';
import { SHEET_LABEL, isCaseCoverOf } from './SheetPreview.js';
import { useCollections, useCoverGallery, useCoverWorkspace, useLogos, useMirror } from './store/useProduction.js';
import { endpaperInput } from './library/collections.js';

const NO_ITEMS: never[] = [];
const noop = () => {};

export function CoverStage() {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const bookResources = useSandboxSelector((s) => s.resources);
  const { record, version, sheets } = useCoverWorkspace();
  const library = useLogos();
  const [gallery] = useCoverGallery();
  const collections = useCollections();
  const chosen = useCoverSheet();
  const design = useMemo(() => record?.design ?? {}, [record]);
  const mirror = useMirror(design, bookResources, sheets?.measures.designMargin, gallery);
  const choices = sheets ? sheetChoices(sheets) : [];
  const shown = choices.includes(chosen) ? chosen : 'cover';
  const endpaper = useMemo(() => endpaperInput(shown, record?.endpapers, collections), [shown, record?.endpapers, collections]);
  const sheet = useMemo(() => (sheets ? pickSheet(sheets, shown, bookTrimMm(config)) : null), [sheets, shown, config]);
  // A screen picture carries no finishes: they are plates for the press.
  const input = useMemo(
    () => (sheet && version && record
      ? coverDocumentInput(sheet, version, record.texts, config, design, bookResources, { workIsbnLabel: labels.productionWorkIsbnCaption, ...(endpaper ? { endpaper } : {}),
        logos: library,
        gallery,
        ...(mirror ? { mirror } : {}),
        ...(isPromo(shown) ? { hidden: new Set(['finishes'] as const) } : {}),
      })
      : null),
    [sheet, version, record, config, design, bookResources, library, gallery, mirror, shown, labels.productionWorkIsbnCaption, endpaper],
  );

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--surface)', fontSize: 13, lineHeight: '19px' }}>
      <div className="flex items-center gap-2 border-b border-(--rule) bg-(--background) px-3 py-1.5 text-xs">
        <span className="font-semibold">{labels.navProduction}</span>
        {version && <span className="text-(--slate)">{version.name}</span>}
        <span className="ms-auto flex items-center gap-2">
          {sheets && choices.length > 1 && (
            <Select
              size="sm"
              value={shown}
              onValueChange={chooseCoverSheet}
              options={choices.map((c) => ({ value: c, label: String(labels[c === 'cover' && isCaseCoverOf(sheets) ? 'productionSheetCase' : SHEET_LABEL[c]]) }))}
              ariaLabel={labels.productionSheet}
            />
          )}
          {input && <Button variant="outline" size="sm" icon={<Pencil size={13} />} onClick={openCoverDesigner}>{labels.coverDesignerOpen}</Button>}
        </span>
      </div>
      {sheet && input ? (
        <div className="min-h-0 flex-1 p-6">
          <CoverCanvas
            sheet={sheet}
            input={input}
            mode="preview"
            elements={NO_ITEMS}
            selected={null}
            onSelect={noop}
            onChange={noop}
            onDelete={noop}
            label={labels.productionSheet}
            failedLabel={labels.productionPreviewFailed}
          />
        </div>
      ) : (
        <p className="m-auto max-w-sm p-4 text-center text-sm text-(--slate)">{labels.coverDesignerNoSheet}</p>
      )}
    </div>
  );
}

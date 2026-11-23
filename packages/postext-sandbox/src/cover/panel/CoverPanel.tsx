'use client';

/**
 * The Cover panel (#1669): the book's print versions (binding, ISBN,
 * flaps or jacket, spine), the sheet each one is printed on, the cover's
 * texts and the files for the printer. What it edits belongs to the book
 * (`config.production` and the cover's Markdown); the cover's look is the
 * design's `cover` part, edited in the designer.
 */

import { lazy, Suspense } from 'react';
import { BookCopy, Plus, Trash2 } from 'lucide-react';
import type { CoverSheetKind, ProductionVersion } from 'postext/production';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { CollapsibleSection, SelectInput, TextInput } from '../../controls/index.js';
import { ShowingDefaultsContext } from '../../controls/fieldContext.js';
import { Button, ConfirmPopover, EmptyState, IconButton, PanelBody, PanelHeader } from '../../ui/index.js';
import { CoverBuilder } from '../CoverBuilder.js';
import { pickVersion } from '../coverInput.js';
import { setCoverChoice, useCoverChoice, useCoverState } from '../coverStore.js';
import { addVersion, newVersion, productionPatch, removeVersion, setCollection, updateVersion, type VersionKind } from '../versions.js';
import { CoverChecks } from './CoverChecks.js';
import { CoverExportSection } from './CoverExportSection.js';
import { CoverTexts } from './CoverTexts.js';
import { SHEET_LABEL } from './coverLabels.js';
import { coverTextSlots } from '../coverText.js';
import { VersionFields } from './VersionFields.js';
import { CatalogueSection } from './CatalogueSection.js';
import { SheetDesignChoice } from './SheetDesignChoice.js';
import { useEditedDesign } from '../useEditedDesign.js';
import { ProfilesSection } from './ProfilesSection.js';
import { DesignerSection } from '../designer/DesignerSection.js';
import { useCompactLayout } from '../../hooks/useCompactLayout.js';

// On a phone the panel covers the preview: the sheet is shown in the panel.
const CoverStage = lazy(() => import('../CoverStage.js'));

const SHEETS: readonly CoverSheetKind[] = ['cover', 'jacket', 'endpaperFront', 'endpaperBack'];

export default function CoverPanel() {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const config = useSandboxSelector((s) => s.config);
  const production = config.production;
  const versions = production?.versions ?? [];
  const choice = useCoverChoice();
  const state = useCoverState();
  const version = pickVersion(config, choice.version);
  const write = (next: typeof production) => dispatch({ type: 'UPDATE_CONFIG', payload: productionPatch(next) });

  const add = (kind: VersionKind) => {
    const v = newVersion(versions, kind, kind === 'paperback' ? labels.coverPaperbackName : labels.coverHardcoverName);
    write(addVersion(production, v));
    setCoverChoice({ version: v.id, sheet: 'cover' });
  };
  const change = (patch: Partial<ProductionVersion>) => version && write(updateVersion(production, version.id, patch));

  const sheets = state.built?.sheets;
  const compact = useCompactLayout();
  const offered = SHEETS.filter((s) => s === 'cover' || (s === 'jacket' ? !!sheets?.jacket : !!sheets?.endpapers));
  // The trim the profiles' measures are worked out for: the front's.
  const front = state.built?.sheet.zones.find((z) => z.name === 'front')?.rect;
  const trim = front ? { width: front.width, height: front.height } : { width: 148, height: 210 };
  // The zones' frames, then the text boxes the design places by hand.
  // The sheet's own design's, when it has one (#1673).
  const edited = useEditedDesign();
  const slots = coverTextSlots(state.built?.sheet.zones.map((z) => z.name) ?? [], edited.design.textBoxes);

  return (
    <div className="flex h-full flex-col">
      <CoverBuilder />
      <PanelHeader title={labels.navCover} />
      {compact && (
        <div className="h-[38vh] min-h-48 shrink-0 border-b" style={{ borderColor: 'var(--rule)' }}>
          <Suspense fallback={null}><CoverStage /></Suspense>
        </div>
      )}
      {/* The book's own data, not design settings: no changed-value marks. */}
      <ShowingDefaultsContext.Provider value>
      <PanelBody>
        <CollapsibleSection title={labels.coverVersions} sectionId="cover-versions" defaultOpen>
          <p className="px-3 py-1 text-xs text-(--slate)">{labels.coverVersionsIntro}</p>
          {versions.length > 0 && version && (
            <div className="flex items-end gap-1 pe-2">
              <div className="min-w-0 flex-1">
                <SelectInput
                  label={labels.coverVersion}
                  value={version.id}
                  options={versions.map((v) => ({ value: v.id, label: v.name || v.id }))}
                  onChange={(id) => setCoverChoice({ version: id })}
                />
              </div>
              <ConfirmPopover
                message={labels.coverDeleteVersionConfirm.replace('__name__', version.name || version.id)}
                confirmLabel={labels.coverDeleteVersion}
                onConfirm={() => { write(removeVersion(production, version.id)); setCoverChoice({ version: null }); }}
              >
                {({ open }) => <IconButton label={labels.coverDeleteVersion} icon={<Trash2 size={14} />} onClick={open} destructive />}
              </ConfirmPopover>
            </div>
          )}
          <div className="flex flex-wrap gap-2 px-3 py-2">
            <Button variant="outline" size="sm" icon={<Plus size={13} />} onClick={() => add('paperback')}>{labels.coverAddPaperback}</Button>
            <Button variant="outline" size="sm" icon={<BookCopy size={13} />} onClick={() => add('hardcover')}>{labels.coverAddHardcover}</Button>
          </div>
          {version && (
            <VersionFields production={production} version={version} measures={sheets?.measures} onChange={change} />
          )}
        </CollapsibleSection>
        {!version ? (
          <EmptyState title={labels.coverNoVersions} />
        ) : (
          <>
            <CollapsibleSection title={labels.coverSheet} sectionId="cover-sheet" defaultOpen>
              {offered.length > 1 && (
                <SelectInput
                  label={labels.coverSheet}
                  value={offered.includes(choice.sheet) ? choice.sheet : 'cover'}
                  options={offered.map((s) => ({ value: s, label: String(labels[s === 'cover' && sheets?.cover.kind === 'case' ? 'coverSheetCase' : SHEET_LABEL[s]]) }))}
                  onChange={(s) => setCoverChoice({ sheet: s as CoverSheetKind })}
                />
              )}
              <SheetDesignChoice />
              {sheets && state.built && (
                <p className="px-3 py-1.5 text-xs text-(--slate)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {labels.coverSpineSummary
                    .replace('__pages__', String(sheets.spine.pages))
                    .replace('__spine__', sheets.spine.used.toFixed(1))
                    .replace('__width__', state.built.sheet.width.toFixed(1))
                    .replace('__height__', state.built.sheet.height.toFixed(1))}
                </p>
              )}
            </CollapsibleSection>
            <CollapsibleSection title={labels.coverTexts} sectionId="cover-texts" defaultOpen>
              <CoverTexts slots={slots} sheets={edited.names} metadata={state.built?.content.metadata} />
            </CollapsibleSection>
            <CollapsibleSection title={labels.coverDesigner} sectionId="cover-designer" defaultOpen>
              <DesignerSection />
            </CollapsibleSection>
            <CollapsibleSection title={labels.coverCollection} sectionId="cover-collection">
              <TextInput label={labels.coverCollectionName} value={production?.collection?.name ?? ''} widthCh={18} onChange={(name) => write(setCollection(production, { ...production?.collection, name }))} />
              <TextInput label={labels.coverCollectionIsbn} value={production?.collection?.isbn ?? ''} widthCh={18} onChange={(isbn) => write(setCollection(production, { name: production?.collection?.name ?? '', ...production?.collection, ...(isbn.trim() ? { isbn } : { isbn: undefined }) }))} />
              <CatalogueSection production={production} write={write} />
            </CollapsibleSection>
            <CollapsibleSection title={labels.coverExport} sectionId="cover-export" defaultOpen>
              <CoverExportSection state={state} />
            </CollapsibleSection>
            <CollapsibleSection title={labels.coverChecks} sectionId="cover-checks" defaultOpen>
              <CoverChecks issues={state.issues} />
            </CollapsibleSection>
          </>
        )}
        <ProfilesSection production={production} trim={trim} write={write} />
      </PanelBody>
      </ShowingDefaultsContext.Provider>
    </div>
  );
}

'use client';

import { memo } from 'react';
import type { ComicsConfig, Dimension, PageMargins } from 'postext';
import { resolvePageConfig } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext';
import { CollapsibleSection, DimensionInput, FieldGroup, SelectInput, ToggleSwitch } from '../../../controls';
import { setComicsField, setNestedField } from './comicsConfig';
import { GUTTER_UNITS, PanelStyleFields, useComics } from './comicsShared';

type Side = 'top' | 'bottom' | 'left' | 'right';

/** Comics → Panels and gutters: the reading direction, the frame the panels
 *  are cut from, the gutters between them, the default panel style and
 *  whether comic pages carry running heads. */
export const ComicsPanelsSection = memo(function ComicsPanelsSection() {
  const labels = useSandboxLabels();
  const { raw, resolved, write } = useComics();
  const pageRaw = useSandboxSelector((s) => s.config.page);
  const pageMargins = resolvePageConfig(pageRaw).margins;
  const c = raw ?? {};

  const set = <K extends keyof ComicsConfig>(key: K, value: ComicsConfig[K] | undefined) => write(setComicsField(raw, key, value));

  // The frame's own margins: all four sides are stored together (a side
  // left out would read as 0), starting from the page margins.
  const ownFrame = c.frame?.margins !== undefined;
  const frame = resolved.frame.margins ?? pageMargins;
  const setFrameSide = (side: Side, dim: Dimension) => {
    const margins: PageMargins = { top: frame.top, bottom: frame.bottom, left: frame.left, right: frame.right, [side]: dim };
    if (frame.mirror) margins.mirror = true;
    set('frame', { margins });
  };
  const toggleFrame = (on: boolean) => {
    if (!on) return set('frame', undefined);
    const margins: PageMargins = { top: pageMargins.top, bottom: pageMargins.bottom, left: pageMargins.left, right: pageMargins.right };
    if (pageMargins.mirror) margins.mirror = true;
    set('frame', { margins });
  };
  const mirrored = frame.mirror === true;

  const hasOverrides =
    c.readingDirection !== undefined || c.artDirection !== undefined || c.mirrorArt !== undefined ||
    c.frame !== undefined || c.gutter !== undefined || c.panel !== undefined || c.runningHeads !== undefined;
  const resetSection = () => {
    write({ ...raw, readingDirection: undefined, artDirection: undefined, mirrorArt: undefined, frame: undefined, gutter: undefined, panel: undefined, runningHeads: undefined });
  };

  return (
    <CollapsibleSection
      title={labels.comicsPanelsSection}
      sectionId="comicsPanels"
      hasOverrides={hasOverrides}
      onReset={resetSection}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <FieldGroup title={labels.comicsGroupDirection} description={labels.comicsGroupDirectionDescription}>
        <SelectInput
          label={labels.comicsReadingDirection}
          tooltip={labels.comicsReadingDirectionHelp}
          value={resolved.readingDirection}
          options={[
            { value: 'auto', label: labels.comicsDirectionAuto },
            { value: 'ltr', label: labels.comicsDirectionLtr },
            { value: 'rtl', label: labels.comicsDirectionRtl },
          ]}
          onChange={(v) => set('readingDirection', v as ComicsConfig['readingDirection'])}
          variant="segmented"
          isDefault={c.readingDirection === undefined}
          onReset={() => set('readingDirection', undefined)}
        />
        <SelectInput
          label={labels.comicsArtDirection}
          tooltip={labels.comicsArtDirectionHelp}
          value={resolved.artDirection}
          options={[
            { value: 'ltr', label: labels.comicsDirectionLtr },
            { value: 'rtl', label: labels.comicsDirectionRtl },
          ]}
          onChange={(v) => set('artDirection', v as ComicsConfig['artDirection'])}
          variant="segmented"
          isDefault={c.artDirection === undefined}
          onReset={() => set('artDirection', undefined)}
        />
        <ToggleSwitch
          label={labels.comicsMirrorArt}
          tooltip={labels.comicsMirrorArtHelp}
          checked={resolved.mirrorArt}
          onChange={(v) => set('mirrorArt', v)}
          isDefault={c.mirrorArt === undefined}
          onReset={() => set('mirrorArt', undefined)}
        />
      </FieldGroup>

      <FieldGroup title={labels.comicsGroupFrame} description={labels.comicsGroupFrameDescription}>
        <ToggleSwitch
          label={labels.comicsFrameOwnMargins}
          tooltip={labels.comicsFrameOwnMarginsHelp}
          checked={ownFrame}
          onChange={toggleFrame}
          isDefault={!ownFrame}
          onReset={() => set('frame', undefined)}
        />
        {ownFrame && (
          <>
            <DimensionInput label={labels.marginTop} value={frame.top} onChange={(d) => setFrameSide('top', d)} min={0} units={GUTTER_UNITS} />
            <DimensionInput label={labels.marginBottom} value={frame.bottom} onChange={(d) => setFrameSide('bottom', d)} min={0} units={GUTTER_UNITS} />
            <DimensionInput label={mirrored ? labels.pageMarginsInner : labels.marginLeft} value={frame.left} onChange={(d) => setFrameSide('left', d)} min={0} units={GUTTER_UNITS} />
            <DimensionInput label={mirrored ? labels.pageMarginsOuter : labels.marginRight} value={frame.right} onChange={(d) => setFrameSide('right', d)} min={0} units={GUTTER_UNITS} />
          </>
        )}
      </FieldGroup>

      <FieldGroup title={labels.comicsGroupGutters} description={labels.comicsGroupGuttersDescription}>
        <DimensionInput
          label={labels.comicsGutterTiers}
          tooltip={labels.comicsGutterTiersHelp}
          value={resolved.gutter.horizontal}
          onChange={(d) => write(setNestedField(raw, 'gutter', 'horizontal', d))}
          min={0}
          step={0.5}
          units={GUTTER_UNITS}
          isDefault={c.gutter?.horizontal === undefined}
          onReset={() => write(setNestedField(raw, 'gutter', 'horizontal', undefined))}
        />
        <DimensionInput
          label={labels.comicsGutterPanels}
          tooltip={labels.comicsGutterPanelsHelp}
          value={resolved.gutter.vertical}
          onChange={(d) => write(setNestedField(raw, 'gutter', 'vertical', d))}
          min={0}
          step={0.5}
          units={GUTTER_UNITS}
          isDefault={c.gutter?.vertical === undefined}
          onReset={() => write(setNestedField(raw, 'gutter', 'vertical', undefined))}
        />
      </FieldGroup>

      <FieldGroup title={labels.comicsGroupDefaultPanel} description={labels.comicsGroupDefaultPanelDescription}>
        <PanelStyleFields
          raw={c.panel}
          resolved={resolved.panel}
          onChange={(partial) => write({ ...raw, panel: { ...c.panel, ...partial } })}
          onResetField={(field) => write(setNestedField(raw, 'panel', field, undefined))}
          fieldIdPrefix="comics-panel"
        />
      </FieldGroup>

      <FieldGroup title={labels.comicsGroupPages}>
        <ToggleSwitch
          label={labels.comicsRunningHeads}
          tooltip={labels.comicsRunningHeadsHelp}
          checked={resolved.runningHeads}
          onChange={(v) => set('runningHeads', v)}
          isDefault={c.runningHeads === undefined}
          onReset={() => set('runningHeads', undefined)}
        />
      </FieldGroup>
    </CollapsibleSection>
  );
});

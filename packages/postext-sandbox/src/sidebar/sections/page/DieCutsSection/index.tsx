'use client';

import { memo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { dimensionsEqual, resolvePageConfig, type DieCutsConfig, type Dimension } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../../context/SandboxContext.js';
import { CollapsibleSection, DimensionInput, ItemCard, ItemCardListActions, NestedGroup, NumberInput, SelectInput, ToggleSwitch, openCard } from '../../../../controls/index.js';
import { Button, ConfirmPopover, IconButton } from '../../../../ui/index.js';
import { SearchScope } from '../../../search/SearchScope.js';
import { CheckedTextField } from './CheckedTextField.js';
import { DieShapeCard, SHAPES_LIST } from './DieShapeCard.js';
import { OutlinePreview } from './DieShapePreview.js';
import {
  OUTLINE_START,
  addPlacement,
  addShape,
  dimensionMm,
  removePlacement,
  removeShape,
  renameShape,
  setCorners,
  setOutline,
  updatePlacement,
  updateShape,
  validPageList,
  validPathData,
} from './dieCutEdits.js';

const PLACEMENTS_LIST = 'diePlacements';
const CORNER_RADIUS: Dimension = { value: 4, unit: 'mm' };
const VIEWBOX_MAX = 100000;

/** Design › Page › Die-cuts (`dieCuts`, #1570): the die shapes, the pages
 *  each is put on, rounded corners on every leaf and a shaped book's
 *  outline. The die line the PDF strokes is set in Print preparation. */
export const DieCutsSection = memo(function DieCutsSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.dieCuts);
  const rawPage = useSandboxSelector((s) => s.config.page);
  const page = resolvePageConfig(rawPage);
  const write = (next: DieCutsConfig | undefined) => dispatch({ type: 'UPDATE_CONFIG', payload: { dieCuts: next } });
  const shapes = raw?.shapes ?? [];
  const placements = raw?.pages ?? [];
  const ids = shapes.map((s) => s.id);
  const dieOptions = shapes.map((s) => ({ value: s.id, label: s.name?.trim() ? `${s.name.trim()} (${s.id})` : s.id }));

  return (
    <CollapsibleSection
      title={labels.dieCutsSection}
      sectionId="dieCuts"
      onReset={() => write(undefined)}
      hasOverrides={raw !== undefined}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <p className="mb-2 text-xs text-(--slate) [text-wrap:pretty]">{labels.dieCutsIntro}</p>

      <CollapsibleSection title={labels.dieCutsGroupShapes} sectionId="dieCuts-shapes" variant="subsection">
        {shapes.length === 0 && <p className="mb-2 text-xs text-(--slate) [text-wrap:pretty]">{labels.dieCutsShapesEmpty}</p>}
        <ItemCardListActions list={SHAPES_LIST} ids={shapes.map((_, i) => String(i))} />
        {shapes.map((shape, index) => (
          <DieShapeCard
            key={index}
            shape={shape}
            index={index}
            otherIds={new Set(ids.filter((id) => id !== shape.id))}
            onChange={(partial) => write(updateShape(raw, index, partial))}
            onRename={(id) => write(renameShape(raw, shape.id, id))}
            onRemove={() => write(removeShape(raw, shape.id))}
          />
        ))}
        <Button variant="outline" size="xs" icon={<Plus size={12} aria-hidden="true" />} className="mt-1"
          onClick={() => {
            openCard(SHAPES_LIST, String(shapes.length));
            write(addShape(raw));
          }}>
          {labels.dieCutsShapeAdd}
        </Button>
      </CollapsibleSection>

      <CollapsibleSection title={labels.dieCutsGroupPlacements} sectionId="dieCuts-pages" variant="subsection">
        <p className="mb-2 text-xs text-(--slate) [text-wrap:pretty]">
          {shapes.length === 0 ? labels.dieCutsPlacementNoShape : placements.length === 0 ? labels.dieCutsPlacementsEmpty : labels.dieCutsPlacementsIntro}
        </p>
        <ItemCardListActions list={PLACEMENTS_LIST} ids={placements.map((_, i) => String(i))} />
        {placements.map((p, index) => {
          const title = labels.dieCutsPlacementTitle.replace('__pages__', p.pages).replace('__die__', p.die);
          const options = ids.includes(p.die) ? dieOptions : [...dieOptions, { value: p.die, label: p.die }];
          return (
            <SearchScope key={index} title={`${p.pages} ${p.die}`} overridden>
              <ItemCard
                list={PLACEMENTS_LIST}
                id={String(index)}
                title={title}
                configPath={`dieCuts.pages[${index}]`}
                actions={
                  <ConfirmPopover message={labels.dieCutsPlacementRemoveConfirm} onConfirm={() => write(removePlacement(raw, index))}>
                    {({ open }) => <IconButton label={`${labels.dieCutsPlacementRemove}: ${title}`} icon={<Trash2 size={13} />} destructive onClick={open} />}
                  </ConfirmPopover>
                }
              >
                <CheckedTextField label={labels.dieCutsPlacementPages} tooltip={labels.dieCutsPlacementPagesTooltip} value={p.pages}
                  valid={validPageList} invalidHint={labels.dieCutsPlacementPagesInvalid} placeholder="3,7,11-13"
                  onChange={(pages) => write(updatePlacement(raw, index, { pages: pages.replace(/\s+/g, '') }))} isDefault={false} />
                <SelectInput stacked label={labels.dieCutsPlacementDie} value={p.die} options={options}
                  onChange={(die) => write(updatePlacement(raw, index, { die }))} tooltip={labels.dieCutsPlacementDieTooltip} isDefault={false} />
              </ItemCard>
            </SearchScope>
          );
        })}
        {shapes.length > 0 && (
          <Button variant="outline" size="xs" icon={<Plus size={12} aria-hidden="true" />} className="mt-1"
            onClick={() => {
              openCard(PLACEMENTS_LIST, String(placements.length));
              write(addPlacement(raw, shapes[0]!.id));
            }}>
            {labels.dieCutsPlacementAdd}
          </Button>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.dieCutsGroupCorners} sectionId="dieCuts-corners" variant="subsection">
        <ToggleSwitch label={labels.dieCutsCorners} checked={!!raw?.corners} tooltip={labels.dieCutsCornersTooltip} isDefault={!raw?.corners}
          onChange={(on) => write(setCorners(raw, on ? { radius: { ...CORNER_RADIUS } } : undefined))} onReset={() => write(setCorners(raw, undefined))} />
        {raw?.corners && (
          <NestedGroup>
            <DimensionInput label={labels.dieCutsCornerRadius} value={raw.corners.radius} min={0.5} step={0.5} tooltip={labels.dieCutsCornerRadiusTooltip}
              isDefault={dimensionsEqual(raw.corners.radius, CORNER_RADIUS)} onChange={(radius) => write(setCorners(raw, { ...raw.corners!, radius }))} />
            <SelectInput variant="segmented" label={labels.dieCutsCornerEdges} value={raw.corners.edges ?? 'fore'} tooltip={labels.dieCutsCornerEdgesTooltip}
              options={[{ value: 'fore', label: labels.dieCutsCornerEdgesFore }, { value: 'all', label: labels.dieCutsCornerEdgesAll }]}
              isDefault={raw.corners.edges === undefined || raw.corners.edges === 'fore'}
              onChange={(v) => write(setCorners(raw, v === 'all' ? { ...raw.corners!, edges: 'all' } : { radius: raw.corners!.radius }))}
              onReset={() => write(setCorners(raw, { radius: raw.corners!.radius }))} />
          </NestedGroup>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.dieCutsGroupOutline} sectionId="dieCuts-outline" variant="subsection">
        <ToggleSwitch label={labels.dieCutsOutline} checked={!!raw?.outline} tooltip={labels.dieCutsOutlineTooltip} isDefault={!raw?.outline}
          onChange={(on) => write(setOutline(raw, on ? { d: OUTLINE_START.d, viewBox: [...OUTLINE_START.viewBox] } : undefined))}
          onReset={() => write(setOutline(raw, undefined))} />
        {raw?.outline && (
          <NestedGroup>
            <OutlinePreview d={raw.outline.d} viewBox={raw.outline.viewBox ?? [1, 1]} trimW={dimensionMm(page.width)} trimH={dimensionMm(page.height)} label={labels.dieCutsOutlinePreview} />
            <CheckedTextField label={labels.dieCutsPathD} tooltip={labels.dieCutsOutlineDTooltip} value={raw.outline.d} valid={validPathData}
              invalidHint={labels.dieCutsPathDInvalid} onChange={(d) => write(setOutline(raw, { ...raw.outline!, d: d.trim() }))} isDefault={false} />
            {([0, 1] as const).map((i) => (
              <NumberInput key={i} label={i === 0 ? labels.dieCutsViewBoxWidth : labels.dieCutsViewBoxHeight} value={(raw.outline!.viewBox ?? [1, 1])[i]}
                min={0.001} max={VIEWBOX_MAX} step={1} tooltip={labels.dieCutsViewBoxTooltip} isDefault={raw.outline!.viewBox === undefined}
                onChange={(v) => {
                  const vb: [number, number] = [...(raw.outline!.viewBox ?? [1, 1])];
                  vb[i] = v > 0 ? v : 1;
                  write(setOutline(raw, { ...raw.outline!, viewBox: vb }));
                }} />
            ))}
          </NestedGroup>
        )}
      </CollapsibleSection>
    </CollapsibleSection>
  );
});

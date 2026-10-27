// The resource's placement, resolved key by key as the engine does, with
// its table style and direction.
import { type ResourcePlacement, type ResourceFloatPosition as PlacementPosition, type ResourceFloatSpan as PlacementSpan, type ResourceRotation, DEFAULT_TEXT_WRAP, DEFAULT_FLOAT_MIN_SCALE, type Resource, type ResourceType } from 'postext';
import { placementWith, tableWithStyle, tableWithDirection } from '../resourceEdits.js';
import { useSandboxSelector } from '../../../context/SandboxContext.js';
import { hasSeveralColumns } from '../../../sidebar/settings/multiColumnBook.js';
import { wrapChoiceOf, wrapSideOf } from '../../../sidebar/settings/textWrap.js';
import { useRightToLeftFlow, flowSideLabels } from '../../../sidebar/settings/flowSides.js';
import type { SandboxLabels } from '../../../types/labels.js';

/** What usePlacementFields takes from ResourceDetail. */
export interface UsePlacementFieldsDeps {
  resource: Resource;
  onChange: (next: Resource) => void;
  labels: SandboxLabels;
  type: ResourceType | undefined;
  touch: (partial: Partial<Resource>) => Resource;
}

export function usePlacementFields(deps: UsePlacementFieldsDeps) {
  const {
    resource, onChange, labels, type, touch
  } = deps;
  // Placement, resolved key by key as the engine does: the resource's own
  // value → its type's `defaultPlacement` → the built-in default. Each row
  // shows the effective value; a key the resource sets is marked and resets
  // back to the type's.
  const currentPlacement: ResourcePlacement = resource.placement ?? {};
  const typePlacement: ResourcePlacement = type?.defaultPlacement ?? {};
  const placementPosition: PlacementPosition = currentPlacement.position ?? typePlacement.position ?? 'auto';
  const placementSpan: PlacementSpan = currentPlacement.span ?? typePlacement.span ?? 'column';
  const placementRotate: ResourceRotation | 'none' = currentPlacement.rotate ?? typePlacement.rotate ?? 'none';
  /** Merge one placement key; `undefined` drops it so the resource falls
   *  back to its type's default placement. */
  const setPlacementKey = <K extends keyof ResourcePlacement>(key: K, value: ResourcePlacement[K] | undefined) => {
    onChange(touch({ placement: placementWith(currentPlacement, key, value) }));
  };
  // How many columns a column float takes (#505): offered when a page of
  // the book has more than one, or when the resource sets it.
  const placementColumns = currentPlacement.columns ?? typePlacement.columns ?? 1;
  const severalColumns = useSandboxSelector((s) => hasSeveralColumns(s.config));
  // Text wrap (#627): the side of the column the resource sits on with the
  // text beside it; a wrapped resource without a width of its own takes
  // `layout.wrap.defaultWidth`.
  const layoutWrap = useSandboxSelector((s) => s.config.layout?.wrap);
  const bodyLineHeight = useSandboxSelector((s) => s.config.bodyText?.lineHeight);
  const placementWrapChoice = wrapChoiceOf(currentPlacement.wrap ?? typePlacement.wrap);
  // A contour wrap (#883) wraps at the side its align names.
  const placementWrap = placementWrapChoice === 'contour' ? 'contour' : wrapSideOf(currentPlacement.wrap ?? typePlacement.wrap);
  const placementWidthPercent = Math.round((currentPlacement.width ?? typePlacement.width ?? (placementWrap !== 'none' ? layoutWrap?.defaultWidth ?? DEFAULT_TEXT_WRAP.defaultWidth : 1)) * 100);
  // An inline embed is never turned; a turned resource is a page-span float.
  const placementInline = placementPosition === 'here';
  const placementRotated = !placementInline && placementRotate !== 'none';
  // The alignment places a resource narrower than its slot: one narrowed by
  // Width, or a picture (bitmap or SVG) narrower than the column — smaller
  // than it, or shrunk by `layout.fitFiguresToPage` — at any width.
  const isPicture = resource.kind === 'bitmap' || resource.kind === 'svg' || resource.kind === 'video';
  const alignApplies = placementWidthPercent < 100 || isPicture;
  // Shrinking a floated picture to the room of its slot (#626): the
  // resource's own value → its type's → the document's `layout.floatShrink`.
  const floatShrink = useSandboxSelector((s) => s.config.layout?.floatShrink);
  const placementShrink = currentPlacement.shrink ?? typePlacement.shrink ?? floatShrink?.mode ?? 'never';
  const placementMinScale = currentPlacement.minScale ?? typePlacement.minScale ?? floatShrink?.minScale ?? DEFAULT_FLOAT_MIN_SCALE;
  const placementCaptionMeasure = currentPlacement.captionMeasure ?? typePlacement.captionMeasure ?? 'slot';
  // Heading the page or column that cites it (#633): the resource's own
  // value → its type's → the document's `layout.floatsAtCitingPage`.
  const floatsAtCitingPage = useSandboxSelector((s) => s.config.layout?.floatsAtCitingPage);
  const placementCitingPage = currentPlacement.citingPage ?? typePlacement.citingPage ?? floatsAtCitingPage ?? false;

  // Named table style (`config.tableStyles`); unset = the document's table style.
  const tableStyles = useSandboxSelector((s) => s.config.tableStyles) ?? [];
  const tableStyleId = resource.table?.styleId;
  const setTableStyleId = (styleId: string | undefined) => {
    onChange(touch({ table: tableWithStyle(resource, styleId) }));
  };
  // `start` / `end` are synonyms of left / right for a float (#371).
  const rawAlign = currentPlacement.align ?? typePlacement.align;
  const placementAlign = rawAlign === 'start' ? 'left' : rawAlign === 'end' ? 'right' : rawAlign ?? 'left';
  // In a right-to-left book the body's sides are mirrored: a float's
  // `left` stands on the sheet's right.
  const rtlBook = useRightToLeftFlow();
  const floatSide = flowSideLabels(rtlBook, labels.headerFooterElementAlignLeft, labels.headerFooterElementAlignRight);
  // A table runs with the document unless it names its own direction.
  const tableDirection = resource.table?.direction;
  const tableRtl = tableDirection ? tableDirection === 'rtl' : rtlBook;
  const setTableDirection = (direction: string) => {
    onChange(touch({ table: tableWithDirection(resource, direction) }));
  };
  return {
    currentPlacement, typePlacement, placementPosition, placementSpan, placementRotate,
    setPlacementKey, placementColumns, severalColumns, layoutWrap, bodyLineHeight,
    placementWrapChoice, placementWrap, placementWidthPercent, placementInline, placementRotated,
    isPicture, alignApplies, placementShrink, placementMinScale, placementCaptionMeasure,
    placementCitingPage, tableStyles, tableStyleId, setTableStyleId, placementAlign, floatSide,
    tableDirection, tableRtl, setTableDirection
  };
}

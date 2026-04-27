'use client';

import { useState } from 'react';
import { useSandboxLabels } from '../../../context/SandboxContext';
import { DEFAULT_TEXT_ELEMENT, dimensionsEqual, colorsEqual } from 'postext';
import type {
  DesignTextElement,
  ResolvedDesignTextElement,
  ElementBoxStyle,
  AnchorEdge,
  HAlign,
  PageParity,
  Dimension,
  DimensionUnit,
  ColorValue,
} from 'postext';
import {
  TextInput,
  SelectInput,
  FontPicker,
  DimensionInput,
  NumberInput,
  ToggleSwitch,
  ColorPicker,
} from '../../../controls';
import { PlaceholderPicker } from './PlaceholderPicker';
import {
  type SlotKind,
  alignFromPlacement,
  applyAlign,
  applyMarginFromBody,
  applyMarginFromEdge,
  marginFromBody,
  marginFromEdge,
  isElementAnchor,
  anchorTargetId,
  applyAnchorTarget,
  applyElementEdge,
  applyOffsetX,
  applyOffsetY,
  alignForElementEdge,
} from './placementAdapter';

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const ZERO: Dimension = { value: 0, unit: 'pt' };

interface Sibling {
  id: string;
  kind: 'text' | 'rule' | 'box';
  index: number;
}

interface Props {
  raw: DesignTextElement;
  resolved: ResolvedDesignTextElement;
  slotKind: SlotKind;
  siblings?: Sibling[];
  onChange: (next: DesignTextElement) => void;
}

export function TextElementEditor({ raw, resolved, slotKind, siblings = [], onChange }: Props) {
  const labels = useSandboxLabels();
  const [showPicker, setShowPicker] = useState(false);

  const update = (partial: Partial<DesignTextElement>) => {
    onChange({ ...raw, ...partial });
  };

  const ALIGN_OPTIONS = [
    { value: 'left', label: labels.headerFooterElementAlignLeft },
    { value: 'center', label: labels.headerFooterElementAlignCenter },
    { value: 'right', label: labels.headerFooterElementAlignRight },
  ];
  const PARITY_OPTIONS = [
    { value: 'all', label: labels.headerFooterElementParityAll },
    { value: 'odd', label: labels.headerFooterElementParityOdd },
    { value: 'even', label: labels.headerFooterElementParityEven },
  ];

  const insertAtCursor = (placeholder: string) => {
    update({ content: `${raw.content ?? ''}{${placeholder}}` });
  };

  const align = alignFromPlacement(resolved.placement);
  const resolvedMarginFromBody = marginFromBody(resolved.placement, slotKind);
  const resolvedMarginFromEdge = marginFromEdge(resolved.placement);
  const defaultMarginFromBody = marginFromBody(DEFAULT_TEXT_ELEMENT.placement, slotKind);
  const defaultMarginFromEdge = marginFromEdge(DEFAULT_TEXT_ELEMENT.placement);

  const isFontDefault = resolved.fontFamily === DEFAULT_TEXT_ELEMENT.fontFamily;
  const isSizeDefault = dimensionsEqual(resolved.fontSize, DEFAULT_TEXT_ELEMENT.fontSize);
  const isWeightDefault = resolved.fontWeight === DEFAULT_TEXT_ELEMENT.fontWeight;
  const isItalicDefault = resolved.italic === DEFAULT_TEXT_ELEMENT.italic;
  const isColorDefault = colorsEqual(resolved.color, DEFAULT_TEXT_ELEMENT.color);
  const isMarginFromBodyDefault = dimensionsEqual(resolvedMarginFromBody, defaultMarginFromBody);
  const isMarginFromEdgeDefault = dimensionsEqual(resolvedMarginFromEdge, defaultMarginFromEdge);

  return (
    <>
      <TextInput
        label={labels.headerFooterElementContent}
        value={raw.content}
        onChange={(v) => update({ content: v })}
        tooltip={labels.headerFooterElementContentTooltip}
        widthCh={20}
        onFocus={() => setShowPicker(true)}
        onBlur={() => { setTimeout(() => setShowPicker(false), 150); }}
      />
      {showPicker && <PlaceholderPicker onInsert={insertAtCursor} slotKind={slotKind} />}
      {(() => {
        const anchoredToElement = isElementAnchor(resolved.placement);
        const targetId = anchorTargetId(resolved.placement);
        const targetOptions = [
          { value: 'container', label: labels.headerFooterElementAnchorContainer ?? 'Contenedor' },
          ...siblings.map((s) => ({
            value: s.id,
            label: `${s.kind === 'text' ? (labels.headerFooterElementText ?? 'Texto') : s.kind === 'rule' ? (labels.headerFooterElementRule ?? 'Línea') : (labels.headerFooterElementBox ?? 'Caja')} #${s.index + 1}`,
          })),
        ];
        const EDGE_OPTIONS: { value: AnchorEdge; label: string }[] = [
          { value: 'right-of', label: labels.headerFooterElementEdgeRightOf ?? 'A la derecha de' },
          { value: 'left-of', label: labels.headerFooterElementEdgeLeftOf ?? 'A la izquierda de' },
          { value: 'below', label: labels.headerFooterElementEdgeBelow ?? 'Debajo de' },
          { value: 'above', label: labels.headerFooterElementEdgeAbove ?? 'Encima de' },
          { value: 'align-top', label: labels.headerFooterElementEdgeAlignTop ?? 'Alinear arriba' },
          { value: 'align-bottom', label: labels.headerFooterElementEdgeAlignBottom ?? 'Alinear abajo' },
          { value: 'align-left', label: labels.headerFooterElementEdgeAlignLeft ?? 'Alinear izquierda' },
          { value: 'align-right', label: labels.headerFooterElementEdgeAlignRight ?? 'Alinear derecha' },
        ];
        return (
          <>
            {siblings.length > 0 && (
              <SelectInput
                label={labels.headerFooterElementAnchorTo ?? 'Anclar a'}
                value={targetId}
                options={targetOptions}
                onChange={(v) => {
                  const nextPlacement = applyAnchorTarget(resolved.placement, slotKind, v);
                  const impliedAlign = alignForElementEdge(nextPlacement.anchor.edge);
                  update({
                    placement: nextPlacement,
                    ...(impliedAlign ? { align: impliedAlign } : {}),
                  });
                }}
                tooltip={labels.headerFooterElementAnchorToTooltip ?? 'Ancla el elemento al contenedor o a otro elemento hermano. Cuando se ancla a un elemento, su posición se calcula relativamente a éste — así una caja puede empujar a la de al lado cuando crezca.'}
              />
            )}
            {anchoredToElement ? (
              <>
                <SelectInput
                  label={labels.headerFooterElementEdge ?? 'Posición relativa'}
                  value={resolved.placement.anchor.edge}
                  options={EDGE_OPTIONS}
                  onChange={(v) => {
                    const edge = v as AnchorEdge;
                    const nextPlacement = applyElementEdge(resolved.placement, edge);
                    const impliedAlign = alignForElementEdge(edge);
                    update({
                      placement: nextPlacement,
                      ...(impliedAlign ? { align: impliedAlign } : {}),
                    });
                  }}
                  tooltip={labels.headerFooterElementEdgeTooltip ?? 'Arista del elemento de referencia a la que se engancha este bloque: a la derecha, izquierda, encima, debajo, o alineando una de las esquinas.'}
                />
                <DimensionInput
                  label={labels.headerFooterElementOffsetX ?? 'Desplazamiento X'}
                  value={resolved.placement.offset?.x ?? { value: 0, unit: 'pt' }}
                  onChange={(dim: Dimension) => update({ placement: applyOffsetX(resolved.placement, dim) })}
                  step={1}
                  tooltip={labels.headerFooterElementOffsetXTooltip ?? 'Separación horizontal desde la arista de referencia. Valores positivos alejan hacia la derecha; negativos, hacia la izquierda.'}
                />
                <DimensionInput
                  label={labels.headerFooterElementOffsetY ?? 'Desplazamiento Y'}
                  value={resolved.placement.offset?.y ?? { value: 0, unit: 'pt' }}
                  onChange={(dim: Dimension) => update({ placement: applyOffsetY(resolved.placement, dim) })}
                  step={1}
                  tooltip={labels.headerFooterElementOffsetYTooltip ?? 'Separación vertical desde la arista de referencia. Valores positivos alejan hacia abajo; negativos, hacia arriba.'}
                />
              </>
            ) : (
              <SelectInput
                label={labels.headerFooterElementAlign}
                value={align}
                options={ALIGN_OPTIONS}
                onChange={(v) => update({ placement: applyAlign(resolved.placement, slotKind, v as HAlign) })}
                tooltip={labels.headerFooterElementAlignTooltip ?? 'Alineación horizontal del elemento dentro del contenedor: izquierda, centro o derecha.'}
              />
            )}
          </>
        );
      })()}
      <SelectInput
        label={labels.headerFooterElementParity}
        value={raw.parity ?? 'all'}
        options={PARITY_OPTIONS}
        onChange={(v) => update({ parity: v as PageParity })}
        tooltip={labels.headerFooterElementParityTooltip ?? 'Páginas en las que este elemento se renderiza: todas, solo pares (lado izquierdo en doble página) o solo impares (lado derecho).'}
      />
      <FontPicker
        label={labels.headerFooterElementFontFamily}
        value={resolved.fontFamily ?? DEFAULT_TEXT_ELEMENT.fontFamily ?? ''}
        onChange={(font) => update({ fontFamily: font })}
        isDefault={isFontDefault}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          next.fontFamily = undefined;
          onChange(next);
        }}
        searchPlaceholder={labels.bodyFontSearch}
        noResultsLabel={labels.bodyFontNoResults}
        tooltip={labels.headerFooterElementFontFamilyTooltip ?? 'Familia tipográfica del texto de este elemento.'}
      />
      <DimensionInput
        label={labels.headerFooterElementFontSize}
        value={resolved.fontSize}
        onChange={(dim: Dimension) => update({ fontSize: dim })}
        min={1}
        step={0.5}
        units={TEXT_SIZE_UNITS}
        isDefault={isSizeDefault}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          next.fontSize = undefined as unknown as Dimension;
          onChange(next);
        }}
        tooltip={labels.headerFooterElementFontSizeTooltip ?? 'Tamaño de fuente del texto.'}
      />
      <NumberInput
        label={labels.headerFooterElementFontWeight}
        value={resolved.fontWeight}
        onChange={(v) => update({ fontWeight: v })}
        min={100}
        max={900}
        step={10}
        isDefault={isWeightDefault}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          next.fontWeight = undefined;
          onChange(next);
        }}
        tooltip={labels.headerFooterElementFontWeightTooltip ?? 'Grosor de la fuente (100 = fina, 400 = normal, 700 = negrita, 900 = extra negra).'}
      />
      <ToggleSwitch
        label={labels.headerFooterElementItalic}
        checked={resolved.italic}
        onChange={(v) => update({ italic: v })}
        isDefault={isItalicDefault}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          next.italic = undefined;
          onChange(next);
        }}
        tooltip={labels.headerFooterElementItalicTooltip ?? 'Activa la variante cursiva de la fuente.'}
      />
      <ColorPicker
        label={labels.headerFooterElementColor}
        value={resolved.color}
        onChange={(color: ColorValue) => update({ color })}
        isDefault={isColorDefault}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          next.color = undefined;
          onChange(next);
        }}
        fieldId={`headerFooter-text-color-${raw.id}`}
        tooltip={labels.headerFooterElementColorTooltip ?? 'Color del texto del elemento.'}
      />
      <SelectInput
        label={labels.headerFooterElementOverflow ?? 'Desbordamiento'}
        value={resolved.overflow}
        options={[
          { value: 'wrap', label: labels.headerFooterElementOverflowWrap ?? 'Pasar a nueva línea' },
          { value: 'ellipsis-end', label: labels.headerFooterElementOverflowEllipsisEnd ?? 'Elipsis al final (…)' },
          { value: 'ellipsis-middle', label: labels.headerFooterElementOverflowEllipsisMiddle ?? 'Elipsis en el centro' },
          { value: 'ellipsis-start', label: labels.headerFooterElementOverflowEllipsisStart ?? 'Elipsis al principio' },
          { value: 'clip', label: labels.headerFooterElementOverflowClip ?? 'Recortar' },
        ]}
        onChange={(v) => update({ overflow: v as DesignTextElement['overflow'] })}
        tooltip={labels.headerFooterElementOverflowTooltip ?? 'Qué hacer cuando el texto no cabe en el ancho disponible: pasar a una nueva línea, recortar con puntos suspensivos al inicio/centro/final, o simplemente recortar sin indicador.'}
      />
      <ToggleSwitch
        label={labels.headerFooterElementHyphenate ?? 'Separación silábica'}
        checked={raw.hyphenate ?? false}
        onChange={(v) => update({ hyphenate: v })}
        isDefault={!raw.hyphenate}
        onReset={() => {
          const next: DesignTextElement = { ...raw };
          next.hyphenate = undefined;
          onChange(next);
        }}
        tooltip={labels.headerFooterElementHyphenateTooltip ?? 'Cuando el modo de desbordamiento es "nueva línea", parte palabras largas por sílabas (guiones) en lugar de desbordarlas. Usa el idioma de silabación del documento.'}
      />
      {(() => {
        const box: ElementBoxStyle = resolved.box ?? {};
        const bg = box.backgroundColor;
        const bc = box.borderColor;
        const bw = box.borderWidth ?? ZERO;
        const br = box.borderRadius ?? ZERO;
        const padH = box.padding?.left ?? box.padding?.right ?? ZERO;
        const padV = box.padding?.top ?? box.padding?.bottom ?? ZERO;
        const updateBox = (partial: Partial<ElementBoxStyle>) => {
          const nextBox: ElementBoxStyle = { ...(raw.box ?? {}), ...partial };
          const cleaned: ElementBoxStyle = {};
          if (nextBox.backgroundColor) cleaned.backgroundColor = nextBox.backgroundColor;
          if (nextBox.borderColor) cleaned.borderColor = nextBox.borderColor;
          if (nextBox.borderWidth) cleaned.borderWidth = nextBox.borderWidth;
          if (nextBox.borderRadius) cleaned.borderRadius = nextBox.borderRadius;
          if (nextBox.padding) {
            const p = nextBox.padding;
            const hasAny =
              (p.top && p.top.value !== 0) ||
              (p.right && p.right.value !== 0) ||
              (p.bottom && p.bottom.value !== 0) ||
              (p.left && p.left.value !== 0);
            if (hasAny) cleaned.padding = p;
          }
          const next: DesignTextElement = { ...raw };
          if (Object.keys(cleaned).length === 0) next.box = undefined;
          else next.box = cleaned;
          onChange(next);
        };
        const updatePaddingH = (dim: Dimension) => {
          const prev = raw.box?.padding ?? {};
          updateBox({ padding: { ...prev, left: dim, right: dim } });
        };
        const updatePaddingV = (dim: Dimension) => {
          const prev = raw.box?.padding ?? {};
          updateBox({ padding: { ...prev, top: dim, bottom: dim } });
        };
        return (
          <>
            <ColorPicker
              label={labels.headerFooterElementBoxBackgroundColor ?? 'Background'}
              value={bg ?? { hex: '#ffffff', model: 'hex' }}
              onChange={(c: ColorValue) => updateBox({ backgroundColor: c })}
              isDefault={!bg}
              onReset={() => updateBox({ backgroundColor: undefined })}
              fieldId={`headerFooter-text-bg-${raw.id}`}
              tooltip={labels.headerFooterElementBoxBackgroundColorTooltip ?? 'Color de fondo que rellena la caja detrás del texto. Se extiende hasta los bordes del elemento — usa padding para ampliarla más allá del texto.'}
            />
            <ColorPicker
              label={labels.headerFooterElementBoxBorderColor ?? 'Border color'}
              value={bc ?? { hex: '#000000', model: 'hex' }}
              onChange={(c: ColorValue) => updateBox({ borderColor: c })}
              isDefault={!bc}
              onReset={() => updateBox({ borderColor: undefined })}
              fieldId={`headerFooter-text-border-${raw.id}`}
              tooltip={labels.headerFooterElementBoxBorderColorTooltip ?? 'Color del borde de la caja. Solo se dibuja si el grosor del borde es mayor que cero.'}
            />
            <DimensionInput
              label={labels.headerFooterElementBoxBorderWidth ?? 'Border width'}
              value={bw}
              onChange={(dim: Dimension) => updateBox({ borderWidth: dim })}
              min={0}
              step={0.1}
              isDefault={bw.value === 0}
              onReset={() => updateBox({ borderWidth: undefined })}
              tooltip={labels.headerFooterElementBoxBorderWidthTooltip ?? 'Grosor del trazo del borde. En 0 el borde no se dibuja.'}
            />
            <DimensionInput
              label={labels.headerFooterElementBoxBorderRadius ?? 'Border radius'}
              value={br}
              onChange={(dim: Dimension) => updateBox({ borderRadius: dim })}
              min={0}
              step={0.5}
              isDefault={br.value === 0}
              onReset={() => updateBox({ borderRadius: undefined })}
              tooltip={labels.headerFooterElementBoxBorderRadiusTooltip ?? 'Radio de redondeo de las esquinas de la caja. Se aplica tanto al fondo como al borde.'}
            />
            <DimensionInput
              label={labels.headerFooterElementBoxPaddingH ?? 'Padding horizontal'}
              value={padH}
              onChange={updatePaddingH}
              min={0}
              step={0.5}
              isDefault={padH.value === 0}
              onReset={() => updatePaddingH(ZERO)}
              tooltip={labels.headerFooterElementBoxPaddingHTooltip ?? 'Espacio interno a izquierda y derecha, entre el texto y los bordes de la caja. Permite que el fondo y el borde se extiendan más allá del texto.'}
            />
            <DimensionInput
              label={labels.headerFooterElementBoxPaddingV ?? 'Padding vertical'}
              value={padV}
              onChange={updatePaddingV}
              min={0}
              step={0.5}
              isDefault={padV.value === 0}
              onReset={() => updatePaddingV(ZERO)}
              tooltip={labels.headerFooterElementBoxPaddingVTooltip ?? 'Espacio interno arriba y abajo, entre el texto y los bordes de la caja. Permite que el fondo y el borde se extiendan más allá del texto.'}
            />
          </>
        );
      })()}
      {!isElementAnchor(resolved.placement) && (
        <>
          <DimensionInput
            label={labels.headerFooterElementMarginFromBody}
            value={resolvedMarginFromBody}
            onChange={(dim: Dimension) => update({ placement: applyMarginFromBody(resolved.placement, slotKind, dim) })}
            min={0}
            step={1}
            tooltip={labels.headerFooterElementMarginFromBodyTooltip}
            isDefault={isMarginFromBodyDefault}
            onReset={() => update({ placement: applyMarginFromBody(resolved.placement, slotKind, ZERO) })}
          />
          {align !== 'center' && (
            <DimensionInput
              label={labels.headerFooterElementMarginFromEdge}
              value={resolvedMarginFromEdge}
              onChange={(dim: Dimension) => update({ placement: applyMarginFromEdge(resolved.placement, dim) })}
              min={0}
              step={1}
              tooltip={labels.headerFooterElementMarginFromEdgeTooltip}
              isDefault={isMarginFromEdgeDefault}
              onReset={() => update({ placement: applyMarginFromEdge(resolved.placement, ZERO) })}
            />
          )}
        </>
      )}
    </>
  );
}

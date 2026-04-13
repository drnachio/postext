'use client';

import { useSandbox } from '../../context/SandboxContext';
import { resolveLayoutConfig, DEFAULT_LAYOUT_CONFIG, dimensionsEqual } from 'postext';
import type { LayoutConfig, Dimension } from 'postext';
import {
  CollapsibleSection,
  SelectInput,
  DimensionInput,
  NumberInput,
  NestedGroup,
} from '../../controls';

const D = DEFAULT_LAYOUT_CONFIG;

export function LayoutSection() {
  const { state, dispatch } = useSandbox();
  const raw = state.config.layout;
  const layout = resolveLayoutConfig(raw);
  const { labels } = state;

  const updateLayout = (partial: Partial<LayoutConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { layout: { ...raw, ...partial } },
    });
  };

  const resetLayout = () => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { layout: undefined },
    });
  };

  const resetField = (field: keyof LayoutConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { layout: hasKeys ? next : undefined },
    });
  };

  const handleLayoutTypeChange = (value: string) => {
    const layoutType = value as LayoutConfig['layoutType'];
    if (layoutType === 'single') {
      // Remove gutter and side column when switching to single
      const next: LayoutConfig = { ...raw, layoutType };
      delete next.gutterWidth;
      delete next.sideColumnPercent;
      const hasKeys = Object.keys(next).length > 0;
      dispatch({
        type: 'UPDATE_CONFIG',
        payload: { layout: hasKeys ? next : undefined },
      });
    } else {
      updateLayout({ layoutType });
    }
  };

  const LAYOUT_TYPE_OPTIONS = [
    { value: 'single', label: labels.layoutSingle },
    { value: 'double', label: labels.layoutDouble },
    { value: 'oneAndHalf', label: labels.layoutOneAndHalf },
  ];

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const isTypeDefault = layout.layoutType === D.layoutType;
  const isGutterDefault = dimensionsEqual(layout.gutterWidth, D.gutterWidth);
  const isSideColDefault = layout.sideColumnPercent === D.sideColumnPercent;

  const showGutter = layout.layoutType === 'double' || layout.layoutType === 'oneAndHalf';
  const showSideCol = layout.layoutType === 'oneAndHalf';

  return (
    <CollapsibleSection
      title={labels.layout}
      sectionId="layout"
      defaultOpen
      onReset={resetLayout}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <SelectInput
        label={labels.layoutType}
        value={layout.layoutType}
        options={LAYOUT_TYPE_OPTIONS}
        onChange={handleLayoutTypeChange}
        tooltip={labels.layoutTypeTooltip}
        isDefault={isTypeDefault}
        onReset={() => {
          if (!raw) return;
          const next = { ...raw };
          delete next.layoutType;
          delete next.gutterWidth;
          delete next.sideColumnPercent;
          dispatch({ type: 'UPDATE_CONFIG', payload: { layout: Object.keys(next).length > 0 ? next : undefined } });
        }}
      />

      {(showGutter || showSideCol) && (
        <NestedGroup>
          {showGutter && (
            <DimensionInput
              label={labels.gutterWidth}
              value={layout.gutterWidth}
              onChange={(dim: Dimension) => updateLayout({ gutterWidth: dim })}
              min={0}
              step={0.1}
              tooltip={labels.gutterWidthTooltip}
              isDefault={isGutterDefault}
              onReset={() => resetField('gutterWidth')}
            />
          )}
          {showSideCol && (
            <NumberInput
              label={labels.sideColumnPercent}
              value={layout.sideColumnPercent}
              onChange={(v) => updateLayout({ sideColumnPercent: v })}
              min={10}
              max={50}
              step={1}
              tooltip={labels.sideColumnPercentTooltip}
              isDefault={isSideColDefault}
              onReset={() => resetField('sideColumnPercent')}
              suffix="%"
            />
          )}
        </NestedGroup>
      )}
    </CollapsibleSection>
  );
}

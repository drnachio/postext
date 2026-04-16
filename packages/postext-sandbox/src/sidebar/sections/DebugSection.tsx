'use client';

import { useSandbox } from '../../context/SandboxContext';
import {
  resolvePageConfig,
  resolveDebugConfig,
  DEFAULT_PAGE_CONFIG,
  DEFAULT_DEBUG_CONFIG,
  dimensionsEqual,
  colorsEqual,
} from 'postext';
import type { PageConfig, DebugConfig, PostextConfig } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  NumberInput,
  ToggleSwitch,
  NestedGroup,
} from '../../controls';

export function DebugSection() {
  const { state, dispatch } = useSandbox();
  const rawPage = state.config.page;
  const page = resolvePageConfig(rawPage);
  const rawDebug = state.config.debug;
  const debug = resolveDebugConfig(rawDebug);
  const { labels } = state;

  const updatePage = (partial: Partial<PageConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { page: { ...rawPage, ...partial } },
    });
  };

  const updateDebug = (partial: Partial<DebugConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { debug: { ...rawDebug, ...partial } },
    });
  };

  const resetBaselineGridField = (field: 'enabled' | 'color' | 'lineWidth') => {
    if (!rawPage?.baselineGrid) return;
    const next = { ...rawPage.baselineGrid };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    if (hasKeys) {
      updatePage({ baselineGrid: next });
    } else {
      const r = { ...rawPage };
      delete r.baselineGrid;
      dispatch({
        type: 'UPDATE_CONFIG',
        payload: { page: Object.keys(r).length > 0 ? r : undefined },
      });
    }
  };

  const resetCursorSyncField = (field: 'enabled' | 'color') => {
    if (!rawDebug?.cursorSync) return;
    const next = { ...rawDebug.cursorSync };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    const nextDebug: DebugConfig = { ...rawDebug };
    if (hasKeys) {
      nextDebug.cursorSync = next;
    } else {
      delete nextDebug.cursorSync;
    }
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { debug: Object.keys(nextDebug).length > 0 ? nextDebug : undefined },
    });
  };

  const resetLooseLineField = (field: 'enabled' | 'color' | 'threshold') => {
    if (!rawDebug?.looseLineHighlight) return;
    const next = { ...rawDebug.looseLineHighlight };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    const nextDebug: DebugConfig = { ...rawDebug };
    if (hasKeys) {
      nextDebug.looseLineHighlight = next as DebugConfig['looseLineHighlight'];
    } else {
      delete nextDebug.looseLineHighlight;
    }
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { debug: Object.keys(nextDebug).length > 0 ? nextDebug : undefined },
    });
  };

  const resetSelectionSyncField = (field: 'enabled' | 'color') => {
    if (!rawDebug?.selectionSync) return;
    const next = { ...rawDebug.selectionSync };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    const nextDebug: DebugConfig = { ...rawDebug };
    if (hasKeys) {
      nextDebug.selectionSync = next;
    } else {
      delete nextDebug.selectionSync;
    }
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { debug: Object.keys(nextDebug).length > 0 ? nextDebug : undefined },
    });
  };

  const resetPageNegativeField = (field: 'enabled') => {
    if (!rawDebug?.pageNegative) return;
    const nextDebug: DebugConfig = { ...rawDebug };
    delete nextDebug.pageNegative;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { debug: Object.keys(nextDebug).length > 0 ? nextDebug : undefined },
    });
  };

  const resetDebugSection = () => {
    const patch: Partial<PostextConfig> = { debug: undefined };
    if (rawPage?.baselineGrid) {
      const p = { ...rawPage };
      delete p.baselineGrid;
      patch.page = Object.keys(p).length > 0 ? p : undefined;
    }
    dispatch({ type: 'UPDATE_CONFIG', payload: patch });
  };

  const DPG = DEFAULT_PAGE_CONFIG;
  const DD = DEFAULT_DEBUG_CONFIG;

  const isGridEnabledDefault = page.baselineGrid.enabled === DPG.baselineGrid.enabled;
  const isGridColorDefault = colorsEqual(page.baselineGrid.color, DPG.baselineGrid.color);
  const isGridLineWidthDefault = dimensionsEqual(page.baselineGrid.lineWidth, DPG.baselineGrid.lineWidth);
  const isCursorSyncEnabledDefault = debug.cursorSync.enabled === DD.cursorSync.enabled;
  const isCursorSyncColorDefault = colorsEqual(debug.cursorSync.color, DD.cursorSync.color);
  const isSelectionSyncEnabledDefault = debug.selectionSync.enabled === DD.selectionSync.enabled;
  const isSelectionSyncColorDefault = colorsEqual(debug.selectionSync.color, DD.selectionSync.color);
  const isLooseLineEnabledDefault = debug.looseLineHighlight.enabled === DD.looseLineHighlight.enabled;
  const isLooseLineColorDefault = colorsEqual(debug.looseLineHighlight.color, DD.looseLineHighlight.color);
  const isLooseLineThresholdDefault = debug.looseLineHighlight.threshold === DD.looseLineHighlight.threshold;
  const isPageNegativeEnabledDefault = debug.pageNegative.enabled === DD.pageNegative.enabled;

  const hasOverrides =
    (rawPage?.baselineGrid !== undefined && Object.keys(rawPage.baselineGrid).length > 0) ||
    (rawDebug !== undefined && Object.keys(rawDebug).length > 0);

  return (
    <CollapsibleSection
      title={labels.debug}
      sectionId="debug"
      onReset={resetDebugSection}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <ToggleSwitch
        label={labels.baselineGrid}
        checked={page.baselineGrid.enabled}
        onChange={(v) =>
          updatePage({ baselineGrid: { ...page.baselineGrid, enabled: v } })
        }
        tooltip={labels.baselineGridTooltip}
        isDefault={isGridEnabledDefault}
        onReset={() => resetBaselineGridField('enabled')}
      />

      {page.baselineGrid.enabled && (
        <NestedGroup>
          <ColorPicker
            label={labels.baselineGridColor}
            value={page.baselineGrid.color}
            onChange={(color) =>
              updatePage({ baselineGrid: { ...page.baselineGrid, color } })
            }
            tooltip={labels.baselineGridColorTooltip}
            isDefault={isGridColorDefault}
            onReset={() => resetBaselineGridField('color')}
            fieldId="debug-baselineGridColor"
          />
          <DimensionInput
            label={labels.baselineGridLineWidth}
            value={page.baselineGrid.lineWidth}
            onChange={(dim) =>
              updatePage({ baselineGrid: { ...page.baselineGrid, lineWidth: dim } })
            }
            min={0.1}
            step={0.1}
            tooltip={labels.baselineGridLineWidthTooltip}
            isDefault={isGridLineWidthDefault}
            onReset={() => resetBaselineGridField('lineWidth')}
          />
        </NestedGroup>
      )}

      <ToggleSwitch
        label={labels.debugCursorSync}
        checked={debug.cursorSync.enabled}
        onChange={(v) =>
          updateDebug({ cursorSync: { ...debug.cursorSync, enabled: v } })
        }
        tooltip={labels.debugCursorSyncTooltip}
        isDefault={isCursorSyncEnabledDefault}
        onReset={() => resetCursorSyncField('enabled')}
      />

      {debug.cursorSync.enabled && (
        <NestedGroup>
          <ColorPicker
            label={labels.debugCursorSyncColor}
            value={debug.cursorSync.color}
            onChange={(color) =>
              updateDebug({ cursorSync: { ...debug.cursorSync, color } })
            }
            tooltip={labels.debugCursorSyncColorTooltip}
            isDefault={isCursorSyncColorDefault}
            onReset={() => resetCursorSyncField('color')}
            fieldId="debug-cursorSyncColor"
          />
        </NestedGroup>
      )}

      <ToggleSwitch
        label={labels.debugSelectionSync}
        checked={debug.selectionSync.enabled}
        onChange={(v) =>
          updateDebug({ selectionSync: { ...debug.selectionSync, enabled: v } })
        }
        tooltip={labels.debugSelectionSyncTooltip}
        isDefault={isSelectionSyncEnabledDefault}
        onReset={() => resetSelectionSyncField('enabled')}
      />

      {debug.selectionSync.enabled && (
        <NestedGroup>
          <ColorPicker
            label={labels.debugSelectionSyncColor}
            value={debug.selectionSync.color}
            onChange={(color) =>
              updateDebug({ selectionSync: { ...debug.selectionSync, color } })
            }
            tooltip={labels.debugSelectionSyncColorTooltip}
            isDefault={isSelectionSyncColorDefault}
            onReset={() => resetSelectionSyncField('color')}
            fieldId="debug-selectionSyncColor"
          />
        </NestedGroup>
      )}

      <ToggleSwitch
        label={labels.debugLooseLines}
        checked={debug.looseLineHighlight.enabled}
        onChange={(v) =>
          updateDebug({ looseLineHighlight: { ...debug.looseLineHighlight, enabled: v } })
        }
        tooltip={labels.debugLooseLinesTooltip}
        isDefault={isLooseLineEnabledDefault}
        onReset={() => resetLooseLineField('enabled')}
      />

      {debug.looseLineHighlight.enabled && (
        <NestedGroup>
          <ColorPicker
            label={labels.debugLooseLinesColor}
            value={debug.looseLineHighlight.color}
            onChange={(color) =>
              updateDebug({ looseLineHighlight: { ...debug.looseLineHighlight, color } })
            }
            tooltip={labels.debugLooseLinesColorTooltip}
            isDefault={isLooseLineColorDefault}
            onReset={() => resetLooseLineField('color')}
            fieldId="debug-looseLinesColor"
          />
          <NumberInput
            label={labels.debugLooseLinesThreshold}
            value={debug.looseLineHighlight.threshold}
            onChange={(v) =>
              updateDebug({ looseLineHighlight: { ...debug.looseLineHighlight, threshold: v } })
            }
            min={1}
            max={5}
            step={0.05}
            tooltip={labels.debugLooseLinesThresholdTooltip}
            isDefault={isLooseLineThresholdDefault}
            onReset={() => resetLooseLineField('threshold')}
          />
        </NestedGroup>
      )}

      <ToggleSwitch
        label={labels.debugPageNegative}
        checked={debug.pageNegative.enabled}
        onChange={(v) =>
          updateDebug({ pageNegative: { enabled: v } })
        }
        tooltip={labels.debugPageNegativeTooltip}
        isDefault={isPageNegativeEnabledDefault}
        onReset={() => resetPageNegativeField('enabled')}
      />
    </CollapsibleSection>
  );
}

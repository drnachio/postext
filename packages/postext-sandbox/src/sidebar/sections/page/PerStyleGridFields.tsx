'use client';

import type { BodyTextConfig, PageConfig } from 'postext';
import { resolveBodyTextConfig, resolvePageConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { NestedGroup, ToggleSwitch } from '../../../controls/index.js';

// ---------------------------------------------------------------------------
// Whether each style decides alone if it sits on the baseline grid
// (`page.baselineGrid.perStyle`), and the switches only that rule reads: the
// body text and the first paragraph after a heading. The other styles keep
// their `snapToGrid` where they are edited (headings, boxes, lists, formulas,
// resource types).
// ---------------------------------------------------------------------------

export function PerStyleGridFields() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const rawPage = useSandboxSelector((s) => s.config.page);
  const rawBody = useSandboxSelector((s) => s.config.bodyText);
  const page = resolvePageConfig(rawPage);
  const body = resolveBodyTextConfig(rawBody);

  /** `o` without `key`, or nothing when that leaves it empty. */
  const without = <T extends object>(o: T | undefined, key: keyof T): T | undefined => {
    if (!o) return undefined;
    const next = { ...o };
    delete next[key];
    return Object.keys(next).length > 0 ? next : undefined;
  };
  const setPerStyle = (perStyle: boolean) =>
    dispatch({ type: 'UPDATE_CONFIG', payload: { page: { ...rawPage, baselineGrid: { enabled: page.baselineGrid.enabled, ...rawPage?.baselineGrid, perStyle } } as PageConfig } });
  const resetPerStyle = () => {
    const grid = without(rawPage?.baselineGrid, 'perStyle');
    dispatch({ type: 'UPDATE_CONFIG', payload: { page: grid ? { ...rawPage, baselineGrid: grid } as PageConfig : without(rawPage, 'baselineGrid') } });
  };
  const setBody = (partial: Partial<BodyTextConfig>) => dispatch({ type: 'UPDATE_CONFIG', payload: { bodyText: { ...rawBody, ...partial } } });
  const resetBody = (key: 'snapToGrid' | 'firstParagraphSnapToGrid') => dispatch({ type: 'UPDATE_CONFIG', payload: { bodyText: without(rawBody, key) } });

  return (
    <>
      <ToggleSwitch
        label={labels.baselineGridPerStyle}
        checked={page.baselineGrid.perStyle}
        onChange={setPerStyle}
        tooltip={labels.baselineGridPerStyleTooltip}
        isDefault={rawPage?.baselineGrid?.perStyle === undefined}
        onReset={resetPerStyle}
      />
      {page.baselineGrid.perStyle && (
        <NestedGroup>
          <ToggleSwitch
            label={labels.baselineGridBodyText}
            checked={body.snapToGrid}
            onChange={(snapToGrid) => setBody({ snapToGrid })}
            tooltip={labels.baselineGridStyleTooltip}
            isDefault={rawBody?.snapToGrid === undefined}
            onReset={() => resetBody('snapToGrid')}
          />
          <ToggleSwitch
            label={labels.baselineGridFirstParagraph}
            checked={body.firstParagraphSnapToGrid}
            onChange={(firstParagraphSnapToGrid) => setBody({ firstParagraphSnapToGrid })}
            tooltip={labels.baselineGridStyleTooltip}
            isDefault={rawBody?.firstParagraphSnapToGrid === undefined}
            onReset={() => resetBody('firstParagraphSnapToGrid')}
          />
        </NestedGroup>
      )}
    </>
  );
}

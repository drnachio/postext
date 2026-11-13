'use client';

import { memo } from 'react';
import { DEFAULT_PRINT_DIE_LINE, dimensionsEqual, resolvePrintDieLine } from 'postext';
import type { CmykPercent, PrintConfig, PrintDieLineConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, DimensionInput, NestedGroup, NumberInput, SelectInput, TextInput } from '../../../controls/index.js';

/** `print` with `dieLine` as its die line settings; members given
 *  `undefined` are left out, and `dieLine` (then `print`) when empty. */
export function withDieLine(print: PrintConfig | undefined, partial: Partial<PrintDieLineConfig>): PrintConfig | undefined {
  const dieLine: PrintDieLineConfig & Record<string, unknown> = { ...print?.dieLine, ...partial };
  for (const k of Object.keys(dieLine)) if (dieLine[k] === undefined) delete dieLine[k];
  const next: PrintConfig = { ...print };
  if (Object.keys(dieLine).length > 0) next.dieLine = dieLine;
  else delete next.dieLine;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Print preparation › Die line (`print.dieLine`, #1570): whether the PDF
 *  strokes the die-cuts on a plate of their own, the plate's name, the
 *  alternate proofs show it in and the stroke width. */
export const PrintDieLineGroup = memo(function PrintDieLineGroup() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.print);
  const own = raw?.dieLine;
  const cfg = resolvePrintDieLine(own);
  const D = DEFAULT_PRINT_DIE_LINE;
  const write = (partial: Partial<PrintDieLineConfig>) => dispatch({ type: 'UPDATE_CONFIG', payload: { print: withDieLine(raw, partial) } });
  const setChannel = (ch: keyof CmykPercent, v: number) => write({ cmyk: { ...cfg.cmyk, [ch]: v } });
  return (
    <CollapsibleSection title={labels.printGroupDieLine} sectionId="print-dieLine" variant="subsection"
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { print: withDieLine(raw, { output: undefined, ink: undefined, cmyk: undefined, width: undefined }) } })}
      hasOverrides={own !== undefined} resetLabel={labels.reset} resetConfirmMessage={labels.resetSectionConfirm}>
      <SelectInput variant="segmented" label={labels.printDieLineOutput} value={cfg.output} tooltip={labels.printDieLineOutputTooltip}
        options={[{ value: 'page', label: labels.printDieLineOutputPage }, { value: 'none', label: labels.printDieLineOutputNone }]}
        onChange={(v) => write({ output: v === 'none' ? 'none' : 'page' })} isDefault={own?.output === undefined} onReset={() => write({ output: undefined })} />
      {cfg.output === 'page' && (
        <NestedGroup>
          <TextInput label={labels.printDieLineInk} value={own?.ink ?? ''} placeholder={D.ink} onChange={(v) => write({ ink: v.trim() ? v : undefined })}
            tooltip={labels.printDieLineInkTooltip} isDefault={own?.ink === undefined} onReset={() => write({ ink: undefined })} />
          <div className="text-xs text-(--slate)" title={labels.printDieLineCmykTooltip}>{labels.printDieLineCmyk}</div>
          {(['c', 'm', 'y', 'k'] as const).map((ch) => (
            <NumberInput key={ch} label={ch.toUpperCase()} value={cfg.cmyk[ch]} onChange={(v) => setChannel(ch, v)} min={0} max={100} step={5}
              tooltip={labels.printDieLineCmykTooltip} isDefault={own?.cmyk === undefined} onReset={() => write({ cmyk: undefined })} />
          ))}
          <DimensionInput label={labels.printDieLineWidth} value={cfg.width} onChange={(width) => write({ width })} min={0.05} step={0.05}
            tooltip={labels.printDieLineWidthTooltip} isDefault={own?.width === undefined || dimensionsEqual(cfg.width, D.width)} onReset={() => write({ width: undefined })} />
        </NestedGroup>
      )}
    </CollapsibleSection>
  );
});

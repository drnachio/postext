'use client';

import { memo, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import {
  DEFAULT_CUT_LINES,
  DEFAULT_PRINT_BLACK_CONFIG,
  DEFAULT_PRINT_CONFIG,
  DEFAULT_PRINT_PREFLIGHT_CONFIG,
  OUTPUT_PROFILES,
  dimensionsEqual,
  colorsEqual,
  parseIccProfile,
  profileInkLimit,
  resolvePageConfig,
  resolvePrintConfig,
} from 'postext';
import type {
  CmykPercent,
  CutLinesConfig,
  PrintBlackConfig,
  PrintConfig,
  PrintPreflightConfig,
} from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  NestedGroup,
  NumberInput,
  SelectInput,
  ToggleSwitch,
} from '../../controls';
import { putBlob } from '../../storage/blobStore';
import { fill } from '../../print/fillTokens';
import { usePrintSetup } from '../../print/printSetup';

/** Print preparation (#607): crop marks and bleed, the PDF/X standard and
 *  output profile, black handling and the preflight thresholds. Writes
 *  `print` and `page.cutLines`. */
export const PrintSection = memo(function PrintSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.print);
  const rawPage = useSandboxSelector((s) => s.config.page);
  const page = resolvePageConfig(rawPage);
  const cfg = resolvePrintConfig(raw);
  const setup = usePrintSetup(raw);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const update = (partial: Partial<PrintConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { print: { ...raw, ...partial } } });
  };
  const without = <T extends object>(obj: T | undefined, key: keyof T): T | undefined => {
    if (!obj) return undefined;
    const next = { ...obj };
    delete next[key];
    return Object.keys(next).length > 0 ? next : undefined;
  };
  const resetField = (key: keyof PrintConfig) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { print: without(raw, key) } });
  };
  const updateBlack = (partial: Partial<PrintBlackConfig>) => update({ black: { ...raw?.black, ...partial } });
  const resetBlack = (key: keyof PrintBlackConfig) => {
    const black = without(raw?.black, key);
    const next = { ...raw, black };
    if (!black) delete next.black;
    dispatch({ type: 'UPDATE_CONFIG', payload: { print: Object.keys(next).length > 0 ? next : undefined } });
  };
  const updatePreflight = (partial: Partial<PrintPreflightConfig>) => update({ preflight: { ...raw?.preflight, ...partial } });
  const resetPreflight = (key: keyof PrintPreflightConfig) => {
    const preflight = without(raw?.preflight, key);
    const next = { ...raw, preflight };
    if (!preflight) delete next.preflight;
    dispatch({ type: 'UPDATE_CONFIG', payload: { print: Object.keys(next).length > 0 ? next : undefined } });
  };

  const updateCutLines = (partial: Partial<CutLinesConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { page: { ...rawPage, cutLines: { ...page.cutLines, ...partial } } } });
  };
  const resetCutLinesField = (key: keyof CutLinesConfig) => {
    const current = rawPage?.cutLines;
    if (!current || typeof current === 'boolean') return;
    const next = { ...current };
    delete next[key];
    const nextPage = { ...rawPage };
    if (Object.keys(next).length > 0) nextPage.cutLines = next;
    else delete nextPage.cutLines;
    dispatch({ type: 'UPDATE_CONFIG', payload: { page: Object.keys(nextPage).length > 0 ? nextPage : undefined } });
  };

  const resetSection = () => {
    const nextPage = { ...rawPage };
    delete nextPage.cutLines;
    dispatch({ type: 'UPDATE_CONFIG', payload: { print: undefined, page: Object.keys(nextPage).length > 0 ? nextPage : undefined } });
  };

  const handleProfile = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const bytes = await file.arrayBuffer();
      const profile = parseIccProfile(new Uint8Array(bytes));
      if (profile.colorSpace !== 'CMYK' || !profile.bToA[1] && !profile.bToA[0]) throw new Error('not CMYK');
      const fileId = await putBlob(bytes, 'application/vnd.iccprofile');
      const name = profile.description || file.name.replace(/\.(icc|icm)$/i, '');
      update({ outputProfile: 'custom', customProfile: { name, fileId } });
    } catch {
      setUploadError(labels.printProfileUploadError);
    } finally {
      setUploading(false);
    }
  };

  const standardOptions = [
    { value: 'none', label: labels.printStandardNone },
    { value: 'pdfx1a', label: labels.printStandardX1a },
    { value: 'pdfx4', label: labels.printStandardX4 },
  ];
  const profileOptions = [
    ...OUTPUT_PROFILES.map((p) => ({ value: p.id, label: p.name })),
    ...(cfg.customProfile ? [{ value: 'custom', label: fill(labels.printProfileCustom, { name: cfg.customProfile.name }) }] : []),
  ];
  const intentOptions = [
    { value: 'relative', label: labels.printIntentRelative },
    { value: 'perceptual', label: labels.printIntentPerceptual },
  ];

  const D = DEFAULT_PRINT_CONFIG;
  const B = DEFAULT_PRINT_BLACK_CONFIG;
  const P = DEFAULT_PRINT_PREFLIGHT_CONFIG;
  const C = DEFAULT_CUT_LINES;
  const cut = page.cutLines;
  const hasOverrides = (raw !== undefined && Object.keys(raw).length > 0) || rawPage?.cutLines !== undefined;
  const rich = cfg.black.richBlackColor;
  const setRich = (channel: keyof CmykPercent, v: number) => updateBlack({ richBlackColor: { ...rich, [channel]: v } });
  const richIsDefault = rich.c === B.richBlackColor.c && rich.m === B.richBlackColor.m && rich.y === B.richBlackColor.y && rich.k === B.richBlackColor.k;

  return (
    <CollapsibleSection
      title={labels.printSection}
      sectionId="print"
      onReset={resetSection}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <CollapsibleSection title={labels.printGroupMarks} sectionId="print-marks" variant="subsection">
        <ToggleSwitch
          label={labels.cutLines}
          checked={cut.enabled}
          onChange={(v) => updateCutLines({ enabled: v })}
          tooltip={labels.cutLinesTooltip}
          isDefault={cut.enabled === C.enabled}
          onReset={() => resetCutLinesField('enabled')}
        />
        {cut.enabled && (
          <NestedGroup>
            <DimensionInput label={labels.cutLinesBleed} value={cut.bleed} onChange={(d) => updateCutLines({ bleed: d })} min={0} step={0.5}
              tooltip={labels.cutLinesBleedTooltip} isDefault={dimensionsEqual(cut.bleed, C.bleed)} onReset={() => resetCutLinesField('bleed')} />
            <DimensionInput label={labels.cutLinesMarkLength} value={cut.markLength} onChange={(d) => updateCutLines({ markLength: d })} min={0} step={0.5}
              tooltip={labels.cutLinesMarkLengthTooltip} isDefault={dimensionsEqual(cut.markLength, C.markLength)} onReset={() => resetCutLinesField('markLength')} />
            <DimensionInput label={labels.cutLinesMarkOffset} value={cut.markOffset} onChange={(d) => updateCutLines({ markOffset: d })} min={0} step={0.5}
              tooltip={labels.cutLinesMarkOffsetTooltip} isDefault={dimensionsEqual(cut.markOffset, C.markOffset)} onReset={() => resetCutLinesField('markOffset')} />
            <DimensionInput label={labels.cutLinesMarkWidth} value={cut.markWidth} onChange={(d) => updateCutLines({ markWidth: d })} min={0.1} step={0.05}
              tooltip={labels.cutLinesMarkWidthTooltip} isDefault={dimensionsEqual(cut.markWidth, C.markWidth)} onReset={() => resetCutLinesField('markWidth')} />
            <ColorPicker label={labels.cutLinesColor} value={cut.color} onChange={(color) => updateCutLines({ color })}
              tooltip={labels.cutLinesColorTooltip} isDefault={colorsEqual(cut.color, C.color)} onReset={() => resetCutLinesField('color')} fieldId="print-cutLinesColor" />
          </NestedGroup>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.printGroupOutput} sectionId="print-output" variant="subsection">
        <SelectInput label={labels.printStandard} value={cfg.standard} options={standardOptions}
          onChange={(v) => update({ standard: v as PrintConfig['standard'] })} tooltip={labels.printStandardTooltip}
          isDefault={cfg.standard === D.standard} onReset={() => resetField('standard')} />
        <SelectInput label={labels.printOutputProfile} value={cfg.outputProfile} options={profileOptions}
          onChange={(v) => update({ outputProfile: v })} tooltip={labels.printOutputProfileTooltip}
          isDefault={cfg.outputProfile === D.outputProfile} onReset={() => { resetField('outputProfile'); }} />
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title={labels.printProfileUploadTooltip}
            className="flex items-center justify-center gap-1.5 rounded border border-dashed text-xs"
            style={{ borderColor: 'var(--rule)', color: 'var(--slate)', padding: '8px', cursor: uploading ? 'wait' : 'pointer' }}
          >
            {uploading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
            <span>{labels.printProfileUpload}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".icc,.icm,application/vnd.iccprofile"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleProfile(file);
              e.target.value = '';
            }}
          />
          {uploadError && <span role="alert" className="text-xs" style={{ color: 'var(--destructive)' }}>{uploadError}</span>}
          {setup.error && <span role="alert" className="text-xs" style={{ color: 'var(--destructive)' }}>{fill(labels.printProfileError, { reason: setup.error })}</span>}
        </div>
        <SelectInput label={labels.printRenderingIntent} value={cfg.renderingIntent} options={intentOptions}
          onChange={(v) => update({ renderingIntent: v as PrintConfig['renderingIntent'] })} tooltip={labels.printRenderingIntentTooltip}
          isDefault={cfg.renderingIntent === D.renderingIntent} onReset={() => resetField('renderingIntent')} />
        <ToggleSwitch label={labels.printBlackPointCompensation} checked={cfg.blackPointCompensation}
          onChange={(v) => update({ blackPointCompensation: v })} tooltip={labels.printBlackPointCompensationTooltip}
          isDefault={cfg.blackPointCompensation === D.blackPointCompensation} onReset={() => resetField('blackPointCompensation')} />
        {cfg.standard !== 'pdfx1a' && (
          <ToggleSwitch label={labels.printConvertImages} checked={cfg.convertImages}
            onChange={(v) => update({ convertImages: v })} tooltip={labels.printConvertImagesTooltip}
            isDefault={cfg.convertImages === D.convertImages} onReset={() => resetField('convertImages')} />
        )}
        <NumberInput label={labels.printInkLimit} value={cfg.inkLimit} onChange={(v) => update({ inkLimit: v })} min={100} max={400} step={5}
          tooltip={labels.printInkLimitTooltip} isDefault={cfg.inkLimit === profileInkLimit(raw)} onReset={() => resetField('inkLimit')} />
      </CollapsibleSection>

      <CollapsibleSection title={labels.printGroupBlack} sectionId="print-black" variant="subsection">
        <ToggleSwitch label={labels.printKOnlyNeutrals} checked={cfg.black.kOnlyNeutrals} onChange={(v) => updateBlack({ kOnlyNeutrals: v })}
          tooltip={labels.printKOnlyNeutralsTooltip} isDefault={cfg.black.kOnlyNeutrals === B.kOnlyNeutrals} onReset={() => resetBlack('kOnlyNeutrals')} />
        <ToggleSwitch label={labels.printOverprint} checked={cfg.black.overprint} onChange={(v) => updateBlack({ overprint: v })}
          tooltip={labels.printOverprintTooltip} isDefault={cfg.black.overprint === B.overprint} onReset={() => resetBlack('overprint')} />
        <ToggleSwitch label={labels.printRichBlack} checked={cfg.black.richBlack} onChange={(v) => updateBlack({ richBlack: v })}
          tooltip={labels.printRichBlackTooltip} isDefault={cfg.black.richBlack === B.richBlack} onReset={() => resetBlack('richBlack')} />
        {cfg.black.richBlack && (
          <NestedGroup>
            <div className="text-xs" style={{ color: 'var(--slate)' }} title={labels.printRichBlackColorTooltip}>{labels.printRichBlackColor}</div>
            {(['c', 'm', 'y', 'k'] as const).map((ch) => (
              <NumberInput key={ch} label={ch.toUpperCase()} value={rich[ch]} onChange={(v) => setRich(ch, v)} min={0} max={100} step={5}
                tooltip={labels.printRichBlackColorTooltip} isDefault={richIsDefault} onReset={() => resetBlack('richBlackColor')} />
            ))}
            <DimensionInput label={labels.printRichBlackMinSize} value={cfg.black.richBlackMinSize} onChange={(d) => updateBlack({ richBlackMinSize: d })} min={0} step={0.5}
              tooltip={labels.printRichBlackMinSizeTooltip} isDefault={dimensionsEqual(cfg.black.richBlackMinSize, B.richBlackMinSize)} onReset={() => resetBlack('richBlackMinSize')} />
          </NestedGroup>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.printGroupPreflight} sectionId="print-preflight" variant="subsection">
        <ToggleSwitch label={labels.printPreflightEnabled} checked={cfg.preflight.enabled} onChange={(v) => updatePreflight({ enabled: v })}
          tooltip={labels.printPreflightEnabledTooltip} isDefault={cfg.preflight.enabled === P.enabled} onReset={() => resetPreflight('enabled')} />
        {cfg.preflight.enabled && (
          <NestedGroup>
            <NumberInput label={labels.printMinImageResolution} value={cfg.preflight.minImageResolution} onChange={(v) => updatePreflight({ minImageResolution: v })} min={72} max={1200} step={10}
              tooltip={labels.printMinImageResolutionTooltip} isDefault={cfg.preflight.minImageResolution === P.minImageResolution} onReset={() => resetPreflight('minImageResolution')} />
            <NumberInput label={labels.printCriticalImageResolution} value={cfg.preflight.criticalImageResolution} onChange={(v) => updatePreflight({ criticalImageResolution: v })} min={36} max={1200} step={10}
              tooltip={labels.printCriticalImageResolutionTooltip} isDefault={cfg.preflight.criticalImageResolution === P.criticalImageResolution} onReset={() => resetPreflight('criticalImageResolution')} />
            <DimensionInput label={labels.printMinRuleWidth} value={cfg.preflight.minRuleWidth} onChange={(d) => updatePreflight({ minRuleWidth: d })} min={0} step={0.05}
              tooltip={labels.printMinRuleWidthTooltip} isDefault={dimensionsEqual(cfg.preflight.minRuleWidth, P.minRuleWidth)} onReset={() => resetPreflight('minRuleWidth')} />
            <DimensionInput label={labels.printSmallTextSize} value={cfg.preflight.smallTextSize} onChange={(d) => updatePreflight({ smallTextSize: d })} min={0} step={0.5}
              tooltip={labels.printSmallTextSizeTooltip} isDefault={dimensionsEqual(cfg.preflight.smallTextSize, P.smallTextSize)} onReset={() => resetPreflight('smallTextSize')} />
            <DimensionInput label={labels.printSafeZone} value={cfg.preflight.safeZone} onChange={(d) => updatePreflight({ safeZone: d })} min={0} step={0.5}
              tooltip={labels.printSafeZoneTooltip} isDefault={dimensionsEqual(cfg.preflight.safeZone, P.safeZone)} onReset={() => resetPreflight('safeZone')} />
            <DimensionInput label={labels.printBleedSnap} value={cfg.preflight.bleedSnap} onChange={(d) => updatePreflight({ bleedSnap: d })} min={0} step={0.5}
              tooltip={labels.printBleedSnapTooltip} isDefault={dimensionsEqual(cfg.preflight.bleedSnap, P.bleedSnap)} onReset={() => resetPreflight('bleedSnap')} />
            <ToggleSwitch label={labels.printCheckFonts} checked={cfg.preflight.checkFonts} onChange={(v) => updatePreflight({ checkFonts: v })}
              tooltip={labels.printCheckFontsTooltip} isDefault={cfg.preflight.checkFonts === P.checkFonts} onReset={() => resetPreflight('checkFonts')} />
          </NestedGroup>
        )}
      </CollapsibleSection>
    </CollapsibleSection>
  );
});

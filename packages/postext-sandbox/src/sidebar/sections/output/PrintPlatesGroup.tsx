'use client';

import { memo, useMemo, useState } from 'react';
import type { PrintConfig, PrintPlatesConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, NestedGroup, SelectInput, TextInput, ToggleSwitch } from '../../../controls/index.js';
import { fill } from '../../../print/fillTokens.js';
import {
  PROCESS_PLATES,
  formatCurve,
  hasPlate,
  offeredSpotPlates,
  parseCurve,
  setCurve,
  setImagePlates,
  togglePlate,
  withPlates,
} from './plateEdits.js';

/** Process plates keep their PDF names in every language; the labels
 *  (`printPlateCyan` …) only let the settings search find them. */

/** Print → Plates (`print.plates`, #1476): the plates a two-ink (or
 *  one-ink) book prints on, switched on one by one — the process plates and
 *  the spot inks the book and its ink table name — then the plates its
 *  pictures print on and each one's tone curve. */
export const PrintPlatesGroup = memo(function PrintPlatesGroup() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const raw: PrintConfig | undefined = config.print;
  const plates: PrintPlatesConfig | undefined = raw?.plates;
  const spots = useMemo(() => offeredSpotPlates(config), [config]);
  const on = (plates?.inks ?? []).length > 0;
  const processLabels = { Cyan: labels.printPlateCyan, Magenta: labels.printPlateMagenta, Yellow: labels.printPlateYellow, Black: labels.printPlateBlack };

  const write = (next: PrintPlatesConfig | undefined) => dispatch({ type: 'UPDATE_CONFIG', payload: { print: withPlates(raw, next) } });
  const toggle = (plate: string) => (checked: boolean) => write(togglePlate(plates, plate, checked));
  const plateList = plates?.inks ?? [];
  const images = plates?.images ?? [];
  const none = { value: '', label: labels.printPlatesImagesNone };
  const choices = plateList.map((p) => ({ value: p, label: p }));
  const first = images[0] ?? '';
  const second = images[1] ?? '';

  return (
    <CollapsibleSection
      title={labels.printGroupPlates}
      sectionId="print-plates"
      variant="subsection"
      onReset={() => write(undefined)}
      hasOverrides={on}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <p className="mb-2 text-xs text-(--slate) [text-wrap:pretty]">{on ? labels.printPlatesIntro : labels.printPlatesEmpty}</p>
      <div className="mb-1 text-xs text-(--slate)">{labels.printPlatesProcess}</div>
      {PROCESS_PLATES.map((plate) => (
        <ToggleSwitch key={plate} label={processLabels[plate]} checked={hasPlate(plates, plate)} onChange={toggle(plate)}
          tooltip={labels.printPlateTooltip} isDefault={!hasPlate(plates, plate)} />
      ))}
      {spots.length > 0 && <div className="mt-2 mb-1 text-xs text-(--slate)">{labels.printPlatesSpot}</div>}
      {spots.map((plate) => (
        <ToggleSwitch key={plate} label={plate} checked={hasPlate(plates, plate)} onChange={toggle(plate)}
          tooltip={labels.printPlateTooltip} isDefault={!hasPlate(plates, plate)} />
      ))}
      {on && plates && (
        <NestedGroup>
          <SelectInput stacked label={labels.printPlatesImages} value={first} options={[none, ...choices]}
            onChange={(v) => write(setImagePlates(plates, [v, second]))} tooltip={labels.printPlatesImagesTooltip}
            isDefault={images.length === 0} onReset={() => write(setImagePlates(plates, []))} />
          {first && (
            <SelectInput stacked label={labels.printPlatesImagesSecond} value={second} options={[none, ...choices.filter((c) => c.value !== first)]}
              onChange={(v) => write(setImagePlates(plates, [first, v]))} tooltip={labels.printPlatesImagesSecondTooltip}
              isDefault={!second} onReset={() => write(setImagePlates(plates, [first]))} />
          )}
          {(images.length > 0 ? images : [plateList.find((p) => p === 'Black') ?? plateList[0]!]).map((plate) => (
            <CurveInput key={plate} plate={plate} plates={plates} label={fill(labels.printPlatesCurve, { plate })}
              tooltip={labels.printPlatesCurveTooltip} onChange={(text) => write(setCurve(plates, plate, text))} />
          ))}
        </NestedGroup>
      )}
      {on && <p className="mt-2 text-xs text-(--slate) [text-wrap:pretty]">{labels.printPlatesProofNote}</p>}
    </CollapsibleSection>
  );
});

/** A picture plate's curve as one line of `tone ink` pairs. What is typed
 *  stays as typed while it reads back as the stored points; a change from
 *  elsewhere (reset, undo) replaces it. */
function CurveInput({ plate, plates, label, tooltip, onChange }: {
  plate: string;
  plates: PrintPlatesConfig;
  label: string;
  tooltip: string;
  onChange: (text: string) => void;
}) {
  const key = Object.keys(plates.curves ?? {}).find((n) => n.toLowerCase() === plate.toLowerCase());
  const stored = formatCurve(key ? plates.curves![key] : undefined);
  const [draft, setDraft] = useState(stored);
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) {
    setSeen(stored);
    setDraft(stored);
  }
  const type = (text: string) => {
    setDraft(text);
    setSeen(formatCurve(parseCurve(text)));
    onChange(text);
  };
  return (
    <TextInput label={label} value={draft} onChange={type} placeholder="0 0, 50 40, 100 100"
      tooltip={tooltip} isDefault={stored === ''} onReset={() => type('')} />
  );
}

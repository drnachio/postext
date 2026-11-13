'use client';

import { useId } from 'react';
import { Sparkles } from 'lucide-react';
import { finishSheen, guessInkFinish, type InkFinish, type InkSheen, type SpotColor, type SpotInk } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { Button, NumberField, Select, Switch } from '../../../ui/index.js';
import { FINISH_KINDS, finishKindLabel, finishText, finishWithKind, finishWithSheen, sheenLabel, sheensFor, type FinishChoice } from '../inkFinish.js';
import { usedInkFinish } from '../../../print/usedInkFinishes.js';
import { FieldIdsContext } from '../../fieldContext.js';
import { TextControl } from '../../inputs/TextInput.js';
import type { CMYK } from '../color-utils.js';

interface Props {
  /** The spot colour being edited; undefined while it has no ink name. */
  spot: SpotColor | undefined;
  /** What a new ink starts as: the colour's current separation. */
  fallbackCmyk: CMYK;
  /** The inks the configuration defines already, offered by name. */
  knownInks: SpotInk[];
  onChange: (spot: SpotColor) => void;
}

const CAPTION = 'block text-xs text-(--slate)';

/** The spot colour tab: the ink's name (a known one fills in its values),
 *  its look at 100 % in CMYK, the tint, whether it overprints, and its
 *  finish and sheen (#1570; a name that suggests a finish offers it). Its
 *  fields are the Sandbox's own (28 px, 44 px with large targets on), so
 *  they fit the 260 px popover four abreast. */
export function SpotInputs({ spot, fallbackCmyk, knownInks, onChange }: Props) {
  const labels = useSandboxLabels();
  const listId = useId();
  const nameId = useId();
  const cmykId = useId();
  const overprintId = useId();
  const overprintLabelId = useId();
  const finishId = useId();
  const sheenId = useId();
  const config = useSandboxSelector((st) => st.config);
  const cmyk = spot?.cmyk ?? fallbackCmyk;
  const tint = spot?.tint ?? 100;
  const overprint = spot?.overprint ?? false;
  const named = !!spot?.name.trim();
  const finish = spot?.finish;
  // Only a hint: a name that reads like a special ink offers its finish,
  // and nothing is set until the reader says so.
  const suggested = named && !finish ? guessInkFinish(spot!.name) : undefined;

  const emit = (next: Partial<SpotColor>) => {
    const merged: SpotColor = { name: spot?.name ?? '', cmyk, tint, ...(overprint ? { overprint } : {}), ...(finish ? { finish } : {}), ...next };
    if (!merged.overprint) delete merged.overprint;
    if (!merged.finish) delete merged.finish;
    onChange(merged);
  };

  const setName = (name: string) => {
    // A known ink brings its own values: one name, one plate.
    const ink = knownInks.find((i) => i.name === name.trim());
    if (ink) emit({ name, cmyk: { ...ink.cmyk }, overprint: ink.overprint, finish: usedInkFinish(config, ink.name) ?? finish });
    else emit({ name });
  };

  const sheens = finish ? sheensFor(finish.kind) : [];
  const defaultSheen = finish ? finishSheen({ kind: finish.kind }) : undefined;
  const finishOptions = (['none', ...FINISH_KINDS] as FinishChoice[]).map((k) => ({ value: k, label: finishKindLabel(k, labels) }));
  const sheenOptions = [
    { value: 'default', label: defaultSheen ? labels.inkSheenDefault.replace('__sheen__', sheenLabel(defaultSheen, labels).toLocaleLowerCase()) : labels.inkFinishNone },
    ...sheens.map((sh) => ({ value: sh, label: sheenLabel(sh, labels) })),
  ];
  const setFinish = (f: InkFinish | undefined) => emit({ finish: f });

  return (
    // The popover sits inside the colour's field row: its ids name the
    // swatch, not these fields.
    <FieldIdsContext.Provider value={null}>
      <div className="flex flex-col gap-2">
        <div>
          <label htmlFor={nameId} className={`${CAPTION} mb-1`}>{labels.colorSpotName}</label>
          <TextControl
            id={nameId}
            list={knownInks.length > 0 ? listId : undefined}
            value={spot?.name ?? ''}
            placeholder="PANTONE 286 C"
            onChange={setName}
            className="w-full"
          />
          {knownInks.length > 0 && (
            <datalist id={listId}>
              {knownInks.map((i) => <option key={i.name} value={i.name} />)}
            </datalist>
          )}
        </div>

        <fieldset disabled={!named} className="m-0 flex flex-col gap-2 border-0 p-0 disabled:opacity-50">
          <div role="group" aria-labelledby={cmykId}>
            <div id={cmykId} className={`${CAPTION} mb-1`}>{labels.colorSpotCmyk}</div>
            <div className="flex justify-between gap-1.5">
              {(['c', 'm', 'y', 'k'] as const).map((ch) => (
                <div key={ch} className="flex flex-col items-center gap-0.5">
                  <NumberField
                    value={cmyk[ch]}
                    onValueChange={(v) => emit({ cmyk: { ...cmyk, [ch]: v } })}
                    min={0}
                    max={100}
                    steppers={false}
                    widthCh={4}
                    ariaLabel={ch.toUpperCase()}
                  />
                  <span aria-hidden="true" className="text-xs text-(--slate)">{ch.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-xs text-(--slate)">{labels.colorSpotTint}</span>
              <NumberField
                value={tint}
                onValueChange={(v) => emit({ tint: v })}
                min={0}
                max={100}
                steppers={false}
                widthCh={4}
                ariaLabel={labels.colorSpotTint}
              />
              <span aria-hidden="true" className="text-xs text-(--slate)">%</span>
            </div>
            <div className="flex items-center gap-1">
              <Switch id={overprintId} checked={overprint} onCheckedChange={(v) => emit({ overprint: v })} disabled={!named} ariaLabelledBy={overprintLabelId} />
              <label id={overprintLabelId} htmlFor={overprintId} className="cursor-pointer text-xs text-(--foreground)">{labels.colorSpotOverprint}</label>
            </div>
          </div>

          <div className="flex gap-1.5">
            <div className="min-w-0 flex-1">
              <div id={finishId} className={`${CAPTION} mb-1`}>{labels.inkFinish}</div>
              <Select size="sm" value={finish?.kind ?? 'none'} options={finishOptions} ariaLabelledBy={finishId} disabled={!named} className="w-full"
                onValueChange={(v) => setFinish(finishWithKind(finish, v as FinishChoice))} />
            </div>
            {sheens.length > 0 && finish && (
              <div className="min-w-0 flex-1">
                <div id={sheenId} className={`${CAPTION} mb-1`}>{labels.inkSheen}</div>
                <Select size="sm" value={finish.sheen ?? 'default'} options={sheenOptions} ariaLabelledBy={sheenId} disabled={!named} className="w-full"
                  onValueChange={(v) => setFinish(finishWithSheen(finish, v === 'default' ? undefined : (v as InkSheen)))} />
              </div>
            )}
          </div>
          {suggested && (
            <Button variant="outline" size="xs" icon={<Sparkles size={12} aria-hidden="true" />} onClick={() => setFinish(suggested)} className="self-start">
              {labels.colorSpotFinishSuggest.replace('__finish__', finishText(suggested, labels))}
            </Button>
          )}
        </fieldset>

        <p className="m-0 text-xs text-(--slate) [text-wrap:pretty]">{labels.colorSpotHint}</p>
      </div>
    </FieldIdsContext.Provider>
  );
}

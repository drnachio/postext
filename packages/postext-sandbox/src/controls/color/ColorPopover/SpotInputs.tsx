'use client';

import { useId } from 'react';
import type { SpotColor, SpotInk } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext.js';
import type { CMYK } from '../color-utils.js';
import { SmallInput } from './SmallInput.js';

interface Props {
  /** The spot colour being edited; undefined while it has no ink name. */
  spot: SpotColor | undefined;
  /** What a new ink starts as: the colour's current separation. */
  fallbackCmyk: CMYK;
  /** The inks the configuration defines already, offered by name. */
  knownInks: SpotInk[];
  onChange: (spot: SpotColor) => void;
}

const fieldStyle = {
  width: '100%',
  padding: '4px 6px',
  fontSize: 11,
  borderRadius: 3,
  border: '1px solid var(--pt-control-border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  boxSizing: 'border-box' as const,
};

const captionStyle = { margin: '6px 0 2px', fontSize: 10, color: 'var(--slate)' };

/** The spot colour tab: the ink's name (a known one fills in its values),
 *  its look at 100 % in CMYK, the tint, and whether it overprints. */
export function SpotInputs({ spot, fallbackCmyk, knownInks, onChange }: Props) {
  const labels = useSandboxLabels();
  const listId = useId();
  const nameId = useId();
  const cmyk = spot?.cmyk ?? fallbackCmyk;
  const tint = spot?.tint ?? 100;
  const overprint = spot?.overprint ?? false;
  const named = !!spot?.name.trim();

  const emit = (next: Partial<SpotColor>) => {
    const merged: SpotColor = { name: spot?.name ?? '', cmyk, tint, ...(overprint ? { overprint } : {}), ...next };
    if (!merged.overprint) delete merged.overprint;
    onChange(merged);
  };

  const setName = (name: string) => {
    // A known ink brings its own values: one name, one plate.
    const ink = knownInks.find((i) => i.name === name.trim());
    if (ink) emit({ name, cmyk: { ...ink.cmyk }, overprint: ink.overprint });
    else emit({ name });
  };

  return (
    <div>
      <label htmlFor={nameId} style={{ ...captionStyle, display: 'block', marginTop: 0 }}>{labels.colorSpotName}</label>
      <input
        id={nameId}
        type="text"
        list={knownInks.length > 0 ? listId : undefined}
        value={spot?.name ?? ''}
        placeholder="PANTONE 286 C"
        onChange={(e) => setName(e.target.value)}
        style={fieldStyle}
      />
      {knownInks.length > 0 && (
        <datalist id={listId}>
          {knownInks.map((i) => <option key={i.name} value={i.name} />)}
        </datalist>
      )}

      <fieldset disabled={!named} style={{ border: 'none', margin: 0, padding: 0, opacity: named ? 1 : 0.5 }}>
        <legend style={captionStyle}>{labels.colorSpotCmyk}</legend>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
          {(['c', 'm', 'y', 'k'] as const).map((ch) => (
            <SmallInput key={ch} value={cmyk[ch]} onChange={(v) => emit({ cmyk: { ...cmyk, [ch]: v } })} label={ch.toUpperCase()} max={100} />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <SmallInput value={tint} onChange={(v) => emit({ tint: v })} label={labels.colorSpotTint} max={100} />
            <span aria-hidden="true" style={{ fontSize: 10, color: 'var(--slate)', alignSelf: 'flex-start', marginTop: 4 }}>%</span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--foreground)', cursor: 'pointer' }}>
            <input type="checkbox" checked={overprint} onChange={(e) => emit({ overprint: e.target.checked })} />
            {labels.colorSpotOverprint}
          </label>
        </div>
      </fieldset>

      <p style={{ margin: '6px 0 0', fontSize: 10, lineHeight: 1.35, color: 'var(--slate)' }}>{labels.colorSpotHint}</p>
    </div>
  );
}

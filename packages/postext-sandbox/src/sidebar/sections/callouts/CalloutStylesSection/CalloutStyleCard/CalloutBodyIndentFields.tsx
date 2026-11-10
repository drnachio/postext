'use client';

// A box style's indents: `body.firstLineIndent` and `body.hangingIndent`
// (#1451), which hangs as `bodyText.hangingIndent` (`true` / `false`) or as
// a paragraph style's length.
import { DEFAULT_BODY_TEXT_CONFIG, type CalloutBodyStyleConfig, type Dimension, type ResolvedCalloutStyleConfig } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../../../../context/SandboxContext.js';
import { DimensionInput, SelectInput, NestedGroup } from '../../../../../controls/index.js';
import { SPACING_UNITS } from '../shared.js';

type HangMode = 'off' | 'firstLine' | 'length';

/** One em: the length a box starts from when its hang turns into one. */
const ONE_EM: Dimension = { value: 1, unit: 'em' };

export function CalloutBodyIndentFields({ raw, resolved, onChange, onReset }: {
  raw: CalloutBodyStyleConfig | undefined;
  resolved: ResolvedCalloutStyleConfig['body'];
  onChange: (partial: Partial<CalloutBodyStyleConfig>) => void;
  onReset: (field: 'firstLineIndent' | 'hangingIndent') => void;
}) {
  const labels = useSandboxLabels();
  const bodyHangs = useSandboxSelector((s) => s.config.bodyText?.hangingIndent ?? DEFAULT_BODY_TEXT_CONFIG.hangingIndent);
  const hang = raw?.hangingIndent ?? bodyHangs;
  const mode: HangMode = typeof hang === 'object' ? 'length' : hang ? 'firstLine' : 'off';
  const setMode = (next: string) => {
    if (next === 'length') onChange({ hangingIndent: typeof hang === 'object' ? hang : ONE_EM });
    else onChange({ hangingIndent: next === 'firstLine' });
  };
  return (
    <>
      <DimensionInput
        label={labels.bodyFirstLineIndent}
        value={resolved.firstLineIndent}
        onChange={(v) => onChange({ firstLineIndent: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        isDefault={raw?.firstLineIndent === undefined}
        onReset={() => onReset('firstLineIndent')}
      />
      <SelectInput
        label={labels.calloutStyleBodyHangingIndent}
        value={mode}
        options={[
          { value: 'off', label: labels.calloutStyleBodyHangingIndentOff },
          { value: 'firstLine', label: labels.calloutStyleBodyHangingIndentFirstLine },
          { value: 'length', label: labels.calloutStyleBodyHangingIndentLength },
        ]}
        onChange={setMode}
        variant="segmented"
        tooltip={labels.calloutStyleBodyHangingIndentTooltip}
        isDefault={raw?.hangingIndent === undefined}
        onReset={() => onReset('hangingIndent')}
      />
      {typeof hang === 'object' && (
        <NestedGroup>
          <DimensionInput
            label={labels.calloutStyleBodyHangingIndentWidth}
            value={hang}
            onChange={(v) => onChange({ hangingIndent: v })}
            min={0}
            step={0.1}
            units={SPACING_UNITS}
            tooltip={labels.calloutStyleBodyHangingIndentWidthTooltip}
            isDefault={false}
          />
        </NestedGroup>
      )}
    </>
  );
}

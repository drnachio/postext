'use client';

import { FIGURE_STYLES, isFigureStyle } from 'postext';
import type { FigureStyle } from 'postext';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { SelectInput } from '../../controls/index.js';
import type { SandboxLabels } from '../../types/labels.js';

/**
 * A text style's `figureStyle` (#1237): the OpenType figures its text is
 * set with. The first option leaves the key out. Where the style takes its
 * family from another (`inherits`: a paragraph style, a heading level or
 * style, a table, a caption) that is "Inherited", and "Font default" is
 * the `'default'` value that undoes the inherited figures; where nothing
 * is inherited (the body text, the headings, a design text) leaving the
 * key out already gives the font's own figures, so the list offers that
 * once and a stored `'default'` shows as it.
 */

const UNSET = 'unset';

function optionLabel(labels: SandboxLabels, style: FigureStyle): string {
  switch (style) {
    case 'oldstyle': return labels.figureStyleOldstyle;
    case 'lining': return labels.figureStyleLining;
    case 'tabular': return labels.figureStyleTabular;
    case 'proportional': return labels.figureStyleProportional;
    case 'oldstyle-tabular': return labels.figureStyleOldstyleTabular;
    case 'oldstyle-proportional': return labels.figureStyleOldstyleProportional;
    case 'lining-tabular': return labels.figureStyleLiningTabular;
    case 'lining-proportional': return labels.figureStyleLiningProportional;
    default: return labels.figureStyleFontDefault;
  }
}

export function FigureStyleField({
  value,
  inherits = false,
  onChange,
  onReset,
}: {
  /** The style's stored `figureStyle`, unset when it has none. */
  value: FigureStyle | undefined;
  /** Whether unset takes the figures of another style. */
  inherits?: boolean;
  onChange: (next: FigureStyle) => void;
  /** Removes the key. */
  onReset: () => void;
}) {
  const labels = useSandboxLabels();
  const stored = isFigureStyle(value) ? value : undefined;
  const options = [
    { value: UNSET, label: inherits ? labels.figureStyleInherited : labels.figureStyleFontDefault },
    ...(inherits ? [{ value: 'default', label: labels.figureStyleFontDefault }] : []),
    ...FIGURE_STYLES.filter((s) => s !== 'default').map((s) => ({ value: s, label: optionLabel(labels, s) })),
  ];
  const shown = stored === undefined || (stored === 'default' && !inherits) ? UNSET : stored;
  return (
    <SelectInput
      label={labels.figureStyle}
      value={shown}
      options={options}
      onChange={(v) => (v === UNSET ? onReset() : isFigureStyle(v) && onChange(v))}
      tooltip={labels.figureStyleTooltip}
      isDefault={stored === undefined}
      onReset={onReset}
    />
  );
}

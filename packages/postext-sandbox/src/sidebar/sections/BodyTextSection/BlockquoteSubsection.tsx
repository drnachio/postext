'use client';

import { DEFAULT_BLOCKQUOTE_CONFIG, colorsEqual, dimensionsEqual } from 'postext';
import type { BlockquoteConfig, BodyTextConfig, ResolvedBodyTextConfig } from 'postext';
import { CollapsibleSection, ColorPicker, DimensionInput, ToggleSwitch } from '../../../controls';
import type { useSandboxLabels } from '../../../context/SandboxContext';
import { INDENT_UNITS } from './constants';

interface Props {
  bodyText: ResolvedBodyTextConfig;
  raw: BodyTextConfig | undefined;
  updateBodyText: (partial: Partial<BodyTextConfig>) => void;
  labels: ReturnType<typeof useSandboxLabels>;
}

const D = DEFAULT_BLOCKQUOTE_CONFIG;

/** How Markdown blockquotes (`> …`) are set: `bodyText.blockquote`. */
export function BlockquoteSubsection({ bodyText, raw, updateBodyText, labels }: Props) {
  const quote = bodyText.blockquote;
  const update = (partial: Partial<BlockquoteConfig>) => {
    updateBodyText({ blockquote: { ...raw?.blockquote, ...partial } });
  };
  const reset = (field: keyof BlockquoteConfig) => {
    if (!raw?.blockquote) return;
    const next = { ...raw.blockquote };
    delete next[field];
    updateBodyText({ blockquote: Object.keys(next).length > 0 ? next : undefined });
  };

  return (
    <CollapsibleSection title={labels.bodyGroupBlockquotes} sectionId="bodyText-blockquotes" variant="subsection">
      <ColorPicker
        label={labels.bodyBlockquoteColor}
        value={quote.color}
        onChange={(color) => update({ color })}
        tooltip={labels.bodyBlockquoteColorTooltip}
        isDefault={colorsEqual(quote.color, D.color)}
        onReset={() => reset('color')}
        fieldId="bodyText-blockquote-color"
      />
      <ToggleSwitch
        label={labels.bodyBlockquoteItalic}
        checked={quote.italic}
        onChange={(italic) => update({ italic })}
        tooltip={labels.bodyBlockquoteItalicTooltip}
        isDefault={quote.italic === D.italic}
        onReset={() => reset('italic')}
      />
      <DimensionInput
        label={labels.bodyBlockquoteIndent}
        value={quote.indent}
        onChange={(indent) => update({ indent })}
        min={0}
        step={0.25}
        tooltip={labels.bodyBlockquoteIndentTooltip}
        isDefault={dimensionsEqual(quote.indent, D.indent)}
        onReset={() => reset('indent')}
        units={INDENT_UNITS}
      />
      <DimensionInput
        label={labels.bodyBlockquoteFirstLineIndent}
        value={quote.firstLineIndent ?? bodyText.firstLineIndent}
        onChange={(firstLineIndent) => update({ firstLineIndent })}
        min={0}
        step={0.25}
        tooltip={labels.bodyBlockquoteFirstLineIndentTooltip}
        isDefault={quote.firstLineIndent === undefined}
        onReset={() => reset('firstLineIndent')}
        units={INDENT_UNITS}
      />
    </CollapsibleSection>
  );
}

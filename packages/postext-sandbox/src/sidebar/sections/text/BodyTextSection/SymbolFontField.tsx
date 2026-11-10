'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../../context/SandboxContext.js';
import type { PostextConfig } from 'postext';
import { FontPicker } from '../../../../controls/index.js';

/** Body text → Symbol font (`symbolFont`, #1460): the family that sets the
 *  characters the text's fonts lack. Its own component, so the section's
 *  index stays under the size limit. */
export const SymbolFontField = memo(function SymbolFontField() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const symbolFont = useSandboxSelector((s) => s.config.symbolFont);
  const update = (value: PostextConfig['symbolFont']) => dispatch({ type: 'UPDATE_CONFIG', payload: { symbolFont: value } });
  return (
    <FontPicker
      label={labels.symbolFont}
      value={symbolFont ?? ''}
      onChange={(font) => update(font || undefined)}
      tooltip={labels.symbolFontTooltip}
      isDefault={!symbolFont}
      onReset={() => update(undefined)}
      searchPlaceholder={labels.bodyFontSearch}
      noResultsLabel={labels.bodyFontNoResults}
    />
  );
});

'use client';

import { useMemo, useState } from 'react';
import { applyDesign, compositionConventionDesign, compositionConventionFor, followsCompositionConvention, type BodyTextConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { Button, announce } from '../../../ui/index.js';
import { fill } from '../../../print/fillTokens.js';
import { localeDisplayName } from '../../../presets/localeNames.js';

/**
 * A note at the top of the Composition rules when the book's language has
 * a composition convention (#1540, `COMPOSITION_CONVENTIONS`) and the
 * book's rules are not that convention's: it names the language and offers
 * Apply. Nothing changes until the reader applies it, and Undo, while the
 * rules are still the convention's, brings back the ones the book had. In
 * a book in several languages it shows for one edition (the language is
 * that edition's, and the write goes to it or to the chapter style being
 * edited), not while the panel edits every language at once, where it
 * would give one language's rules to all.
 */
export function CompositionHint({ fallbackLanguage }: { fallbackLanguage: string }) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const config = useSandboxSelector((s) => s.config);
  const everyLanguage = useSandboxSelector((s) => s.configLayers?.scope === 'all');
  const uiLocale = useSandboxSelector((s) => s.locale);
  const [before, setBefore] = useState<{ bodyText: BodyTextConfig | undefined } | null>(null);
  const convention = compositionConventionFor(config.locale ?? fallbackLanguage);
  const follows = useMemo(() => !convention || followsCompositionConvention(config, convention), [config, convention]);
  if (!convention || everyLanguage) return null;
  if (follows && !before) return null;
  const language = localeDisplayName(convention.locale, uiLocale);

  const apply = () => {
    const next = applyDesign(config, compositionConventionDesign(convention));
    dispatch({ type: 'UPDATE_CONFIG', payload: { bodyText: next.bodyText }, history: { merge: false } });
    setBefore({ bodyText: config.bodyText });
    announce(fill(labels.compositionHintApplied, { language }));
  };
  const undo = () => {
    if (!before) return;
    dispatch({ type: 'UPDATE_CONFIG', payload: { bodyText: before.bodyText }, history: { merge: false } });
    setBefore(null);
    announce(labels.compositionHintUndone);
  };

  return (
    <div role="status" className="mb-2 flex flex-col gap-2 rounded-md border border-(--brand) p-2 text-xs">
      <span>{fill(follows ? labels.compositionHintApplied : labels.compositionHintAvailable, { language })}</span>
      <div className="flex justify-end">
        {follows ? (
          <Button variant="outline" size="sm" onClick={undo}>{labels.compositionHintUndo}</Button>
        ) : (
          <Button variant="primary" size="sm" onClick={apply}>{labels.compositionHintApply}</Button>
        )}
      </div>
    </div>
  );
}

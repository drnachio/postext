'use client';

import { useMemo, useState } from 'react';
import type { PostextConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { Button, announce } from '../../ui/index.js';
import { fill } from '../../print/fillTokens.js';
import { localeDisplayName } from '../../presets/localeNames.js';
import { conventionFor } from './compositionConventions.js';
import { followsComposition, withCompositionOf } from './compositionPaths.js';

/**
 * A note beside the hyphenation settings when the book's language has a
 * composition convention (`COMPOSITION_CONVENTIONS`) and the book's rules
 * are not that convention's: it names it and offers Apply. Nothing changes
 * until the reader applies it, and Undo, while the rules are still the
 * convention's, brings back the ones the book had. In a book in several
 * languages it shows for one edition (the language is that edition's),
 * not while the panel edits every language at once.
 */
export function CompositionHint({ fallbackLanguage }: { fallbackLanguage: string }) {
  const labels = useSandboxLabels();
  const dispatch = useSandboxDispatch();
  const config = useSandboxSelector((s) => s.config);
  const everyLanguage = useSandboxSelector((s) => s.configLayers?.scope === 'all');
  const uiLocale = useSandboxSelector((s) => s.locale);
  const [applied, setApplied] = useState<PostextConfig | null>(null);
  const tag = config.locale ?? fallbackLanguage;
  const convention = conventionFor(tag);
  const matches = useMemo(() => !convention || followsComposition(config, convention.config), [config, convention]);
  if (!convention || everyLanguage) return null;
  if (matches && !applied) return null;
  const language = localeDisplayName(tag, uiLocale);
  const name = String(labels[convention.nameKey]);

  const apply = () => {
    dispatch({ type: 'SET_CONFIG', payload: withCompositionOf(config, convention.config), history: { merge: false } });
    setApplied(config);
    announce(fill(labels.compositionHintApplied, { language, name }));
  };
  const undo = () => {
    if (!applied) return;
    dispatch({ type: 'SET_CONFIG', payload: applied, history: { merge: false } });
    setApplied(null);
    announce(labels.compositionHintUndone);
  };

  return (
    <div role="status" className="flex flex-col gap-2 rounded-md border border-(--brand) p-2 text-xs">
      <span>{fill(matches ? labels.compositionHintApplied : labels.compositionHintAvailable, { language, name })}</span>
      <div className="flex justify-end">
        {matches ? (
          <Button variant="outline" size="sm" onClick={undo}>{labels.compositionHintUndo}</Button>
        ) : (
          <Button variant="primary" size="sm" onClick={apply}>{labels.compositionHintApply}</Button>
        )}
      </div>
    </div>
  );
}

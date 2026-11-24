'use client';

// What the Design panel is editing, in one row at its top (#1704): the
// settings of every language or of the edition on screen (a book in
// several languages, #1209), and the book's design or a chapter style
// (#1521). Under the row, only what the moment calls for: what the
// language scope means while the panel's help is on, the style being
// edited, the fields the edition sets of its own, the notice of a change
// some editions do not follow.

import { useId } from 'react';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { ChapterStyleEditor, ChapterStyleMenu, useChapterStyleEdit } from './ChapterStyleBar.js';
import { ConfigScopeHint, ConfigScopeNotes, ConfigScopeSwitch } from './ConfigScopeBar.js';
import { useConfigScope } from './ConfigScopeProvider.js';

export function DesignScopeBar({ help }: { help: boolean }) {
  const labels = useSandboxLabels();
  const layers = useSandboxSelector((s) => s.configLayers);
  const { layer } = useConfigScope();
  const chapterStyle = useChapterStyleEdit();
  const hintId = useId();
  const languages = !!layers && !!layer;
  // The rule over the bar takes the colour of the narrower thing edited:
  // one edition, or a chapter style.
  const narrow = (languages && layers.scope === 'edition') || !!chapterStyle.style;
  return (
    <div
      data-design-scope=""
      className="@container flex shrink-0 flex-col gap-1.5 border-b border-(--rule) px-3 py-2"
      style={languages || chapterStyle.style ? { borderTop: `3px solid ${narrow ? 'var(--edition, var(--brand))' : 'var(--brand)'}` } : undefined}
    >
      <div className="flex items-center gap-1.5">
        {languages
          ? <ConfigScopeSwitch hintId={hintId} className="min-w-0 flex-1" />
          : <span className="shrink-0 text-[0.68rem] text-(--slate)">{labels.chapterStyleBarLabel}</span>}
        <ChapterStyleMenu state={chapterStyle} compact={languages} />
      </div>
      {languages && <ConfigScopeHint id={hintId} shown={help} />}
      <ChapterStyleEditor state={chapterStyle} />
      {languages && <ConfigScopeNotes />}
    </div>
  );
}

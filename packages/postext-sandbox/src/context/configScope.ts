// The Design panel of a book in several languages edits one of two layers
// (#1209): the general settings or the edition on screen. Its sections read
// and write `state.config` as everywhere else; inside the panel the store
// hooks see the layer in scope instead (`StateViewContext`) and send writes
// through a dispatch that turns one made for every language into the
// general settings plus the edition rebased on them (`ScopedDispatchContext`).

import { createContext, type Dispatch } from 'react';
import type { PostextConfig } from 'postext';
import type { SandboxAction, SandboxState } from './SandboxContext.js';
import { generalSettingsView } from '../editions/configLayers.js';
import { chapterStyleView } from '../editions/chapterStyleEdit.js';

/** How the hooks under it see the store's state. */
export const StateViewContext = createContext<((s: SandboxState) => SandboxState) | null>(null);

/** The dispatch the hooks under it hand out. */
export const ScopedDispatchContext = createContext<Dispatch<SandboxAction> | null>(null);

const views = new WeakMap<SandboxState, SandboxState>();
/** The general settings as shown, by the stored ones and the language of
 *  the edition beside them: one object while neither changes. */
const shown = new WeakMap<PostextConfig, { language: string | undefined; view: PostextConfig }>();

function shownGeneral(shared: PostextConfig, edition: PostextConfig): PostextConfig {
  const language = edition.locale ?? edition.bodyText?.hyphenation?.locale;
  const hit = shown.get(shared);
  if (hit && hit.language === language) return hit.view;
  const view = generalSettingsView(shared, edition);
  shown.set(shared, { language, view });
  return view;
}

/** The state as the Design panel reads it: in the "all languages" scope,
 *  `config` is the general settings. The same object for the same state,
 *  so selectors keep their identities. */
export function scopedView(s: SandboxState): SandboxState {
  const layers = s.configLayers;
  if (!layers || layers.scope !== 'all') return s;
  let view = views.get(s);
  if (!view) {
    view = { ...s, config: shownGeneral(layers.shared, s.config) };
    views.set(s, view);
  }
  return view;
}

let capturing: SandboxAction[] | null = null;

/** The configuration writes `run` makes, which are not applied: how a
 *  field's reset tells which setting it is (see `useFieldLayer`). */
export function captureWrites(run: () => void): SandboxAction[] {
  const outer = capturing;
  const caught: SandboxAction[] = [];
  capturing = caught;
  try {
    run();
  } catch {
    // A reset that cannot run outside its event says nothing.
  } finally {
    capturing = outer;
  }
  return caught;
}

/** Whether a write is being captured rather than applied (and where it
 *  goes). */
export function capturedInto(): SandboxAction[] | null {
  return capturing;
}

const styleViews = new WeakMap<SandboxState, SandboxState>();

/** The state as the Design panel reads it while it edits a chapter style
 *  (`editingChapterStyle`): the style merged over the settings in scope.
 *  The same object for the same state. */
export function panelView(s: SandboxState): SandboxState {
  const scoped = scopedView(s);
  const id = s.editingChapterStyle;
  if (!id || !scoped.config.chapterStyles?.some((st) => st.id === id)) return scoped;
  let view = styleViews.get(s);
  if (!view) {
    view = { ...scoped, config: chapterStyleView(scoped.config, id) };
    styleViews.set(s, view);
  }
  return view;
}

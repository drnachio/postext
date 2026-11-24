// A change to the design made outside the Design panel — a page tool, a
// frame dragged on the page, a check's fix — is worked out over the
// edition on screen, the one the page shows. In a book in several
// languages it goes where the panel's scope says (#1700): with the panel
// on every language, what the change changes is written into the general
// settings, and the edition on screen takes it whole, so the page shows
// what was done and the panel lists it.

import type { Dispatch } from 'react';
import { diffConfigLayers, mergeConfigLayers, type PostextConfig } from 'postext';
import type { SandboxAction, SandboxState } from '../context/SandboxContext.js';
import { generalSettingsFrom, generalSettingsView, type ConfigScope } from './configLayers.js';

type Layered = Pick<SandboxState, 'config' | 'configLayers'>;

/** Where a change to the design goes in the book on screen: undefined for
 *  a book in one language, which has only its own settings. */
export function designScope(s: Layered): ConfigScope | undefined {
  return s.configLayers?.scope;
}

const set = (config: PostextConfig): PostextConfig =>
  Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined)) as PostextConfig;

/**
 * `action` as it is written in the scope the Design panel is in. A
 * configuration write made over the edition on screen, with the panel on
 * every language, becomes the edition as the write leaves it and the
 * general settings with the same change: the fields the write changed,
 * list entries by what names them, and nothing else of the edition's own.
 * Any other action, and a write in a book in one language or with the
 * panel on the edition alone, comes back as it is.
 */
export function designWriteAction(s: Layered, action: SandboxAction): SandboxAction {
  const layers = s.configLayers;
  if (!layers || layers.scope !== 'all') return action;
  if (action.type !== 'UPDATE_CONFIG' && action.type !== 'SET_CONFIG') return action;
  if (action.type === 'SET_CONFIG' && action.shared) return action;
  const edition = s.config;
  const next = set(action.type === 'SET_CONFIG' ? action.payload : { ...edition, ...action.payload });
  const { locale: _language, ...change } = diffConfigLayers(edition, next);
  // An edition's language is its own, never a general setting.
  void _language;
  if (Object.keys(change).length === 0) return action;
  const shared = generalSettingsFrom(mergeConfigLayers(generalSettingsView(layers.shared, edition), change), edition);
  return { type: 'SET_CONFIG', payload: next, shared, ...(action.history !== undefined ? { history: action.history } : {}) };
}

interface DesignStore {
  getSnapshot: () => SandboxState;
  dispatch: Dispatch<SandboxAction>;
}

const writers = new WeakMap<Dispatch<SandboxAction>, Dispatch<SandboxAction>>();

/**
 * The dispatch a change to the design goes through outside the Design
 * panel: every action as {@link designWriteAction} writes it. The store's
 * state is a moment behind a dispatch, so writes made one after another
 * build on one another, not on the state still on screen. One per store.
 */
export function designDispatch(store: DesignStore): Dispatch<SandboxAction> {
  const known = writers.get(store.dispatch);
  if (known) return known;
  let pending: { from: SandboxState; config: PostextConfig; shared: PostextConfig } | null = null;
  const dispatch: Dispatch<SandboxAction> = (action) => {
    const s = store.getSnapshot();
    const layers = s.configLayers;
    const at = pending && pending.from === s && layers ? { config: pending.config, configLayers: { ...layers, shared: pending.shared } } : s;
    const written = designWriteAction(at, action);
    if (written.type === 'SET_CONFIG' && written.shared) pending = { from: s, config: written.payload, shared: written.shared };
    store.dispatch(written);
  };
  writers.set(store.dispatch, dispatch);
  return dispatch;
}

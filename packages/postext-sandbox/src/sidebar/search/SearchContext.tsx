'use client';

import { createContext, useContext } from 'react';
import { compileMatcher, type SearchMatcher } from './normalize';

export interface SettingsSearchState {
  /** Raw query as typed. */
  query: string;
  /** Deferred, compiled matcher (tokens + test). */
  matcher: SearchMatcher;
  /** Only show fields that differ from the engine default. */
  overriddenOnly: boolean;
  /** Any filter in effect (tokens or overriddenOnly). */
  active: boolean;
}

export const INACTIVE_SEARCH: SettingsSearchState = {
  query: '',
  matcher: compileMatcher(''),
  overriddenOnly: false,
  active: false,
};

export const SettingsSearchContext = createContext<SettingsSearchState>(INACTIVE_SEARCH);

export function useSettingsSearch(): SettingsSearchState {
  return useContext(SettingsSearchContext);
}

'use client';

import { createContext, useContext } from 'react';
import type { SettingsGroupId } from '../sidebar/sections/registry';

/** Opens a group of the Design panel (clearing any search), for a section
 *  that points at a setting kept in another group. Null outside the panel. */
export const OpenSettingsGroupContext = createContext<((id: SettingsGroupId) => void) | null>(null);

export function useOpenSettingsGroup(): ((id: SettingsGroupId) => void) | null {
  return useContext(OpenSettingsGroupContext);
}

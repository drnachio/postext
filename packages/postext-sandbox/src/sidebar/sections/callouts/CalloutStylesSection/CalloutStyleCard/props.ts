'use client';

// What one box style's card is given.
import type { CalloutStyleConfig, ResolvedCalloutStyleConfig, Resource, Dimension } from 'postext';

export interface CalloutStyleCardProps {
  style: CalloutStyleConfig;
  resolved: ResolvedCalloutStyleConfig;
  otherIds: Set<string>;
  /** The styles this one may be based on (#905): every other style but
   *  those based on it, in list order, with their names. */
  parents: { id: string; name: string }[];
  /** Whether the style is stored in the config (the built-in style shown
   *  while the config has no list is not an override). */
  stored: boolean;
  iconResources: Resource[];
  /** Resolved document list values the optional bullet fields fall back to. */
  listDefaults: { bulletFontSize: Dimension; bulletFontWeight: number; bulletFontFamily: string; marginTop: Dimension; marginBottom: Dimension };
  onChange: (partial: Partial<CalloutStyleConfig>) => void;
  onResetField: (field: keyof CalloutStyleConfig) => void;
  onRename: (nextId: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

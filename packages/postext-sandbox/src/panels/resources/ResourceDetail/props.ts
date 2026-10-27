'use client';

// What the resource detail pane is given.
import type { Resource, ResourceType } from 'postext';

export interface ResourceDetailProps {
  resource: Resource;
  types: ResourceType[];
  /** Set of every existing id except this resource's, for uniqueness checks. */
  otherIds: Set<string>;
  /** How many times this resource is referenced in the document. */
  referenceCount: number;
  onChange: (next: Resource) => void;
  /** Rename: change the resource id (callers update selection + storage). */
  onRename: (oldId: string, next: Resource) => void;
  onDelete: () => void;
  /** Return to the resource list. */
  onBack: () => void;
  /** Host theme for the embedded SVG source editor. */
  isDark?: boolean;
}

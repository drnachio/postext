// What the project actions take from the provider and what they give
// back (#1276: split out of projectActions.ts).
import type { Dispatch } from 'react';
import type { PresetProvider, PresetApplyParts } from '../../presets/index.js';
import type { ChapterLayout } from '../../book/types.js';
import type { SandboxAction, SandboxState } from '../SandboxContext.js';

export interface ProjectActionDeps {
  dispatch: Dispatch<SandboxAction>;
  getState: () => SandboxState;
  getProviders: () => PresetProvider[];
  getBuiltin: () => PresetProvider;
  /** Apply a preset into the working state (preset mode). */
  runPreset: (provider: PresetProvider, parts: PresetApplyParts) => Promise<boolean>;
  /** Open a preset as the book on screen: its draft when it has one. */
  openPreset: (id: string) => Promise<boolean>;
  /** Run a switch of the book on screen: the current one is saved first
   *  and the viewport shows the loading state meanwhile. */
  switchBook: <T>(fn: () => Promise<T>) => Promise<T>;
  /** Invalidate any in-flight preset load so it never lands on a project. */
  cancelPresetLoads: () => void;
  /** Write the pending working-state save now (localStorage + active project). */
  flushWorkingSave: () => Promise<void>;
  /** The layout records that are current for the working book, by chapter
   *  id (what an export carries so the book opens paginated). */
  currentLayouts: () => Record<string, ChapterLayout>;
  /** Drop a pending save without writing it (the target is going away). */
  discardWorkingSave: () => void;
  /** Run `fn` with garbage collection paused, then schedule a sweep. */
  withGcSuspended: <T>(fn: () => Promise<T>) => Promise<T>;
  labels: () => SandboxState['labels'];
}

export type DuplicateSource = {
  kind: 'preset' | 'project';
  id: string;
  /** Presets only: the content locale to clone / export (a bilingual
   *  bundle's second language); the viewer locale otherwise. */
  locale?: string;
  /** Presets only: copy this saved draft (the edited preset) rather than
   *  the original. */
  draftKey?: string;
};

export interface ProjectActions {
  activate: (id: string) => Promise<void>;
  create: (opts: { from: 'current' | 'blank'; name?: string }) => Promise<string>;
  duplicate: (source: DuplicateSource) => Promise<string>;
  /** Rename a project; `description` replaces its description when given
   *  (blank clears it). On a book in several languages the title is the
   *  book's in every one, unless `edition` limits it to the language on
   *  screen (#999). */
  rename: (id: string, name: string, description?: string, opts?: { edition?: boolean }) => Promise<void>;
  /** Delete a project. `offScreen`: the caller has just opened another
   *  book, so the screen is left alone even if the state read here still
   *  names `id` as the active project (it lags a render). */
  remove: (id: string, opts?: { offScreen?: boolean }) => Promise<void>;
  importBundle: (file: File) => Promise<string>;
  /** Import a bundle's bytes as a new project and open it. `origin` marks
   *  a book opened from a host link (see `ProjectRecord.origin`); `locale`
   *  picks the language of a bundle in several (the viewer's otherwise). */
  importBundleBytes: (bytes: ArrayBuffer | Uint8Array, fileName: string, opts?: { origin?: string; locale?: string }) => Promise<string>;
  /** Open another edition of a project that keeps several (#903), the one
   *  on screen going aside. Opens the project too when it is not the one
   *  on screen. */
  switchEdition: (id: string, locale: string) => Promise<void>;
  /** Add a language to a project (#989): a new edition made from the one
   *  on screen (its chapters copied, its document language set to
   *  `locale`), opened at once. Opens the project too when it is not the
   *  one on screen. Resolves to false, changing nothing, when the project
   *  already has that language. */
  addEdition: (id: string, locale: string) => Promise<boolean>;
  exportProject: (target?: DuplicateSource) => Promise<void>;
  /** Replace a project's cover picture with `file`, or drop it with null. */
  setThumbnail: (id: string, file: File | null) => Promise<void>;
  /** Give a project without a cover the picture taken from its first page
   *  (never replaces one; no busy state). Resolves to whether it was set. */
  adoptGeneratedThumbnail: (id: string, bytes: ArrayBuffer, mime: string) => Promise<boolean>;
  /** Rename a frame of a page template in the editions a local project
   *  keeps aside (#979): the templates and the page fences of each one
   *  that has the frame (the edition on screen is the caller's). Resolves
   *  to the number of editions changed. */
  renameFrameInEditions: (id: string, templateId: string, from: string, to: string) => Promise<number>;
  /** Reset the active project (or parts of it) to the preset it came from. */
  resetToSource: (parts: PresetApplyParts) => Promise<void>;
}

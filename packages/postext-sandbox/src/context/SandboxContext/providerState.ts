// The running state of the sandbox provider its modules share (#1276).
import type { Resource } from 'postext';
import type { SaveScheduler } from '../../storage/saveScheduler.js';
import type { SandboxState } from './state.js';
import type { ProjectActions } from '../projectActions.js';

/** What a hook of the sandbox provider calls before the provider has made
 *  it: filled as soon as each one exists, read only after the render. */
export interface SandboxProviderLate {
  persistWorkingRef: React.RefObject<(resourcesOverride?: Resource[]) => Promise<void>>;
  saverRef: React.RefObject<SaveScheduler | null>;
  scheduleGc: () => void;
  editorStatesRef: React.RefObject<Map<string, unknown>>;
  stateRef: React.RefObject<SandboxState>;
  projectActions: ProjectActions;
}

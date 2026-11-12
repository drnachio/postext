import type { SandboxToolHost } from '../host.js';
import type { WebMcpTool } from '../modelContext.js';
import { bookTools } from './book.js';
import { chapterStyleTools } from './chapterStyles.js';
import { checkTools } from './checks.js';
import { findTextTools } from './findText.js';
import { comicTools } from './comics.js';
import { configTools } from './config.js';
import { designItemTools } from './designItems.js';
import { designTools } from './designs.js';
import { editionCheckTools } from './editionChecks.js';
import { historyTools } from './history.js';
import { idmlTools } from './idml.js';
import { frameStyleTools } from './frameStyles.js';
import { moduleTools } from './modules.js';
import { labelTools } from './labels.js';
import { answerTools, libraryTools } from './library.js';
import { pageTools } from './pages.js';
import { resourceTools } from './resources.js';
import { viewTools } from './view.js';
import { viewerCommandTools } from './viewerCommands.js';
import { wordTools } from './word.js';
import { wordEditTools } from './wordEdits.js';

/** Every tool the Sandbox hands an agent, in the order an agent meets
 *  them: what is open, the pages, the text, the design, how it is shown,
 *  resources and fonts, comic pages, the books and their files, the checks. */
export function createSandboxTools(host: SandboxToolHost): WebMcpTool[] {
  const [getState, ...text] = bookTools(host);
  return [
    getState!,
    ...pageTools(host),
    ...text,
    ...findTextTools(host),
    ...configTools(host),
    ...chapterStyleTools(host),
    ...designItemTools(host),
    ...designTools(host),
    ...historyTools(host),
    ...frameStyleTools(host),
    ...moduleTools(host),
    ...labelTools(host),
    ...viewTools(host),
    ...viewerCommandTools(host),
    ...resourceTools(host),
    ...comicTools(host),
    ...libraryTools(host),
    ...wordTools(host),
    ...wordEditTools(host),
    ...idmlTools(host),
    ...answerTools(host),
    ...checkTools(host),
    ...editionCheckTools(host),
  ];
}

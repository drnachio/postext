// The provider's history, for code outside React (viewer edits, keys).

import type { SandboxHistory } from './sandboxHistory.js';

let active: SandboxHistory | null = null;

/** The provider's history, for code outside React (viewer edits, keys). */
export function setActiveHistory(history: SandboxHistory | null): void {
  active = history;
}

export function activeHistory(): SandboxHistory | null {
  return active;
}

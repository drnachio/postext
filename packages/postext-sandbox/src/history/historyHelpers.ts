// Small reads the Sandbox's history makes of the state and its actions.

import type { Resource } from 'postext';
import type { SandboxAction, SandboxState } from '../context/SandboxContext.js';
import type { ConfigHistoryMeta } from './sandboxHistory.js';

export function chapterText(state: SandboxState, chapterId: string): string | null {
  if (chapterId === state.activeChapterId) return state.markdown;
  return state.chapters.find((c) => c.id === chapterId)?.markdown ?? null;
}

export function configMeta(action: SandboxAction): ConfigHistoryMeta | undefined {
  return action.type === 'SET_CONFIG' || action.type === 'UPDATE_CONFIG' ? action.history : undefined;
}

/** Whether two versions of a resource differ in more than their stamp. */
export function sameResource(a: Resource, b: Resource): boolean {
  return JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 });
}

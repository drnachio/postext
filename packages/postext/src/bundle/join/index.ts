// Chapters of another book joined to this one (#1727): the planner the
// Sandbox follows, its application to a bundle's files (the CLI's
// `postext join`), and the chapter numbers both count by.

export { chapterNumbers, chapterFileNumbers } from './numbers.js';
export {
  bookNumbers, partChapters, proposeChoices, replacedChapter, choiceProblems, broughtResources, resourceClashes, renameProblems,
  withChapterNumber, planPartJoin,
} from './plan.js';
export type { PartAction, PartChoice, PartChapterInfo, PartProblem, PartStep, PartJoinPlan, JoinSide } from './plan.js';
export { inspectBundleJoin, joinBundleFiles } from './files.js';
export type { JoinBundleOptions, BundleJoinInspection, BundleJoinResult } from './files.js';
export { resourceIdRanges, renameResourceInText, renameResourceInResources, withResourceRenamed, resourcesNamedIn, configPathsNaming } from './refs.js';
export type { ResourceRefChange, ResourceRefFields } from './refs.js';

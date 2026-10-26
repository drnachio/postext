// The migration's input, options, report and result, the page design it
// works from, and the free-id and slug helpers every step uses (#1276:
// split out of textToMarkdown.ts).
import type { PostextConfig, DocumentMetadata, Resource, Dimension } from '../../types.js';
import type { PageSide } from '../../composed/types.js';
import type { PlannedDesign } from '../pageDesign.js';

export interface TextMigrationChapter {
  id: string;
  markdown: string;
}

export interface TextMigrationInput {
  config: PostextConfig;
  chapters: readonly TextMigrationChapter[];
  /** The book's metadata: its title, author… are allowed in a design, as
   *  the `contentInConfig` check allows them, and stay there. */
  metadata?: DocumentMetadata;
  /** The book's resources: with `labelsOnPictures` the pictures' anchors
   *  are written to them (`TextMigrationResult.resources`). */
  resources?: readonly Resource[];
}

export interface TextMigrationOptions {
  /** Join text elements of one look set under one another at an even
   *  spacing into one frame. Default `true`. */
  merge?: boolean;
  /** Pages whose frames stand in the same places share a template that
   *  their own ones extend. Default `true`. */
  shareTemplates?: boolean;
  /** A filled box under the bold words of a moved text becomes a chip of
   *  the book's chip style of that colour (else a new one). Default `true`. */
  highlightsToChips?: boolean;
  /** Heading styles that hold content and that no heading uses: `'keep'`
   *  (default) leaves them, `'remove'` deletes them. */
  unusedStyles?: 'keep' | 'remove';
  /** The side of the page a run's page falls on, when the caller laid the
   *  book out: the chapter and the offset of the page's first line in its
   *  Markdown as it was. Without it the side comes from the opening
   *  heading's `breakBefore.parity`, when it has one. */
  sideOf?: (chapterId: string, offset: number) => PageSide | undefined;
  /** Words placed on a picture become its labels (#918): a text of the
   *  design of one line and at most four words, no larger than
   *  `maxFontSize` (default three quarters of the body text's size),
   *  inside a picture's box. The picture leaves the decoration for a
   *  picture frame at its box holding a `:::figure` with one `::label`
   *  line per text; each label is an anchor of the resource (shared by
   *  every page that shows the picture) with a `labelStyles` entry for its
   *  look. Default off: such texts become frames like the rest. */
  labelsOnPictures?: boolean | { maxFontSize?: Dimension };
}

export interface ContentInConfigCount {
  /** `contentInConfig` warnings (one per owner). */
  warnings: number;
  /** Design texts at fault. */
  elements: number;
  /** Their letters and digits. */
  chars: number;
}

/** One `::::page` fence the migration wrote. */
export interface MigratedPage {
  chapterId: string;
  /** 0-based index among the chapter's fences. */
  fence: number;
  template: string;
  /** The heading styles of the headings on the page, as they were. */
  styles: string[];
  side?: PageSide;
  frames: number;
  elements: number;
  chars: number;
  /** Where the page may look different, by code: `box`, `stroke`, `dropCap`,
   *  `paragraphIndent`, `height` (the text's own box), `side` (the side of
   *  the page is not known: the text of both sides' frames was written),
   *  `flow` (the page has running text, now set in the template's flow
   *  frame), `repeated` (a text the running head printed on each page of a
   *  section is written on each page). */
  differences: string[];
}

export interface TextMigrationReport {
  pages: MigratedPage[];
  templates: { id: string; extends?: string; frames: number; pages: number }[];
  /** Text elements moved, and their letters and digits. */
  movedElements: number;
  movedChars: number;
  /** Highlight boxes that became chips. */
  chips: number;
  frames: number;
  paragraphStylesCreated: string[];
  paragraphStylesReused: string[];
  chipStylesCreated: string[];
  /** Heading styles merged into one once their running heads moved out
   *  (`into` keeps; `from` are gone), and those deleted unused. */
  headingStylesMerged: { into: string; from: string[] }[];
  headingStylesRemoved: string[];
  /** Heading styles holding content that no heading uses (kept). */
  unusedStyles: string[];
  /** Hidden headings that only switched the running head, dropped. */
  headingsDropped: number;
  /** Text left in the configuration, and why. */
  left: { path: string; reason: 'placeholder' | 'anchor' | 'unused' | 'notPage' }[];
  configBytesBefore: number;
  configBytesAfter: number;
  contentInConfigBefore: ContentInConfigCount;
  contentInConfigAfter: ContentInConfigCount;
  /** `labelsOnPictures` (#918): pictures that became picture frames, the
   *  texts that became their labels, the anchors written (shared by the
   *  pages that show a picture) and the label styles created or reused. */
  labels: {
    pictures: number; labels: number; anchors: number; labelStylesCreated: string[]; labelStylesReused: string[];
    /** Bitmaps smaller than the box the design stretched them over, given
     *  the `resolution` that sets them at that width (a figure is never
     *  enlarged). */
    resolutionSet: string[];
  };
}

export interface TextMigrationResult {
  config: PostextConfig;
  chapters: TextMigrationChapter[];
  /** The resources with the anchors the labels stand at, when
   *  `labelsOnPictures` turned any text into a label (the input's
   *  otherwise). */
  resources?: Resource[];
  report: TextMigrationReport;
  /** Nothing to move: the result is the input. */
  unchanged: boolean;
}

export interface Design {
  key: string;
  styleIds: string[];
  /** Whether the styles set their own header / footer. */
  ownHeader: boolean;
  ownFooter: boolean;
  plan: PlannedDesign;
  /** Template the design's pages use, once built. */
  template?: string;
  /** The template's own chain (it and what it extends), for `{attr.x}`. */
  attrNames?: Set<string>;
  /** An element of the design shows on some page roles only. */
  roleFiltered?: boolean;
  pages: number;
}

/** A readable id: a style's part after its last `--` (`tema--p12` → `p12`),
 *  free among `taken`. */
export function freeId(base: string, taken: Set<string>): string {
  const clean = base.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
  let id = clean;
  for (let n = 2; taken.has(id); n++) id = `${clean}-${n}`;
  taken.add(id);
  return id;
}

export const slug = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function emptyReport(before: ContentInConfigCount, size: number, left: TextMigrationReport['left'], unused: string[]): TextMigrationReport {
  return {
    pages: [], templates: [], movedElements: 0, movedChars: 0, chips: 0, frames: 0,
    paragraphStylesCreated: [], paragraphStylesReused: [], chipStylesCreated: [],
    headingStylesMerged: [], headingStylesRemoved: [], unusedStyles: unused, headingsDropped: 0, left,
    configBytesBefore: size, configBytesAfter: size, contentInConfigBefore: before, contentInConfigAfter: before,
    labels: { pictures: 0, labels: 0, anchors: 0, labelStylesCreated: [], labelStylesReused: [], resolutionSet: [] },
  };
}

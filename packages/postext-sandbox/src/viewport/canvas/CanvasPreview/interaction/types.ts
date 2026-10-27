// The types of the page interaction: the navigator of the contents, a
// pointer on a page, the options, the cursors and what the viewer gets
// back (#1276: split out of interaction.ts).
import type { MutableRefObject, Dispatch } from 'react';
import type { VDTDocument, Resource } from 'postext';
import type { SandboxAction } from '../../../../context/SandboxContext.js';
import type { ComposedBook } from '../../../../book/types.js';
import type { PanelId } from '../../../../types/index.js';
import type { ResourceLocation } from '../geometry.js';
import type { SandboxLabels } from '../../../../types/labels.js';
import type { ComicSurface, ComicEditor } from '../../../comics/comicEditing.js';
import type { FrameTools } from '../../../composed/frameTools.js';
import type { LabelSurface, LabelEditor } from '../../../composed/labelAnchorEditor.js';

/** Where a click on a row of the contents goes: the book page index the
 *  row lists, with the document it was clicked in (whose own pages need
 *  no book lookup). */
export type PageNavigator = (pageIndex: number, doc: VDTDocument) => void;

/** A point on a page of the document, in sheet pixels (the page's own
 *  coordinates, before any flow rotation). */
export interface PagePointer {
  pageIndex: number;
  x: number;
  y: number;
}

export interface PageInteractionOptions {
  /** The page and point under a pointer, or null off the pages. */
  locate: (ev: MouseEvent) => PagePointer | null;
  docRef: MutableRefObject<VDTDocument | null>;
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>;
  activePanelRef: MutableRefObject<PanelId | null>;
  sourceRef: MutableRefObject<ComposedBook | null>;
  navigateRef?: MutableRefObject<PageNavigator | null>;
  resourcesRef?: MutableRefObject<Resource[] | null>;
  pageSourceRef?: MutableRefObject<((pageIndex: number) => ComposedBook | null) | null>;
  /** Brings a resource or anchor of the document into view. */
  showLocation: (doc: VDTDocument, loc: ResourceLocation) => void;
  /** The cursor over the pages: `text`, `pointer` over a link, a resize
   *  cursor over a comic splitter, `move` over a comic balloon,
   *  `crosshair` over a balloon's tail tip. */
  setCursor: (cursor: PageCursor) => void;
  /** Whether the pointer is the reader's to select with now (the Folio's
   *  select mode); always, when left out. */
  enabled?: () => boolean;
  /** A finger drags a selection too (the Folio, where it never scrolls);
   *  otherwise a touch drag scrolls and a tap only follows links. */
  touchSelects?: boolean;
  /** Where the comic page tools draw (#568); with `labelsRef`, a comic
   *  page's splitters drag and its panels split and merge. */
  comicSurface?: ComicSurface;
  labelsRef?: MutableRefObject<SandboxLabels>;
  /** Whether the comic tools are on now; `enabled` when left out. */
  comicEnabled?: () => boolean;
  /** The composed-page tools (#864): a click on a frame goes to its slot,
   *  a double click edits its text on the page. On unless false. */
  frameTools?: boolean;
  /** Where the label editor of Design mode paints (#970): with it, the
   *  marks of the figures' labels are dragged on these pages, with
   *  `labelsRef` for their words. The Canvas and the HTML previews have
   *  their own listeners per page (`attachLabelAnchorEditor`). */
  labelSurface?: LabelSurface;
  /** Whether the label editor is on now; `on` when left out. */
  labelsEnabled?: () => boolean;
}

/** The cursors the page interaction sets. */
export type PageCursor = 'text' | 'pointer' | 'default' | 'row-resize' | 'col-resize' | 'move' | 'crosshair' | 'grab';

/** What the page interaction hands back to its viewer. */
export interface PageInteraction {
  /** The comic tools, when the viewer has them. */
  comic: ComicEditor | null;
  /** The composed-page tools (#864). */
  frames: FrameTools | null;
  /** The label editor, when the viewer has a surface for it (#970). */
  labels: LabelEditor | null;
}

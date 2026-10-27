/**
 * The rest of a story that jumps into a page of a later chapter (#943), as
 * plain types: `LayoutContinuation.jumps` names them.
 */
import type { ContentBlock } from '../parse/types.js';
import type { CalloutCut } from '../pipeline/columns/cutTypes.js';

/** The number a block of the carried story prints, as the sender gave it. */
export interface CarriedNumber {
  /** Position of the block among the story's blocks (the box's opening
   *  marker is 0). */
  at: number;
  /** A heading's number prefix and counter value, and the chapter number
   *  its design prints. */
  prefix?: string;
  value?: number;
  chapterNumber?: string;
}

/** The rest of a story that goes on in a page of another chapter. */
export interface StoryJump {
  /** Position in the book of the chapter whose file the story's text is
   *  in. The host sets it; the build leaves it unset, except when it hands
   *  on a story it received itself (it then keeps the first chapter's). */
  chapter?: number;
  /** Position of the chapter that sent this jump on (the host sets it):
   *  the one whose page the continuation mark names. */
  fromChapter?: number;
  /** The page fence's `id` the story goes on in, and the rule as the frame
   *  wrote it (`page:<id>` or `page:<id>#<frame>`, its `{attr.x}` read). */
  target: string;
  targetFrame?: string;
  rule: string;
  /** The frame of the sending page that cut it, that frame's id, the head
   *  of its chain, its template and whether that page was itself an added
   *  page laid with the template's frames collapsed. */
  frame: string;
  fromFrameId: string;
  head: string;
  template: string;
  collapsed: boolean;
  /** Where the receiving frames are named (`ComposedContinuation.slot`),
   *  the pieces the sender laid and the id its first block carries. */
  slot: string;
  pieces: number;
  headBlockId: string;
  trailing?: readonly string[];
  fromMark?: string;
  /** Where the story stands: the sender laid its children up to here. */
  cut: CalloutCut;
  /** The story's box (`containerStart` .. `containerEnd`) and everything
   *  between, offsets as in the sending chapter's body. */
  blocks: ContentBlock[];
  /** The sending chapter's body offset in its file (front matter): what
   *  makes a block's offset a file offset. */
  bodyOffset: number;
  /** Numbers the sender gave its headings. */
  numbers?: CarriedNumber[];
  /** The ordered-list indents the sender's lists were set with (they
   *  follow its widest marker). */
  orderedLevelIndentsPx?: number[];
  /** The notes the story cites, as the sender numbered them and with
   *  their definitions: the receiver sets them where the markers land. */
  footnotes?: CarriedNote[];
  /** The story refers to an anchor of the book (`:ref`, #262): the chapter
   *  that sets it needs the book's outline, as a chapter with such a
   *  reference of its own does. */
  outline?: true;
}

/** A note cited by a carried story. */
export interface CarriedNote {
  id: string;
  /** The number the marker prints, as the sender gave it. */
  number: string;
  /** The note's definition paragraph (`footnoteDef`). */
  def?: ContentBlock;
}

import { DEFAULT_TEXT_ELEMENT, type DesignTextElement } from 'postext';
import { applyAlign, type SlotKind } from './placementAdapter';

/** The text element "Add text" puts in a `slotKey` slot: the reference
 *  defaults, centred on the slot's body edge, with no `overflow` — the slot
 *  decides it (#628): an opener or part title wraps, a running head ends
 *  in an ellipsis. */
export function newTextElement(id: string, slotKey: SlotKind): DesignTextElement {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { overflow: _overflow, ...base } = DEFAULT_TEXT_ELEMENT;
  return {
    ...base,
    id,
    content: '',
    // Default anchor aligned to the body edge for this slot.
    placement: applyAlign(DEFAULT_TEXT_ELEMENT.placement, slotKey, 'center'),
  };
}

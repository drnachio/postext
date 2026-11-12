// The composition rules (#1540) inside `bodyText`: the slots the engine
// gives the composition part, read and cleared here so the Body text and
// Composition rules sections each reset and mark only their own fields.

import { DESIGN_PART_SLOTS, designPartSlots, readDesignSlot, writeDesignSlot, type BodyTextConfig, type PostextConfig } from 'postext';

/** The composition part's slots (all inside `bodyText`). */
export const COMPOSITION_SLOTS = designPartSlots(['composition']);

/** The text part's `bodyText`: every field the composition leaves. */
const BODY_TEXT_SLOT = DESIGN_PART_SLOTS.find((s) => s.part === 'text' && s.key === 'bodyText')!;

/** Whether `config` sets any composition rule. */
export function holdsComposition(config: PostextConfig): boolean {
  return COMPOSITION_SLOTS.some((slot) => readDesignSlot(config, slot) !== undefined);
}

/** Whether `config` sets any body text field that is not a composition
 *  rule. */
export function holdsBodyText(config: PostextConfig): boolean {
  return readDesignSlot(config, BODY_TEXT_SLOT) !== undefined;
}

/** `bodyText` with its composition rules only (undefined when it sets
 *  none): what the Body text section's reset keeps. */
export function compositionOnly(bodyText: BodyTextConfig | undefined): BodyTextConfig | undefined {
  return writeDesignSlot({ bodyText } as PostextConfig, BODY_TEXT_SLOT, undefined).bodyText;
}

/** `bodyText` without its composition rules (undefined when nothing is
 *  left): what the Composition rules section's reset keeps. */
export function withoutComposition(bodyText: BodyTextConfig | undefined): BodyTextConfig | undefined {
  let config = { bodyText } as PostextConfig;
  for (const slot of COMPOSITION_SLOTS) config = writeDesignSlot(config, slot, undefined);
  return config.bodyText;
}

import type { PenJson } from "@/lib/cookbook/types";

/** The id of the `<script type="application/json">` that carries each
 *  edition's pen.json (spec §4.3, payload discipline). The files themselves
 *  are not embedded: the whole-recipe view already holds every line of
 *  them, and a server-rendered script would travel twice (HTML and RSC). */
export const SOURCES_ID = "recipe-sources";

export interface RecipeSourcesPayload {
  [variant: string]: { pen: PenJson };
}

/** Marks the whole-recipe view's `<pre>` of each composed file. */
export const SOURCE_ATTR = "data-cb-source";
/** Set on that `<pre>` when the file ends with a newline. */
export const SOURCE_EOL_ATTR = "data-cb-eol";

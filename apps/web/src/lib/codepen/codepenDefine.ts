import type { PenSources } from "./codepen";

/** What a page needs to name a docs example's pen: its folder under
 *  `docs/examples` and the title and description in the page's language.
 *  The sources come from `/codepen/<name>.json` when the reader asks. */
export interface PenRef {
  name: string;
  title: string;
  description?: string;
}

/** The JSON for CodePen's "POST to prefill editors" API
 *  (https://blog.codepen.io/documentation/prefill/), which opens the example
 *  as a new, editable pen. */
export function penDefine({ panels, shared }: PenSources, meta: Omit<PenRef, "name">): string {
  const code = (lang: PenSources["panels"][number]["lang"]) => panels.find((p) => p.lang === lang)?.code ?? "";
  const stylesheets = Array.isArray(shared.stylesheets) ? (shared.stylesheets as string[]) : [];
  const scripts = Array.isArray(shared.scripts) ? (shared.scripts as string[]) : [];
  return JSON.stringify({
    title: meta.title,
    description: meta.description,
    tags: shared.tags,
    html: code("html"),
    css: code("css"),
    js: code("js"),
    // `js_module` lets the JS panel use `import` statements (ES modules).
    js_module: true,
    css_external: stylesheets.join(";"),
    js_external: scripts.join(";"),
    // HTML and CSS collapsed, JS open: the script is the example.
    editors: "001",
  });
}

const loading = new Map<string, Promise<PenSources>>();

/** The example's sources, fetched once per page (hover, focus or click). */
export function loadPenSources(name: string): Promise<PenSources> {
  let p = loading.get(name);
  if (!p) {
    p = fetch(`/codepen/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`CodePen example ${name}: ${r.status}`);
      return r.json() as Promise<PenSources>;
    });
    // A failed fetch is tried again on the next click.
    p.catch(() => loading.delete(name));
    loading.set(name, p);
  }
  return p;
}

import fs from "fs";
import path from "path";

/** Example sources live next to the docs, one folder per pen:
 *  `docs/examples/<name>/{index.html,style.css,script.js,pen.json}`.
 *  `pen.json` carries the prefill options shared by every locale
 *  (external stylesheets, scripts, tags). */
const EXAMPLES_DIR = path.join(process.cwd(), "../../docs/examples");

export type PenPanel = { lang: "html" | "css" | "js"; file: string; code: string };

export interface PenSources {
  panels: PenPanel[];
  /** The parsed `pen.json`, or `{}` when the folder has none. */
  shared: Record<string, unknown>;
}

function readOptional(dir: string, file: string): string {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf-8").trimEnd();
}

export function readPenSources(name: string): PenSources {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`CodePen example: invalid name "${name}"`);
  const dir = path.join(EXAMPLES_DIR, name);
  const panels = (
    [
      { lang: "html", file: "index.html", code: readOptional(dir, "index.html") },
      { lang: "css", file: "style.css", code: readOptional(dir, "style.css") },
      { lang: "js", file: "script.js", code: readOptional(dir, "script.js") },
    ] as PenPanel[]
  ).filter((p) => p.code.length > 0);
  if (panels.length === 0) throw new Error(`CodePen example: no sources under docs/examples/${name}`);
  const penJson = readOptional(dir, "pen.json");
  const shared = penJson ? (JSON.parse(penJson) as Record<string, unknown>) : {};
  return { panels, shared };
}

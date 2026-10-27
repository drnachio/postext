// Feature detection of a run: config statistics, detected features, the
// suggested level, and a PDF's page count (#1276: split out of checks.ts).
import zlib from 'node:zlib';
import { usedApis, markdownConstructs } from '../../../src/lib/cookbook/detect.ts';
import type { CaptureVariant, Registry, RecipeMeta, Level, ComposedPen } from '../../../src/lib/cookbook/types.ts';
import type { ProbeFacts } from './facts.ts';

// ─── Detected facts (capture.json `detected`) ───────────────────────────────

export type Detected = CaptureVariant["detected"];

function isLeafObject(value: Record<string, unknown>): boolean {
  return ("hex" in value && "model" in value) || ("value" in value && "unit" in value);
}

/** The user config's shape: dotted key paths (≤ 3 segments, arrays as
 *  `[]`), top-level sections, leaf count (a colour or a dimension is one
 *  leaf) and design elements (items of every `elements` array). */
export function configStats(config: Record<string, unknown> | null | undefined): {
  keys: string[];
  sections: string[];
  leaves: number;
  designElements: number;
  paths: string[];
} {
  const keys = new Set<string>();
  const paths = new Set<string>();
  let leaves = 0;
  let designElements = 0;
  const walk = (value: unknown, segs: string[]) => {
    // An array item repeats its array's key: record paths on entering the array.
    if (segs.length && !segs[segs.length - 1].endsWith("[]")) {
      if (segs.length <= 3) keys.add(segs.join("."));
      paths.add(segs.join(".").replace(/\[\]/g, ""));
    }
    if (value === null || typeof value !== "object" || isLeafObject(value as Record<string, unknown>)) {
      leaves++;
      return;
    }
    if (Array.isArray(value)) {
      const last = segs[segs.length - 1] ?? "";
      if (last.replace(/\[\]/g, "") === "elements") {
        designElements += value.filter((item) => item && typeof item === "object").length;
      }
      if (value.every((item) => item === null || typeof item !== "object")) {
        leaves++;
        return;
      }
      const itemSegs = [...segs.slice(0, -1), `${last}[]`];
      for (const item of value) walk(item, itemSegs);
      return;
    }
    for (const [key, item] of Object.entries(value)) walk(item, [...segs, key]);
  };
  if (config) walk(config, []);
  return {
    keys: [...keys].sort(),
    sections: Object.keys(config ?? {}).sort(),
    leaves,
    designElements,
    paths: [...paths],
  };
}

/** Registry features whose `detect` rule fires on this capture. */
export function detectFeatures(
  registry: Registry | null,
  input: { paths: string[]; markdown: string; apis: string[] },
): { detected: string[]; rules: Set<string> } {
  const detected: string[] = [];
  const rules = new Set<string>();
  if (!registry) return { detected, rules };
  const test = (source: string): boolean => {
    try {
      return new RegExp(source, "m").test(input.markdown);
    } catch {
      return input.markdown.includes(source);
    }
  };
  for (const [id, feature] of Object.entries(registry.features ?? {})) {
    const rule = feature.detect;
    if (!rule) continue;
    rules.add(id);
    const hit =
      (rule.config ?? []).some((key) => {
        const want = key.replace(/\[\]/g, "");
        return input.paths.some((p) => p === want || p.startsWith(`${want}.`));
      }) ||
      (rule.markdown ?? []).some(test) ||
      (rule.api ?? []).some((name) => input.apis.includes(name));
    if (hit) detected.push(id);
  }
  return { detected: detected.sort(), rules };
}

const NAMED_STYLES = ["headingStyles", "calloutStyles", "paragraphStyles", "chipStyles", "tableStyles"];

/** Spec §2.3, from what the capture saw. */
export function suggestLevel(
  meta: RecipeMeta,
  facts: ProbeFacts,
  stats: { leaves: number; designElements: number },
  apis: string[],
): Level {
  const kinds = new Set(facts.builds.map((b) => b.kind));
  const s = facts.signals;
  const advanced =
    kinds.has("bundle") || kinds.has("worker") || !!s?.partPalette || !!s?.rotated || !!s?.splitTables ||
    !!s?.sideFloats || !!meta.engine.math || !!meta.engine.worker || meta.outputs.includes("live") ||
    stats.leaves > 200 || stats.designElements > 12;
  if (advanced) return 3;
  const config = facts.userConfig ?? {};
  const named = NAMED_STYLES.some((key) => Array.isArray(config[key]) && (config[key] as unknown[]).length > 0);
  const intermediate =
    stats.designElements > 0 || !!s?.placements || named || meta.outputs.includes("pdf") || meta.outputs.includes("epub") || stats.leaves >= 60 ||
    (facts.resources?.length ?? 0) > 1 || apis.length > 4;
  return intermediate ? 2 : 1;
}

/** The detected facts of capture.json. APIs, directives and inline
 *  constructs come from lib/cookbook/detect.ts, like the static detection
 *  the site falls back to before a capture, so both speak the same names;
 *  the config facts come from the config the engine actually received. */
export function detect(meta: RecipeMeta, facts: ProbeFacts, pen: ComposedPen, registry: Registry | null): Detected & { paths: string[] } {
  const apis = usedApis(pen.js);
  const stats = configStats(facts.userConfig);
  const resources = { svg: 0, bitmap: 0, table: 0 };
  for (const r of facts.resources ?? []) if (r.kind in resources) resources[r.kind as keyof typeof resources]++;
  const fonts = (facts.faces?.used ?? []).map(({ family, weight, style }) => ({ family, weight, style }));
  // Vertical and right-to-left text bind a book on the right without
  // saying page.binding, and an Arabic locale sets the text right to left
  // without saying direction or numerals: the document's binding, direction
  // and digits count as the keys.
  const paths = [...stats.paths];
  if (facts.binding === "right" && !paths.includes("page.binding")) paths.push("page.binding");
  if (facts.direction === "rtl" && !paths.includes("direction")) paths.push("direction");
  if (facts.numerals && !paths.includes("numerals")) paths.push("numerals");
  const { detected } = detectFeatures(registry, { paths, markdown: (facts.markdowns ?? []).join("\n"), apis });
  const directives = new Set<string>();
  const inline = new Set<string>();
  for (const markdown of facts.markdowns ?? []) {
    const found = markdownConstructs(markdown);
    found.directives.forEach((d) => directives.add(d));
    found.inline.forEach((d) => inline.add(d));
  }
  return {
    apis,
    configKeys: stats.keys,
    configSections: stats.sections,
    configLeaves: stats.leaves,
    designElements: stats.designElements,
    directives: [...directives],
    inline: [...inline],
    resources,
    fonts,
    features: detected,
    suggestedLevel: suggestLevel(meta, facts, stats, apis),
    paths: stats.paths,
  };
}

// ─── PDF ────────────────────────────────────────────────────────────────────

const PAGE_OBJECT = /\/Type\s*\/Page(?![A-Za-z])/g;

/** Page objects in a PDF, including those packed in (Flate) object streams. */
export function pdfPageCount(bytes: Buffer): number {
  const text = bytes.toString("latin1");
  let count = (text.match(PAGE_OBJECT) ?? []).length;
  const stream = /(?<!end)stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = stream.exec(text))) {
    const start = match.index + match[0].length;
    const end = text.indexOf("endstream", start);
    if (end < 0) break;
    // The stream's dictionary: from its `obj` keyword to `stream`.
    const head = text.slice(Math.max(0, text.lastIndexOf(" obj", match.index)), match.index);
    if (/\/Type\s*\/ObjStm/.test(head) && /\/FlateDecode/.test(head)) {
      try {
        count += (zlib.inflateSync(bytes.subarray(start, end)).toString("latin1").match(PAGE_OBJECT) ?? []).length;
      } catch {
        // A stream we cannot inflate holds no page objects we can count.
      }
    }
    stream.lastIndex = end;
  }
  return count;
}

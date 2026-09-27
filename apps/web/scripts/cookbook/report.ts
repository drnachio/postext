/**
 * The capture report: one line per recipe edition, then its findings,
 * indented. `printResults` returns the exit code (0 green, 1 on any FAIL).
 *
 *   ✓ magazine-photo-opener en 6 pp · 1.4.1 · build 81 ms · 612 KB · 0 warnings
 *       ! C24 12 of 310 justified lines (3.9 %) stretch past 2× (worst 2.41×)
 *
 * Run by Node's type stripping: erasable TypeScript, relative `.ts` imports.
 */
import { styleText } from "node:util";
import type { CaptureResult } from "./capture.ts";

type Style = Parameters<typeof styleText>[0];
const paint = (style: Style, text: string) => styleText(style, text, { stream: process.stdout });

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function formatResult(r: CaptureResult): string[] {
  const mark = r.ok ? paint("green", "✓") : paint("red", "✗");
  const warns = r.warns.filter((w) => w.severity === "warn").length;
  const facts = [
    `${r.pages} pp`,
    r.engine ?? "",
    r.buildMs !== undefined ? `build ${Math.round(r.buildMs)} ms` : "",
    r.bytes ? kb(r.bytes) : "",
    r.ok ? plural(warns, "warning") : `${plural(r.fails.length, "failure")}, ${plural(warns, "warning")}`,
  ].filter(Boolean);
  const state = r.note ? paint("dim", ` (${r.note})`) : "";
  const lines = [`${mark} ${paint("bold", r.slug)} ${r.variant} ${facts.join(" · ")}${state}`];
  for (const f of r.fails) lines.push(`    ${paint("red", "✗")} ${paint("red", f.check)} ${f.detail}`);
  for (const w of r.warns.filter((x) => x.severity === "warn")) lines.push(`    ${paint("yellow", "!")} ${paint("yellow", w.check)} ${w.detail}`);
  for (const w of r.warns.filter((x) => x.severity === "info")) lines.push(paint("dim", `    · ${w.check} ${w.detail}`));
  return lines;
}

/** Prints the report and returns the exit code. */
export function printResults(results: CaptureResult[]): number {
  if (!results.length) {
    console.log(paint("dim", "Nothing captured: no edition matched (check --lang against the recipes' sample.locales)."));
    return 0;
  }
  for (const r of results) console.log(formatResult(r).join("\n"));
  const failed = results.filter((r) => !r.ok).length;
  const written = results.filter((r) => r.written).length;
  const seconds = results.reduce((sum, r) => sum + r.totalMs, 0) / 1000;
  const summary = [
    plural(results.length, "edition"),
    failed ? paint("red", `${failed} failed`) : paint("green", "all green"),
    `${written} written`,
    `${seconds.toFixed(1)} s of capture`,
  ];
  console.log(`\n${summary.join(" · ")}`);
  return failed ? 1 : 0;
}

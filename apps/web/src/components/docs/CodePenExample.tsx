import fs from "fs";
import path from "path";
import { getTranslations } from "next-intl/server";
import { compileDocsMdx } from "@/lib/mdx";
import { CodePenEmbed } from "./CodePenEmbed";

/** Example sources live next to the docs, one folder per pen:
 *  `docs/examples/<name>/{index.html,style.css,script.js,pen.json}`.
 *  `pen.json` carries the prefill options shared by every locale
 *  (external stylesheets, scripts, tags). */
const EXAMPLES_DIR = path.join(process.cwd(), "../../docs/examples");

type Panel = { lang: "html" | "css" | "js"; file: string; code: string };

interface CodePenExampleProps {
  /** Folder name under `docs/examples`. */
  name: string;
  /** Pen title, in the page's language. */
  title: string;
  description?: string;
  /** Embed height in CSS pixels. */
  height?: number;
  /** CodePen tabs to open, e.g. `"js,result"`. */
  defaultTab?: string;
}

function readOptional(dir: string, file: string): string {
  const p = path.join(dir, file);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf-8").trimEnd();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function highlight(lang: string, code: string) {
  const { content } = await compileDocsMdx("```" + lang + "\n" + code + "\n```");
  return content;
}

export async function CodePenExample({
  name,
  title,
  description,
  height = 560,
  defaultTab = "js,result",
}: CodePenExampleProps) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`CodePenExample: invalid name "${name}"`);
  const dir = path.join(EXAMPLES_DIR, name);
  const t = await getTranslations("CodePen");

  const panels: Panel[] = [
    { lang: "html", file: "index.html", code: readOptional(dir, "index.html") },
    { lang: "css", file: "style.css", code: readOptional(dir, "style.css") },
    { lang: "js", file: "script.js", code: readOptional(dir, "script.js") },
  ].filter((p) => p.code.length > 0) as Panel[];
  if (panels.length === 0) throw new Error(`CodePenExample: no sources under docs/examples/${name}`);

  const penJson = readOptional(dir, "pen.json");
  const shared = penJson ? (JSON.parse(penJson) as Record<string, unknown>) : {};
  // `js_module` lets the JS panel use `import` statements (ES modules).
  const prefill = { title, description, js_module: true, ...shared };

  // The markup CodePen's embed script turns into a live pen. It is inserted
  // on demand by the client component, so nothing from codepen.io loads
  // until the reader asks for it. `__THEME__` is filled in at that moment.
  const embedHtml =
    `<div class="codepen-later" data-prefill='${escapeAttr(JSON.stringify(prefill))}'` +
    ` data-height="${height}" data-default-tab="${escapeAttr(defaultTab)}"` +
    ` data-editable="true" data-theme-id="__THEME__">` +
    panels.map((p) => `<pre data-lang="${p.lang}">${escapeHtml(p.code)}</pre>`).join("") +
    `</div>`;

  const js = panels.find((p) => p.lang === "js");
  const others = panels.filter((p) => p.lang !== "js");
  const jsView = js ? await highlight("js", js.code) : null;
  const otherViews = await Promise.all(others.map(async (p) => ({ ...p, view: await highlight(p.lang, p.code) })));

  return (
    <CodePenEmbed embedHtml={embedHtml} title={title} height={height}>
      {jsView}
      {otherViews.map((p) => (
        <details key={p.lang}>
          <summary>{t("panel", { file: p.file })}</summary>
          {p.view}
        </details>
      ))}
    </CodePenEmbed>
  );
}

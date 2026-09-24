import { getTranslations } from "next-intl/server";
import { compileDocsMdx } from "@/lib/mdx";
import { readPenSources } from "@/lib/codepen";
import { CodePenEmbed } from "./CodePenEmbed";

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
  const t = await getTranslations("CodePen");
  const { panels, shared } = readPenSources(name);
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

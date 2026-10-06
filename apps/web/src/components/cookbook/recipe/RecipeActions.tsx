"use client";

import { useTranslations } from "next-intl";
import { AppWindow, ArrowUpRight, Copy, Download, FileDown, Play } from "lucide-react";
import { defineData, pageHtml } from "@/lib/cookbook/compose";
import type { ComposedPen, SampleLocale, PenJson } from "@/lib/cookbook/types";
import { openInCodePen } from "@/lib/codepenClient";
import { cn } from "@/lib/utils";
import { SOURCE_ATTR, SOURCE_EOL_ATTR, SOURCES_ID, type RecipeSourcesPayload } from "./sources";
import { copyText, showToast } from "./toast";
import { NewTabNote } from "@/components/ui/NewTabNote";

/** A composed file rebuilt from its highlighted lines (one `.cb-lc` span
 *  per line, in order, folds included), or "" when the page has none. */
function sourceText(id: "js" | "html" | "css"): string {
  const pre = document.querySelector(`pre[${SOURCE_ATTR}="${id}"]`);
  if (!pre) return "";
  const lines = [...pre.querySelectorAll(".cb-lc")].map((el) => el.textContent ?? "");
  return lines.join("\n") + (pre.hasAttribute(SOURCE_EOL_ATTR) ? "\n" : "");
}

export interface RecipeActionsData {
  slug: string;
  /** The sample edition the page shows. */
  variant: SampleLocale;
  /** "<title> · Postext Cookbook": the pen's and the download's title. */
  penTitle: string;
  /** The summary plus the canonical URL. */
  description: string;
  tags: string[];
  pdf: { href: string; size: string; pages: number } | null;
  /** The Sandbox URL that opens the recipe's `.postext` bundle; `live` when
   *  the recipe is an interactive page, of which the Sandbox gets the
   *  document only. */
  sandbox: { href: string; live: boolean } | null;
  githubUrl: string;
}

/** Open in Sandbox, the lead action of the band or the bar. */
function SandboxAction({ sandbox, short }: { sandbox: NonNullable<RecipeActionsData["sandbox"]>; short?: boolean }) {
  const t = useTranslations("CookbookRecipe");
  const title = t(sandbox.live ? "openInSandboxTitleLive" : "openInSandboxTitle");
  return (
    <a href={sandbox.href} className="cb-action cb-action-primary" title={title} aria-label={short ? title : undefined}>
      <AppWindow aria-hidden="true" className="size-3.5" />
      {t(short ? "openInSandboxShort" : "openInSandbox")}
    </a>
  );
}

/** The composed files of an edition, read at click time from the page:
 *  pen.json from the embedded JSON, the files from the whole-recipe view. */
export function readSources(variant: SampleLocale): { js: string; html: string; css: string; pen: PenJson } | null {
  const el = document.getElementById(SOURCES_ID);
  if (!el?.textContent) return null;
  const payload = (JSON.parse(el.textContent) as RecipeSourcesPayload)[variant];
  const js = sourceText("js");
  if (!payload || !js) return null;
  return { js, html: sourceText("html"), css: sourceText("css"), pen: payload.pen };
}

/** The composed pen, read from the page's embedded JSON at click time. */
function readPen(slug: string, variant: SampleLocale): ComposedPen | null {
  const files = readSources(variant);
  if (!files) return null;
  return { slug, variant, ...files, ranges: { content: [], kit: null, regions: {} }, ownLines: 0 };
}

/** Open in CodePen, Copy code and the `.html` download, for any control. */
export function useRecipeActions(data: RecipeActionsData) {
  const t = useTranslations("CookbookRecipe");
  return {
    t,
    codepen() {
      const pen = readPen(data.slug, data.variant);
      if (!pen) return;
      openInCodePen(
        defineData(pen, { title: data.penTitle, description: data.description, tags: data.tags }),
        `codepen-${data.slug.replace(/[^a-z0-9]/g, "")}`,
      );
    },
    copy() {
      const pen = readPen(data.slug, data.variant);
      if (pen) void copyText(pen.js, t("copiedCode"), t("copyFailed"));
    },
    download() {
      const pen = readPen(data.slug, data.variant);
      if (!pen) return;
      const file = `${data.slug}.html`;
      const url = URL.createObjectURL(new Blob([pageHtml(pen, { title: data.penTitle })], { type: "text/html" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(t("downloadedHtml", { file }));
    },
  };
}

/** Open in CodePen leads when the recipe has no Sandbox bundle and follows
 *  Open in Sandbox, in the lighter fill, when it has one. */
function codepenClass(data: RecipeActionsData): string {
  return cn("cb-action", data.sandbox ? "cb-action-secondary" : "cb-action-primary");
}

/** The band's actions: Open in Sandbox and Open in CodePen (both filled), Copy
 *  code, the `.html` and PDF downloads and the GitHub folder. */
export function RecipeActions({ data, className }: { data: RecipeActionsData; className?: string }) {
  const { t, codepen, copy, download } = useRecipeActions(data);
  return (
    <div role="group" aria-label={t("actionsLabel")} className={cn("cb-actions", className)}>
      {data.sandbox && <SandboxAction sandbox={data.sandbox} />}
      <button type="button" className={codepenClass(data)} title={t("openInCodePenTitle")} onClick={codepen}>
        <Play aria-hidden="true" className="size-3.5 fill-current" />
        {t("openInCodePen")}
      </button>
      <button type="button" className="cb-action" title={t("copyCodeTitle")} onClick={copy}>
        <Copy aria-hidden="true" className="size-3.5" />
        {t("copyCode")}
      </button>
      <button type="button" className="cb-action" title={t("downloadHtmlTitle")} onClick={download}>
        <Download aria-hidden="true" className="size-3.5" />
        {t("downloadHtml")}
      </button>
      {data.pdf && (
        <a
          href={data.pdf.href}
          download
          className="cb-action"
          title={t("downloadPdfTitle", { pages: data.pdf.pages })}
        >
          <FileDown aria-hidden="true" className="size-3.5" />
          {t("downloadPdf", { size: data.pdf.size })}
        </a>
      )}
      <a
        href={data.githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="cb-action cb-action-link"
        title={t("githubTitle")}
      >
        {t("github")}
        <ArrowUpRight aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
        <NewTabNote />
      </a>
    </div>
  );
}

/** Below `sm` the band drops its actions; Sandbox, CodePen, Copy and PDF
 *  sit in a bar fixed to the foot of the screen instead. */
export function RecipeActionBar({ data }: { data: RecipeActionsData }) {
  const { t, codepen, copy } = useRecipeActions(data);
  return (
    <div className="cb-action-bar on-night">
      <div role="group" aria-label={t("actionsLabel")} className="cb-action-bar-row">
        {data.sandbox && <SandboxAction sandbox={data.sandbox} short />}
        <button type="button" className={codepenClass(data)} onClick={codepen} title={t("openInCodePenTitle")}>
          <Play aria-hidden="true" className="size-3.5 fill-current" />
          {t("openInCodePenShort")}
        </button>
        <button type="button" className="cb-action" onClick={copy} title={t("copyCodeTitle")}>
          <Copy aria-hidden="true" className="size-3.5" />
          {t("copyShort")}
        </button>
        {data.pdf && (
          <a href={data.pdf.href} download className="cb-action" title={t("downloadPdfTitle", { pages: data.pdf.pages })}>
            <FileDown aria-hidden="true" className="size-3.5" />
            PDF
          </a>
        )}
      </div>
    </div>
  );
}

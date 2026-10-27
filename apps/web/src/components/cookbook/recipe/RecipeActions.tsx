"use client";

import { useTranslations } from "next-intl";
import { AppWindow, ArrowUpRight, Copy, Download, FileDown, Play } from "lucide-react";
import { defineData, pageHtml } from "@/lib/cookbook/compose";
import type { ComposedPen, SampleLocale, PenJson } from "@/lib/cookbook/types";
import { openCodePenWindow, openInCodePen, submitToCodePen } from "@/lib/codepen/codepenClient";
import { cn } from "@/lib/utils";
import { SOURCES_ID, type RecipeSourcesPayload, type WholeCode } from "./sources";
import { copyText, showToast } from "./toast";
import { loadedWholeCode, loadWholeCode, prefetchWholeCode, wholeFileText } from "./wholeCode";
import { NewTabNote } from "@/components/ui/NewTabNote";

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
  /** The page's `code.json` (sources.ts): the composed files, whole. */
  code: string;
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

type Sources = { js: string; html: string; css: string; pen: PenJson };

/** The composed files of an edition: pen.json from the page's embedded
 *  JSON, the files from `code.json`. */
function sourcesOf(code: WholeCode, variant: SampleLocale): Sources | null {
  const el = document.getElementById(SOURCES_ID);
  if (!el?.textContent) return null;
  const payload = (JSON.parse(el.textContent) as RecipeSourcesPayload)[variant];
  const js = wholeFileText(code.js);
  if (!payload || !js) return null;
  return { js, html: wholeFileText(code.html), css: wholeFileText(code.css), pen: payload.pen };
}

/** The composed files, when `code.json` has arrived (null otherwise). */
export function readSources(data: RecipeActionsData): Sources | null {
  const code = loadedWholeCode(data.code);
  return code ? sourcesOf(code, data.variant) : null;
}

/** The composed files, fetching `code.json` first if need be. */
export async function loadSources(data: RecipeActionsData): Promise<Sources | null> {
  return sourcesOf(await loadWholeCode(data.code), data.variant);
}

const penOf = (data: RecipeActionsData, files: Sources | null): ComposedPen | null =>
  files && { slug: data.slug, variant: data.variant, ...files, ranges: { content: [], kit: null, regions: {} }, ownLines: 0 };

/** Open in CodePen, Copy code and the `.html` download, for any control. */
export function useRecipeActions(data: RecipeActionsData) {
  const t = useTranslations("CookbookRecipe");
  const define = (pen: ComposedPen) => defineData(pen, { title: data.penTitle, description: data.description, tags: data.tags });
  const windowName = `codepen-${data.slug.replace(/[^a-z0-9]/g, "")}`;
  const failed = () => showToast(t("copyFailed"));
  return {
    t,
    /** Fetches `code.json` ahead of a click (hover, focus, touch). */
    prefetch() {
      prefetchWholeCode(data.code);
    },
    codepen() {
      const ready = penOf(data, readSources(data));
      if (ready) return openInCodePen(define(ready), windowName);
      // The popup opens inside the click; the pen is posted when the files arrive.
      const popup = openCodePenWindow(windowName);
      loadSources(data).then(
        (files) => {
          const pen = penOf(data, files);
          if (pen) submitToCodePen(define(pen), windowName, popup);
          else popup?.close();
        },
        () => {
          popup?.close();
          failed();
        },
      );
    },
    copy() {
      const ready = readSources(data);
      const text = ready ? ready.js : loadSources(data).then((files) => files?.js ?? Promise.reject(new Error("no script")));
      void copyText(text, t("copiedCode"), t("copyFailed"));
    },
    async download() {
      let pen: ComposedPen | null;
      try {
        pen = penOf(data, readSources(data) ?? (await loadSources(data)));
      } catch {
        return failed();
      }
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
  const { t, prefetch, codepen, copy, download } = useRecipeActions(data);
  return (
    <div
      role="group"
      aria-label={t("actionsLabel")}
      className={cn("cb-actions", className)}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
    >
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
  const { t, prefetch, codepen, copy } = useRecipeActions(data);
  return (
    <div className="cb-action-bar on-night">
      <div
        role="group"
        aria-label={t("actionsLabel")}
        className="cb-action-bar-row"
        onPointerEnter={prefetch}
        onFocus={prefetch}
        onTouchStart={prefetch}
      >
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

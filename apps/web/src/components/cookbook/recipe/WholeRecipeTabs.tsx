"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Download, Play } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { readSources, useRecipeActions, type RecipeActionsData } from "./RecipeActions";
import { copyText } from "./toast";

const LINE_HASH = /^#L(\d+)$/;
const FLASH_MS = 2600;
/** Lines shown before "Show all" (recipe.css sizes the block to match). */
const COLLAPSED_LINES = 40;
/** The fade over the collapsed block's last lines (recipe.css, 5rem). */
const FADE_PX = 80;

export interface WholeRecipePanel {
  id: "js" | "html" | "css";
  file: string;
  /** Lines shown when expanded (the fold summaries aside). */
  lines: number;
  content: React.ReactNode;
}

/** Brings line `from` (to `to`) of script.js into view: switches to its
 *  tab, expands the block, opens the fold that holds it, flashes it (a
 *  steady tint under reduced motion, recipe.css) and moves focus there, so
 *  the next Tab continues from the line rather than from the link. */
function revealLines(from: number, to: number, show: () => void) {
  show();
  requestAnimationFrame(() => {
    const first = document.getElementById(`L${from}`);
    if (!first) return;
    first.closest("details")?.setAttribute("open", "");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    first.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    first.tabIndex = -1;
    first.focus({ preventScroll: true });
    const lines: HTMLElement[] = [];
    for (let n = from; n <= Math.max(from, to); n++) {
      const el = document.getElementById(`L${n}`);
      if (el) lines.push(el);
    }
    lines.forEach((el) => el.setAttribute("data-flash", ""));
    setTimeout(() => lines.forEach((el) => el.removeAttribute("data-flash")), FLASH_MS);
  });
}

/** The whole recipe: one tab per file (script.js, then index.html and
 *  style.css when the recipe ships them), collapsed to its first lines
 *  until "Show all", with Copy (the tab's file), CodePen and `.html`. Links
 *  to `#L<n>` anywhere on the page reveal that line here. */
export function WholeRecipeTabs({ panels, data }: { panels: WholeRecipePanel[]; data: RecipeActionsData }) {
  const t = useTranslations("CookbookRecipe");
  const { codepen, download } = useRecipeActions(data);
  const [tab, setTab] = useState<string>("js");
  const [expanded, setExpanded] = useState(false);
  const current = panels.find((p) => p.id === tab) ?? panels[0];

  useEffect(() => {
    const show = () => {
      setTab("js");
      setExpanded(true);
    };
    const fromLocation = () => {
      const m = LINE_HASH.exec(window.location.hash);
      if (m) revealLines(Number(m[1]), Number(m[1]), show);
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href^='#L']");
      const m = link && LINE_HASH.exec(link.getAttribute("href") ?? "");
      if (!link || !m) return;
      event.preventDefault();
      history.replaceState(history.state, "", `#L${m[1]}`);
      revealLines(Number(m[1]), Number(link.dataset.to ?? m[1]), show);
    };
    // The URL is an external store: read it after hydration.
    const raf = requestAnimationFrame(fromLocation);
    window.addEventListener("hashchange", fromLocation);
    document.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", fromLocation);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const copyFile = () => {
    const files = readSources(data.variant);
    const text = files?.[current.id];
    if (text !== undefined) void copyText(text, t("copiedFile", { file: current.file }), t("copyFailed"));
  };

  const collapsible = current.lines > COLLAPSED_LINES;
  const collapsed = collapsible && !expanded;

  // The collapsed block clips its code without a scrollbar: focus (a fold's
  // summary far below the cut) or find-in-page would scroll it and hide its
  // first lines for good. Either expands it instead.
  const onBodyFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!collapsed) return;
    const body = event.currentTarget;
    const target = event.target as HTMLElement;
    const top = target.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    if (top < body.clientHeight - FADE_PX) return;
    body.scrollTop = 0;
    setExpanded(true);
    requestAnimationFrame(() => target.scrollIntoView({ block: "nearest" }));
  };
  const onBodyScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (!collapsed || event.currentTarget.scrollTop === 0) return;
    event.currentTarget.scrollTop = 0;
    setExpanded(true);
  };

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="cb-whole">
      <div className="cb-whole-bar">
        <TabsList variant="line" aria-label={t("wholeLabel")} className="cb-whole-tabs">
          {panels.map((p) => (
            <TabsTrigger key={p.id} value={p.id} className="cb-whole-tab">
              {p.file}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="cb-whole-actions">
          <button type="button" className="cb-code-button" onClick={copyFile} aria-label={t("copyFile", { file: current.file })}>
            <Copy aria-hidden="true" className="size-3.5" />
            {t("copyShort")}
          </button>
          <button type="button" className="cb-code-button" onClick={codepen} title={t("openInCodePenTitle")}>
            <Play aria-hidden="true" className="size-3.5 fill-current" />
            {t("openInCodePenShort")}
          </button>
          <button type="button" className="cb-code-button" onClick={download} title={t("downloadHtmlTitle")}>
            <Download aria-hidden="true" className="size-3.5" />
            {t("downloadHtml")}
          </button>
        </div>
      </div>
      <div
        className="cb-whole-body"
        data-collapsed={collapsed ? "" : undefined}
        onFocusCapture={onBodyFocus}
        onScroll={onBodyScroll}
      >
        {panels.map((p) => (
          <TabsContent key={p.id} value={p.id} keepMounted className="cb-whole-panel">
            {p.content}
          </TabsContent>
        ))}
      </div>
      {collapsible && (
        <button
          type="button"
          className="cb-whole-more"
          aria-expanded={expanded}
          onClick={(event) => {
            // Collapsing from far down: bring the block's head back into view.
            if (expanded) event.currentTarget.closest(".cb-whole")?.scrollIntoView({ block: "start" });
            setExpanded(!expanded);
          }}
        >
          {expanded ? t("showLess") : t("showAll", { count: current.lines })}
        </button>
      )}
    </Tabs>
  );
}

"use client";

import { useState, useCallback, useId } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, SquareArrowOutUpRight } from "lucide-react";
import { openCodePenWindow, submitToCodePen } from "@/lib/codepen/codepenClient";
import { loadPenSources, penDefine, type PenRef } from "@/lib/codepen/codepenDefine";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  copyable?: boolean;
  /** A file name or language shown in the block's title bar. */
  title?: string;
  className?: string;
  /** The docs example behind the block: adds an "Open in CodePen" button
   *  that runs a working version of it. */
  codepen?: PenRef;
  children: React.ReactNode;
}

const buttonClass =
  "flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-md border border-rule bg-background/80 px-2.5 py-1 font-sans text-xs font-medium text-slate backdrop-blur hover:text-foreground max-sm:p-0";

export function CodeBlock({ code, copyable = true, title, className, codepen, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("CodeBlock");
  const windowName = `codepen-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  // The popup opens inside the click (a later one is blocked); the pen is
  // posted to it when the sources arrive.
  const handleCodePen = useCallback(() => {
    if (!codepen) return;
    const { name, ...meta } = codepen;
    const popup = openCodePenWindow(windowName);
    loadPenSources(name).then(
      (sources) => submitToCodePen(penDefine(sources, meta), windowName, popup),
      () => popup?.close(),
    );
  }, [codepen, windowName]);
  const prefetchPen = useCallback(() => {
    if (codepen) loadPenSources(codepen.name).catch(() => {});
  }, [codepen]);

  return (
    // Code reads left to right on every page.
    <div dir="ltr" className={cn("group relative overflow-hidden rounded-lg border border-rule bg-surface", className)}>
      {title && (
        <div className="flex min-h-[3.25rem] items-center gap-2 border-b border-rule px-4 py-2.5">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-blue" />
            <span className="size-2.5 rounded-full bg-gold" />
            <span className="size-2.5 rounded-full bg-red" />
          </span>
          <span className="ms-2 font-mono text-xs text-slate">{title}</span>
        </div>
      )}
      <pre
        className="overflow-x-auto p-5 font-mono text-[0.8rem] leading-7 md:p-6 2xl:p-8 2xl:text-base 2xl:leading-8"
        data-scroll-region=""
        data-scroll-label={title}
      >
        <code>{children}</code>
      </pre>
      {(copyable || codepen) && (
        <div
          className={cn(
            "absolute end-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100",
            title ? "top-1.5" : "top-3",
          )}
        >
          {codepen && (
            <button
              type="button"
              onClick={handleCodePen}
              onPointerEnter={prefetchPen}
              onFocus={prefetchPen}
              aria-label={t("openInCodePenAriaLabel")}
              title={t("openInCodePenAriaLabel")}
              className={buttonClass}
              style={{ touchAction: "manipulation" }}
            >
              <SquareArrowOutUpRight className="size-3.5" />
              <span className="max-sm:sr-only">{t("openInCodePen")}</span>
            </button>
          )}
          {copyable && (
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? t("copiedAriaLabel") : t("copyAriaLabel")}
              aria-live="polite"
              className={buttonClass}
              style={{ touchAction: "manipulation" }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              <span className="max-sm:sr-only">{copied ? t("copied") : t("copy")}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

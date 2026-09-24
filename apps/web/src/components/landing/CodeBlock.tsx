"use client";

import { useState, useCallback, useId } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, SquareArrowOutUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const CODEPEN_DEFINE = "https://codepen.io/pen/define";

/** Opens a new pen prefilled with `data` (CodePen's "POST to prefill
 *  editors" JSON) in a popup window, or a new tab when popups are blocked. */
function openInCodePen(data: string, windowName: string) {
  const width = Math.min(1280, window.screen.availWidth - 80);
  const height = Math.min(860, window.screen.availHeight - 80);
  const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
  const popup = window.open("", windowName, `popup,width=${width},height=${height},left=${left},top=${top}`);
  // The pen must not be able to navigate this page.
  if (popup) popup.opener = null;

  const form = document.createElement("form");
  form.action = CODEPEN_DEFINE;
  form.method = "POST";
  form.target = popup ? windowName : "_blank";
  form.hidden = true;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "data";
  input.value = data;
  form.append(input);
  document.body.append(form);
  form.submit();
  form.remove();
}

interface CodeBlockProps {
  code: string;
  copyable?: boolean;
  /** A file name or language shown in the block's title bar. */
  title?: string;
  className?: string;
  /** Prefill JSON for CodePen (see `penDefineData`): adds an "Open in
   *  CodePen" button that runs a working version of the example. */
  codepen?: string;
  children: React.ReactNode;
}

const buttonClass =
  "flex items-center gap-1.5 rounded-md border border-rule bg-background/80 px-2.5 py-1 font-sans text-xs font-medium text-slate backdrop-blur hover:text-foreground";

export function CodeBlock({ code, copyable = true, title, className, codepen, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("CodeBlock");
  const windowName = `codepen-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className={cn("group relative overflow-hidden rounded-lg border border-rule bg-surface", className)}>
      {title && (
        <div className="flex items-center gap-2 border-b border-rule px-4 py-2.5">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-blue" />
            <span className="size-2.5 rounded-full bg-gold" />
            <span className="size-2.5 rounded-full bg-red" />
          </span>
          <span className="ml-2 font-mono text-xs text-slate">{title}</span>
        </div>
      )}
      <pre
        className="overflow-x-auto p-5 font-mono text-[0.8rem] leading-7 md:p-6 2xl:p-8 2xl:text-base 2xl:leading-8"
        tabIndex={0}
        aria-label={t("codeAriaLabel")}
      >
        <code>{children}</code>
      </pre>
      {(copyable || codepen) && (
        <div
          className={cn(
            "absolute right-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100",
            title ? "top-1.5" : "top-3",
          )}
        >
          {codepen && (
            <button
              type="button"
              onClick={() => openInCodePen(codepen, windowName)}
              aria-label={t("openInCodePenAriaLabel")}
              title={t("openInCodePenAriaLabel")}
              className={buttonClass}
              style={{ touchAction: "manipulation" }}
            >
              <SquareArrowOutUpRight className="size-3.5" />
              {t("openInCodePen")}
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
              {copied ? t("copied") : t("copy")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

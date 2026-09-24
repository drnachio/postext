"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  copyable?: boolean;
  /** A file name or language shown in the block's title bar. */
  title?: string;
  className?: string;
  children: React.ReactNode;
}

export function CodeBlock({ code, copyable = true, title, className, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("CodeBlock");

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
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? t("copiedAriaLabel") : t("copyAriaLabel")}
          aria-live="polite"
          className={cn(
            "absolute right-3 flex items-center gap-1.5 rounded-md border border-rule bg-background/80 px-2.5 py-1 font-sans text-xs font-medium text-slate opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100",
            title ? "top-1.5" : "top-3",
          )}
          style={{ touchAction: "manipulation" }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? t("copied") : t("copy")}
        </button>
      )}
    </div>
  );
}

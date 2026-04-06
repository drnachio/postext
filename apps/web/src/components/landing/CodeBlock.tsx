"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";

interface CodeBlockProps {
  code: string;
  copyable?: boolean;
  children: React.ReactNode;
}

export function CodeBlock({ code, copyable = true, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations("CodeBlock");

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group">
      <pre
        className="overflow-x-auto border border-rule bg-surface p-6 font-mono text-sm leading-7 2xl:p-8 2xl:text-base 2xl:leading-8 4xl:p-10 4xl:text-lg 4xl:leading-9"
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
          className="absolute top-4 right-4 border border-rule px-3 py-1 font-mono text-xs text-slate opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 2xl:top-6 2xl:right-6 2xl:px-4 2xl:py-2 2xl:text-sm 4xl:top-8 4xl:right-8 4xl:px-5 4xl:py-3 4xl:text-base"
          style={{ touchAction: "manipulation" }}
        >
          {copied ? t("copied") : t("copy")}
        </button>
      )}
    </div>
  );
}

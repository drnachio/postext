"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** `pnpm add postext` as a copyable chip. */
export function InstallChip({ className, command = "pnpm add postext" }: { className?: string; command?: string }) {
  const t = useTranslations("CodeBlock");
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [command]);
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? t("copiedAriaLabel") : t("copyAriaLabel")}
      className={cn(
        "group inline-flex items-center gap-3 rounded-md border border-rule bg-elevated px-4 py-2.5 font-mono text-[0.8rem] text-foreground/90 transition-colors hover:border-brand/60",
        className,
      )}
    >
      <span className="text-brand">$</span>
      <span>{command}</span>
      <span className="ml-2 text-slate transition-colors group-hover:text-brand">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </span>
    </button>
  );
}

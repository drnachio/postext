"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** `pnpm add postext` as a copyable chip, on night. */
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
        "group inline-flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 font-mono text-[0.8rem] text-cream/90 transition-colors hover:border-gold/60",
        className,
      )}
    >
      <span className="text-gold">$</span>
      <span>{command}</span>
      <span className="ml-2 text-mist/60 transition-colors group-hover:text-gold">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </span>
    </button>
  );
}

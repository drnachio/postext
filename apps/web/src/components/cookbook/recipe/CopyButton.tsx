"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { copyText } from "./toast";

/** A small "Copy" button for a code block: the text is a prop (an excerpt
 *  is short), the confirmation goes to the page's toast. */
export function CopyButton({
  text,
  label,
  ariaLabel,
  copied,
  failed,
  className,
}: {
  text: string;
  label: string;
  ariaLabel?: string;
  /** Toast shown after copying. */
  copied: string;
  failed: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn("cb-code-button", className)}
      onClick={async () => {
        if (await copyText(text, copied, failed)) {
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        }
      }}
    >
      {done ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
      {label}
    </button>
  );
}

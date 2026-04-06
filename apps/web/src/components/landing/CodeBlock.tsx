"use client";

import { useState, useCallback } from "react";

interface CodeBlockProps {
  code: string;
  copyable?: boolean;
  children: React.ReactNode;
}

export function CodeBlock({ code, copyable = true, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group">
      <pre className="overflow-x-auto border border-rule bg-surface p-6 font-mono text-sm leading-7">
        <code>{children}</code>
      </pre>
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code to clipboard"
          className="absolute top-4 right-4 border border-rule px-3 py-1 font-mono text-xs text-slate opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-red"
          style={{ touchAction: "manipulation" }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

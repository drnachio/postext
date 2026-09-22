"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/** CodePen's prefill-embed loader: it turns `.codepen` wrappers into live
 *  pens on load and exposes `window.__CPEmbed(selector)` for wrappers
 *  enhanced later. https://blog.codepen.io/documentation/prefill-embeds/ */
const EMBED_SCRIPT = "https://public.codepenassets.com/embed/index.js";

declare global {
  interface Window {
    __CPEmbed?: (selector?: string) => void;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadEmbedScript(): Promise<void> {
  if (typeof window.__CPEmbed === "function") return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = EMBED_SCRIPT;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        script.remove();
        reject(new Error("CodePen embed script failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

type EmbedState = "idle" | "loading" | "ready" | "error";

interface CodePenEmbedProps {
  /** Prefill wrapper markup (a `.codepen-later` div with `<pre>` panels). */
  embedHtml: string;
  title: string;
  height: number;
  /** Static, highlighted view of the sources, shown until the pen loads. */
  children: ReactNode;
}

export function CodePenEmbed({ embedHtml, title, height, children }: CodePenEmbedProps) {
  const t = useTranslations("CodePen");
  const id = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<EmbedState>("idle");

  const run = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    setState("loading");
    try {
      const theme = document.documentElement.classList.contains("light") ? "light" : "dark";
      // The host div has no React children, so the embed script may replace
      // this markup with its iframe without React noticing.
      host.innerHTML = embedHtml
        .replace("__THEME__", theme)
        .replace('class="codepen-later"', `class="codepen-later" data-cp-id="${id}"`);
      await loadEmbedScript();
      if (typeof window.__CPEmbed !== "function") throw new Error("CodePen embed API missing");
      window.__CPEmbed(`[data-cp-id="${id}"]`);
      setState("ready");
    } catch {
      if (hostRef.current) hostRef.current.innerHTML = "";
      setState("error");
    }
  }, [embedHtml, id]);

  return (
    <div className="docs-codepen" data-state={state}>
      <div className="docs-codepen-bar">
        <span className="docs-codepen-title">{title}</span>
        {state !== "ready" && (
          <button
            type="button"
            className="docs-codepen-run"
            onClick={run}
            disabled={state === "loading"}
            style={{ touchAction: "manipulation" }}
          >
            {state === "loading" ? t("loading") : t("run")}
          </button>
        )}
      </div>
      {state === "error" && <p className="docs-codepen-note docs-codepen-error">{t("error")}</p>}
      {state !== "ready" && <div className="docs-codepen-code">{children}</div>}
      <div
        ref={hostRef}
        className="docs-codepen-embed"
        style={{ minHeight: state === "ready" ? height : 0 }}
        aria-label={title}
      />
      {state === "idle" && <p className="docs-codepen-note">{t("hint")}</p>}
    </div>
  );
}

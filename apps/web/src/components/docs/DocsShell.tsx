"use client";

import { useEffect, useRef } from "react";

interface DocsShellProps {
  children: React.ReactNode;
}

export function DocsShell({ children }: DocsShellProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function update() {
      const nav = document.querySelector("nav[data-site-nav]");
      if (nav && ref.current) {
        const h = nav.getBoundingClientRect().height;
        ref.current.style.setProperty("--docs-nav-h", `${h}px`);
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <div
      ref={ref}
      className="mx-auto flex max-w-6xl px-6 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12"
      style={{ ["--docs-nav-h" as string]: "4rem" }}
    >
      {children}
    </div>
  );
}

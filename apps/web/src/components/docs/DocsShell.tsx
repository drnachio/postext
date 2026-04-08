"use client";

import { useEffect, useRef } from "react";

interface DocsShellProps {
  children: React.ReactNode;
}

export function DocsShell({ children }: DocsShellProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function update() {
      const nav = document.querySelector("nav[aria-label='Main navigation']");
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
      className="mx-auto flex max-w-7xl px-4 2xl:max-w-[90rem] 2xl:px-6 4xl:px-8"
      style={{ ["--docs-nav-h" as string]: "4rem" }}
    >
      {children}
    </div>
  );
}

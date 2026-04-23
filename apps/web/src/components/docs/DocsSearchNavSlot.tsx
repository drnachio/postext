"use client";

import { usePathname } from "next/navigation";
import { DocsSearchTrigger } from "./DocsSearchPalette";

export function DocsSearchNavSlot() {
  const pathname = usePathname();
  if (!pathname) return null;
  const parts = pathname.split("/").filter(Boolean);
  const isDocs = parts[1] === "docs";
  if (!isDocs) return null;
  return <DocsSearchTrigger variant="compact" />;
}

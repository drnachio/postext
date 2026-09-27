"use client";

import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";

/** Whether the locale-less `pathname` is `href` or a page under it. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** A navbar section link: locale-aware, and marked as the current section
 *  (`aria-current="page"`, a 2 px brand underline) on its own pages. */
export function NavLink({ href, className = "", children }: { href: string; className?: string; children: ReactNode }) {
  const active = isActivePath(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${
        active ? "text-foreground underline decoration-brand decoration-2 underline-offset-[0.45em]" : ""
      }`}
    >
      {children}
    </Link>
  );
}

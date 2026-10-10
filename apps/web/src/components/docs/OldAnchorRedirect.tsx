"use client";

import { useEffect } from "react";
import { oldAnchorUrl, type OldAnchorTable } from "@/lib/oldAnchors";

/** Sends an address of a page that was split (`/docs/configuration#table-style`)
 *  to the page that holds the heading now. A fragment never reaches the
 *  server, so the page itself looks at it: when it names no element here but
 *  a heading that moved, the browser goes to that heading's page, in the same
 *  language, and the old address leaves the history. */
export function OldAnchorRedirect({ locale, pages }: { locale: string; pages: OldAnchorTable }) {
  useEffect(() => {
    const follow = () => {
      const url = oldAnchorUrl(pages, locale, window.location, (id) => document.getElementById(id) !== null);
      if (url) window.location.replace(url);
    };
    follow();
    window.addEventListener("hashchange", follow);
    window.addEventListener("popstate", follow);
    return () => {
      window.removeEventListener("hashchange", follow);
      window.removeEventListener("popstate", follow);
    };
  }, [locale, pages]);
  return null;
}

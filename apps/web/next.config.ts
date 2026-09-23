import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  // Every page has a Markdown rendition at its URL plus `.md` (the llms.txt
  // convention), served by app/md/[locale]/[[...path]]/route.ts.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/:locale(en|es).md", destination: "/md/:locale" },
        { source: "/:locale(en|es)/:page.md", destination: "/md/:locale/:page" },
        { source: "/:locale(en|es)/docs/:slug.md", destination: "/md/:locale/docs/:slug" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);

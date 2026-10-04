import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import fs from "node:fs";
import path from "node:path";

type Redirect = { source: string; destination: string; permanent: boolean };

/** Permanent redirects the Cookbook's recipes ask for: each former slug to
 *  its recipe, and a retired recipe to its replacement (page and `.md`
 *  rendition). Read straight from `cookbook/<slug>/recipe.json`, since the
 *  config loads before the app's modules. */
function recipeRedirects(): Redirect[] {
  const dir = path.join(__dirname, "../../cookbook");
  if (!fs.existsSync(dir)) return [];
  const out: Redirect[] = [];
  const move = (from: string, to: string) => {
    // Only well-formed slugs become path patterns (the validator reports the rest).
    if (![from, to].every((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s))) return;
    for (const ext of ["", ".md"]) {
      out.push({
        source: `/:locale(en|es|ca|zh|ar)/cookbook/${from}${ext}`,
        destination: `/:locale/cookbook/${to}${ext}`,
        permanent: true,
      });
    }
  };
  for (const slug of fs.readdirSync(dir)) {
    const file = path.join(dir, slug, "recipe.json");
    if (slug.startsWith("_") || !fs.existsSync(file)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(file, "utf-8")) as {
        status?: string;
        replacedBy?: string;
        formerSlugs?: string[];
      };
      for (const former of meta.formerSlugs ?? []) move(former, slug);
      if (meta.status === "retired" && meta.replacedBy) move(slug, meta.replacedBy);
    } catch {
      // A malformed recipe.json fails `pnpm cookbook lint` and the build's
      // recipe loader; it only loses its redirects here.
    }
  }
  return out;
}

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  // The Cookbook's modules build their paths from process.cwd() (and an
  // override), which the file tracer cannot narrow: every route importing
  // them would carry public/'s fonts, presets and captures in its server
  // function, growing with each recipe. Those routes are prerendered and
  // public/ is served statically, so no server code reads these at runtime.
  outputFileTracingExcludes: {
    "/*": ["public/fonts/**", "public/presets/**", "public/cookbook/**"],
  },
  // Cookbook media carry a content hash (`?v=<hash8>`, lib/cookbook/images):
  // a versioned URL never changes. Unversioned ones (JSON-LD) revalidate.
  async headers() {
    return [
      {
        source: "/cookbook/:slug/:variant/:file",
        has: [{ type: "query", key: "v" }],
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  async redirects() {
    return [
      // The words people guess for the Cookbook.
      {
        source: "/:locale(en|es|ca|zh|ar)/:alias(examples|recipes|recetas|recetario|receptes|receptari)",
        destination: "/:locale/cookbook",
        permanent: true,
      },
      ...recipeRedirects(),
    ];
  },
  // Every page has a Markdown rendition at its URL plus `.md` (the llms.txt
  // convention), served by app/md/[locale]/[[...path]]/route.ts.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/:locale(en|es|ca|zh|ar).md", destination: "/md/:locale" },
        { source: "/:locale(en|es|ca|zh|ar)/:page.md", destination: "/md/:locale/:page" },
        { source: "/:locale(en|es|ca|zh|ar)/docs/:slug.md", destination: "/md/:locale/docs/:slug" },
        { source: "/:locale(en|es|ca|zh|ar)/cookbook/:slug.md", destination: "/md/:locale/cookbook/:slug" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);

import { compileMDX, type MDXRemoteProps } from "next-mdx-remote/rsc";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import { CODE_THEME_DARK, CODE_THEME_LIGHT } from "@/lib/codeThemes";
import rehypeAbbr, { type RehypeAbbrOptions } from "@/lib/glossary/rehypeAbbr";

export interface DocsMdxOptions {
  /** The text's language: known abbreviations get an `<abbr>` with their
   *  expansion in it, the first time each appears. Omitted, none do. */
  locale?: string;
  /** Abbreviations already expanded on the page (shared between the
   *  fragments of one page, and filled by this compile). */
  abbrSeen?: Set<string>;
}

/** Compile a docs MDX source with the site's shared rehype pipeline
 *  (heading ids, abbreviations + shiki dual-theme highlighting). */
export function compileDocsMdx(
  source: string,
  components?: MDXRemoteProps["components"],
  options: DocsMdxOptions = {},
) {
  return compileMDX({
    source,
    components,
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        rehypePlugins: [
          rehypeSlug,
          ...(options.locale
            ? [[rehypeAbbr, { locale: options.locale, seen: options.abbrSeen }] as [typeof rehypeAbbr, RehypeAbbrOptions]]
            : []),
          [
            rehypePrettyCode,
            {
              theme: {
                dark: CODE_THEME_DARK,
                light: CODE_THEME_LIGHT,
              },
              keepBackground: false,
            },
          ],
        ],
      },
    },
  });
}

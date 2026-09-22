import { compileMDX, type MDXRemoteProps } from "next-mdx-remote/rsc";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";

/** Compile a docs MDX source with the site's shared rehype pipeline
 *  (heading ids + shiki dual-theme highlighting). */
export function compileDocsMdx(source: string, components?: MDXRemoteProps["components"]) {
  return compileMDX({
    source,
    components,
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        rehypePlugins: [
          rehypeSlug,
          [
            rehypePrettyCode,
            {
              theme: {
                dark: "github-dark",
                light: "github-light",
              },
              keepBackground: false,
            },
          ],
        ],
      },
    },
  });
}

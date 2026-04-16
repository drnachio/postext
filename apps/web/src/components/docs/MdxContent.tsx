import Link from "next/link";
import { compileMDX } from "next-mdx-remote/rsc";
import rehypePrettyCode from "rehype-pretty-code";
import * as illustrations from "./illustrations";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function createHeading(level: 1 | 2 | 3) {
  const Tag = `h${level}` as const;
  return function Heading({ children }: { children: React.ReactNode }) {
    const text = typeof children === "string" ? children : String(children);
    const id = slugify(text);
    return (
      <Tag id={id} className="docs-heading group" style={{ scrollMarginTop: "var(--docs-nav-h, 5rem)" }}>
        <a
          href={`#${id}`}
          className="docs-heading-anchor"
          aria-label={`Link to ${text}`}
        >
          #
        </a>
        {children}
      </Tag>
    );
  };
}

function MdxLink({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (href && href.startsWith("/")) {
    return (
      <Link href={href} className="docs-link" {...props}>
        {children}
      </Link>
    );
  }
  return <a href={href} {...props}>{children}</a>;
}

const components = {
  h1: createHeading(1),
  h2: createHeading(2),
  h3: createHeading(3),
  a: MdxLink,
  ...illustrations,
};

function wrapScrollableElements(source: string): string {
  // Wrap top-level <table> blocks in a scrollable div
  source = source.replace(
    /^(<table[\s>])/gm,
    '<div className="scroll-wrapper">\n$1'
  );
  source = source.replace(
    /^(<\/table>)/gm,
    '$1\n</div>'
  );

  // Wrap top-level <svg> blocks in a scrollable div
  source = source.replace(
    /^(<svg[\s>])/gm,
    '<div className="scroll-wrapper">\n$1'
  );
  source = source.replace(
    /^(<\/svg>)/gm,
    '$1\n</div>'
  );

  return source;
}

interface MdxContentProps {
  source: string;
  skipTitle?: boolean;
}

export async function MdxContent({ source, skipTitle }: MdxContentProps) {
  let cleaned = source.replace(
    /export\s+const\s+metadata\s*=\s*\{[\s\S]+?\};\s*/,
    ""
  );

  if (skipTitle) {
    cleaned = cleaned.replace(/^# .+$/m, "");
  }

  cleaned = wrapScrollableElements(cleaned);

  const { content } = await compileMDX({
    source: cleaned,
    components,
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        rehypePlugins: [
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

  return (
    <div className="docs-content prose prose-invert max-w-none">
      {content}
    </div>
  );
}

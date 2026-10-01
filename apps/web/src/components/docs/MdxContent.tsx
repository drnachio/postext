import Link from "next/link";
import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import { compileDocsMdx } from "@/lib/mdx";
import * as illustrations from "./illustrations";
import { CodePenExample } from "./CodePenExample";
import { TutorialVideo } from "./TutorialVideo";
import { NewTabNote } from "@/components/ui/NewTabNote";

/** The plain text of rendered children (inline code, emphasis and all). */
function plainText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (typeof node === "object" && "props" in node) {
    return plainText((node.props as { children?: React.ReactNode }).children);
  }
  return "";
}

function createHeading(level: 1 | 2 | 3) {
  const Tag = `h${level}` as const;
  return function Heading({ id, children }: { id?: string; children: React.ReactNode }) {
    const t = useTranslations("Docs");
    const text = plainText(children);
    return (
      <Tag id={id} className="docs-heading group" style={{ scrollMarginTop: "var(--docs-nav-h, 5rem)" }}>
        {id && (
          <a
            href={`#${id}`}
            className="docs-heading-anchor"
            aria-label={t("headingLink", { heading: text })}
          >
            #
          </a>
        )}
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
  return (
    <a href={href} {...props}>
      {children}
      {props.target === "_blank" && <NewTabNote />}
    </a>
  );
}

const components = {
  h1: createHeading(1),
  h2: createHeading(2),
  h3: createHeading(3),
  a: MdxLink,
  ...illustrations,
  CodePenExample,
  TutorialVideo,
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
  /** Extra MDX components, merged over the docs map (the Cookbook's). */
  components?: Parameters<typeof compileDocsMdx>[1];
  /** The text's language, for the abbreviations' expansions (the request's
   *  locale when omitted). */
  locale?: string;
  /** Abbreviations already expanded earlier on the page; see compileDocsMdx. */
  abbrSeen?: Set<string>;
}

export async function MdxContent({ source, skipTitle, components: extra, locale, abbrSeen }: MdxContentProps) {
  let cleaned = source.replace(
    /export\s+const\s+metadata\s*=\s*\{[\s\S]+?\};\s*/,
    ""
  );

  if (skipTitle) {
    cleaned = cleaned.replace(/^# .+$/m, "");
  }

  cleaned = wrapScrollableElements(cleaned);

  const { content } = await compileDocsMdx(cleaned, extra ? { ...components, ...extra } : components, {
    locale: locale ?? (await getLocale()),
    abbrSeen,
  });

  return (
    <div className="docs-content prose prose-invert max-w-none">
      {content}
    </div>
  );
}

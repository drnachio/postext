import { useTranslations } from "next-intl";

/** Screen-reader text for a link with `target="_blank"` (WCAG 3.2.5): put
 *  it inside the link, after the visible label. */
export function NewTabNote() {
  const t = useTranslations("Accessibility");
  return <span className="sr-only"> ({t("opensInNewTab")})</span>;
}

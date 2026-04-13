"use client";

import Link from "next/link";
import { PostextSandbox, DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES } from "postext-sandbox";
import { useTranslations, useLocale } from "next-intl";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CompactLanguageSwitcher } from "@/components/sandbox/CompactLanguageSwitcher";
import type { SandboxLabels } from "postext-sandbox";

export function SandboxPage() {
  const t = useTranslations("Sandbox");
  const locale = useLocale();
  const initialMarkdown = locale === "es" ? DEFAULT_MARKDOWN_ES : DEFAULT_MARKDOWN_EN;

  const labels: SandboxLabels = {
    configuration: t("configuration"),
    resources: t("resources"),
    markdownEditor: t("markdownEditor"),
    canvas: t("canvas"),
    html: t("html"),
    pdf: t("pdf"),
    comingSoon: t("comingSoon"),
    resourcesComingSoonDescription: t("resourcesComingSoonDescription"),
    pdfComingSoonDescription: t("pdfComingSoonDescription"),
    page: t("page"),
    pageBackgroundColor: t("pageBackgroundColor"),
    pageBackgroundColorTooltip: t("pageBackgroundColorTooltip"),
    pageSize: t("pageSize"),
    pageSizeTooltip: t("pageSizeTooltip"),
    custom: t("custom"),
    width: t("width"),
    widthTooltip: t("widthTooltip"),
    height: t("height"),
    heightTooltip: t("heightTooltip"),
    marginTop: t("marginTop"),
    marginBottom: t("marginBottom"),
    marginLeft: t("marginLeft"),
    marginRight: t("marginRight"),
    marginsTooltip: t("marginsTooltip"),
    dpi: t("dpi"),
    dpiTooltip: t("dpiTooltip"),
    cutLines: t("cutLines"),
    cutLinesTooltip: t("cutLinesTooltip"),
    baselineGrid: t("baselineGrid"),
    baselineGridTooltip: t("baselineGridTooltip"),
    baselineGridColor: t("baselineGridColor"),
    baselineGridColorTooltip: t("baselineGridColorTooltip"),
    baselineGridLineWidth: t("baselineGridLineWidth"),
    baselineGridLineWidthTooltip: t("baselineGridLineWidthTooltip"),
    bodyText: t("bodyText"),
    bodyFont: t("bodyFont"),
    bodyFontTooltip: t("bodyFontTooltip"),
    bodyFontSearch: t("bodyFontSearch"),
    bodyFontNoResults: t("bodyFontNoResults"),
    bodyFontSize: t("bodyFontSize"),
    bodyFontSizeTooltip: t("bodyFontSizeTooltip"),
    bodyLineHeight: t("bodyLineHeight"),
    bodyLineHeightTooltip: t("bodyLineHeightTooltip"),
    bodyColor: t("bodyColor"),
    bodyColorTooltip: t("bodyColorTooltip"),
    bodyTextAlign: t("bodyTextAlign"),
    bodyTextAlignTooltip: t("bodyTextAlignTooltip"),
    bodyTextAlignLeft: t("bodyTextAlignLeft"),
    bodyTextAlignJustify: t("bodyTextAlignJustify"),
    bodyHyphenation: t("bodyHyphenation"),
    bodyHyphenationTooltip: t("bodyHyphenationTooltip"),
    bodyFontWeight: t("bodyFontWeight"),
    bodyFontWeightTooltip: t("bodyFontWeightTooltip"),
    bodyBoldFontWeight: t("bodyBoldFontWeight"),
    bodyBoldFontWeightTooltip: t("bodyBoldFontWeightTooltip"),
    bodyHyphenationLocale: t("bodyHyphenationLocale"),
    bodyHyphenationLocaleTooltip: t("bodyHyphenationLocaleTooltip"),
    headings: t("headings"),
    headingsFont: t("headingsFont"),
    headingsFontTooltip: t("headingsFontTooltip"),
    headingsFontSearch: t("headingsFontSearch"),
    headingsFontNoResults: t("headingsFontNoResults"),
    headingsLineHeight: t("headingsLineHeight"),
    headingsLineHeightTooltip: t("headingsLineHeightTooltip"),
    headingsColor: t("headingsColor"),
    headingsColorTooltip: t("headingsColorTooltip"),
    headingsFontWeight: t("headingsFontWeight"),
    headingsFontWeightTooltip: t("headingsFontWeightTooltip"),
    headingsMarginTop: t("headingsMarginTop"),
    headingsMarginTopTooltip: t("headingsMarginTopTooltip"),
    headingsMarginBottom: t("headingsMarginBottom"),
    headingsMarginBottomTooltip: t("headingsMarginBottomTooltip"),
    headingLevel: t("headingLevel"),
    headingFontSize: t("headingFontSize"),
    headingFontSizeTooltip: t("headingFontSizeTooltip"),
    headingLineHeight: t("headingLineHeight"),
    headingLineHeightTooltip: t("headingLineHeightTooltip"),
    headingFont: t("headingFont"),
    headingFontTooltip: t("headingFontTooltip"),
    headingFontSearch: t("headingFontSearch"),
    headingFontNoResults: t("headingFontNoResults"),
    headingColor: t("headingColor"),
    headingColorTooltip: t("headingColorTooltip"),
    headingFontWeight: t("headingFontWeight"),
    headingFontWeightTooltip: t("headingFontWeightTooltip"),
    headingMarginTop: t("headingMarginTop"),
    headingMarginTopTooltip: t("headingMarginTopTooltip"),
    headingMarginBottom: t("headingMarginBottom"),
    headingMarginBottomTooltip: t("headingMarginBottomTooltip"),
    headingsTextAlign: t("headingsTextAlign"),
    headingsTextAlignTooltip: t("headingsTextAlignTooltip"),
    headingsTextAlignLeft: t("headingsTextAlignLeft"),
    headingsTextAlignJustify: t("headingsTextAlignJustify"),
    layout: t("layout"),
    layoutType: t("layoutType"),
    layoutTypeTooltip: t("layoutTypeTooltip"),
    layoutSingle: t("layoutSingle"),
    layoutDouble: t("layoutDouble"),
    layoutOneAndHalf: t("layoutOneAndHalf"),
    gutterWidth: t("gutterWidth"),
    gutterWidthTooltip: t("gutterWidthTooltip"),
    sideColumnPercent: t("sideColumnPercent"),
    sideColumnPercentTooltip: t("sideColumnPercentTooltip"),
    columnRule: t("columnRule"),
    columnRuleTooltip: t("columnRuleTooltip"),
    columnRuleColor: t("columnRuleColor"),
    columnRuleColorTooltip: t("columnRuleColorTooltip"),
    columnRuleLineWidth: t("columnRuleLineWidth"),
    columnRuleLineWidthTooltip: t("columnRuleLineWidthTooltip"),
    zoomIn: t("zoomIn"),
    zoomOut: t("zoomOut"),
    fitWidth: t("fitWidth"),
    fitHeight: t("fitHeight"),
    singlePage: t("singlePage"),
    doublePageSpread: t("doublePageSpread"),
    canvasToolbar: t("canvasToolbar"),
    bold: t("bold"),
    italic: t("italic"),
    heading: t("heading"),
    link: t("link"),
    code: t("code"),
    blockquote: t("blockquote"),
    orderedList: t("orderedList"),
    unorderedList: t("unorderedList"),
    save: t("save"),
    load: t("load"),
    exportFile: t("exportFile"),
    importFile: t("importFile"),
    reset: t("reset"),
    resetConfigConfirm: t("resetConfigConfirm"),
    resetSectionConfirm: t("resetSectionConfirm"),
    resetMarkdownConfirm: t("resetMarkdownConfirm"),
  };

  return (
    <PostextSandbox
      initialMarkdown={initialMarkdown}
      labels={labels}
      locale={locale}
      themeToggle={<ThemeToggle />}
      languageSwitcher={<CompactLanguageSwitcher />}
      homeLink={
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
          style={{ color: "var(--gilt)", outlineColor: "var(--accent-blue)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--surface)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <span
            className="text-2xl font-black leading-none"
            style={{
              fontFamily:
                'var(--font-logo, var(--font-cormorant, "Cormorant Garamond", Georgia, serif))',
            }}
          >
            P
          </span>
        </Link>
      }
    />
  );
}

import type { Metadata } from "next";
import {
  Fraunces,
  Lora,
  JetBrains_Mono,
  Bricolage_Grotesque,
  Geist,
} from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { getMessages, setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CookieConsentProvider } from "@/components/gdpr/CookieConsentProvider";
import { CookieBanner } from "@/components/gdpr/CookieBanner";
import { ScriptFonts } from "@/components/fonts/ScriptFonts";
import { ScrollRegions } from "@/components/ui/ScrollRegions";
import { SiteWebMcp } from "@/components/webmcp/SiteWebMcp";
import { Analytics } from "@vercel/analytics/next";
import { cn } from "@/lib/utils";
import { SITE_NAME, SITE_URL, buildMetadata, localizedUrl } from "@/lib/seo";
import { PREPAINT_SCRIPT } from "@/components/cookbook/gallery/prepaint";
import { READING_PREPAINT_SCRIPT } from "@/components/reading/readingPrefs";
import "../globals.css";
import { htmlDir, htmlLang } from "@/i18n/locales";
import { version } from "postext/package.json";

// Only the faces of the first paint on most pages are preloaded: the UI
// sans and the reading serif. Preloading the display, head and mono faces
// too (~300 KB) made them race the render-blocking stylesheets on a slow
// connection; they swap in when the stylesheet asks for them.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  preload: false,
});

// No `wdth` axis: the site never sets font-stretch, and the axis took the
// Latin file from 77 KB to 131 KB.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
  preload: false,
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  preload: false,
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });

  const base = buildMetadata({
    locale,
    path: "",
    title: t("title"),
    description: t("description"),
    ogTitle: t("ogTitle"),
    ogDescription: t("ogDescription"),
    ogImageAlt: t("ogImageAlt"),
    keywords: t("keywords")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  });

  return {
    ...base,
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    authors: [{ name: "Postext contributors", url: SITE_URL }],
    creator: "Postext contributors",
    publisher: "Postext contributors",
    category: "technology",
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  // Client components get every namespace but the Sandbox's (three
  // quarters of the messages): the sandbox layout provides it to its page.
  // The docs' film titles are read on the server only.
  const clientMessages = Object.fromEntries(Object.entries(messages).filter(([ns]) => ns !== "Sandbox" && ns !== "YouTubeVideos"));
  const t = await getTranslations({ locale, namespace: "Metadata" });

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: htmlLang(locale),
      description: t("description"),
      potentialAction: {
        "@type": "SearchAction",
        // The Cookbook gallery is the one page that reads `?q=`.
        target: `${localizedUrl(locale, "/cookbook")}?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      softwareVersion: version,
      url: SITE_URL,
      inLanguage: htmlLang(locale),
      description: t("description"),
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      license: "https://opensource.org/licenses/MIT",
      codeRepository: "https://github.com/drnachio/postext",
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/apple-icon`,
      sameAs: ["https://github.com/drnachio/postext", "https://www.youtube.com/@Postext"],
    },
  ];

  return (
    <html
      lang={htmlLang(locale)}
      dir={htmlDir(locale)}
      suppressHydrationWarning
      className={cn(
        "dark h-full antialiased",
        geist.variable,
        fraunces.variable,
        bricolage.variable,
        lora.variable,
        jetbrainsMono.variable
      )}
    >
      <body className="min-h-full flex flex-col font-body">
        {/* The Cookbook gallery's filtered flag, before any of its book view
            paints. Here because the root layout never renders on the client. */}
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
        {/* Reading preferences and theme (WCAG 1.4.8), before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: READING_PREPAINT_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ScriptFonts locale={locale} />
        <NextIntlClientProvider messages={clientMessages}>
          {/* Base UI's tabs, selects and popovers read the direction from
              here (arrow keys, sides), not from the document. */}
          <DirectionProvider direction={htmlDir(locale)}>
          <ThemeProvider>
            <CookieConsentProvider>
              <a href="#main-content" className="skip-to-content">
                {messages.Accessibility &&
                typeof messages.Accessibility === "object" &&
                "skipToContent" in messages.Accessibility
                  ? (messages.Accessibility as Record<string, string>)
                      .skipToContent
                  : "Skip to main content"}
              </a>
              {children}
              <ScrollRegions />
              <SiteWebMcp />
              <CookieBanner />
            </CookieConsentProvider>
          </ThemeProvider>
          </DirectionProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}

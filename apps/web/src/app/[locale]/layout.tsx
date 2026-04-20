import type { Metadata } from "next";
import {
  Fraunces,
  Lora,
  JetBrains_Mono,
  Cormorant_Garamond,
  Geist,
} from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CookieConsentProvider } from "@/components/gdpr/CookieConsentProvider";
import { CookieBanner } from "@/components/gdpr/CookieBanner";
import { Analytics } from "@vercel/analytics/next";
import { cn } from "@/lib/utils";
import { SITE_NAME, SITE_URL, buildMetadata, localizedUrl } from "@/lib/seo";
import "../globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["700"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
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
  const t = await getTranslations({ locale, namespace: "Metadata" });

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: locale,
      description: t("description"),
      potentialAction: {
        "@type": "SearchAction",
        target: `${localizedUrl(locale, "/docs")}?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      inLanguage: locale,
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
      sameAs: ["https://github.com/drnachio/postext"],
    },
  ];

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(
        "dark h-full antialiased",
        geist.variable,
        fraunces.variable,
        cormorantGaramond.variable,
        lora.variable,
        jetbrainsMono.variable
      )}
    >
      <body className="min-h-full flex flex-col font-body">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <NextIntlClientProvider messages={messages}>
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
              <CookieBanner />
            </CookieConsentProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}

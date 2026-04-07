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

  return {
    title: t("title"),
    description: t("description"),
    metadataBase: new URL("https://postext.dev"),
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      type: "website",
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

  return (
    <html
      lang={locale}
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

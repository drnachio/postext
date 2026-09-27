import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Sandbox" });

  return buildMetadata({
    locale,
    path: "/sandbox",
    title: t("metaTitle"),
    description: t("metaDescription"),
    noindex: true,
    markdown: false,
  });
}

export default function SandboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The root layout leaves the Sandbox namespace out of the client
  // messages; this provider (every namespace, from the request config)
  // replaces them for the sandbox.
  return (
    <NextIntlClientProvider>
      <div className="h-screen w-screen overflow-hidden">
        {children}
      </div>
    </NextIntlClientProvider>
  );
}

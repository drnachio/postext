import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo";

// The sandbox follows the visible area as the browser bars come and go.
// Pinch zoom stays available (WCAG 1.4.4): iOS does not zoom in on a
// focused field because the sandbox sets its fields at 16px or more on
// touch screens, and the preview takes double taps through
// `touch-action: manipulation`.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

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
      <div className="h-dvh w-screen overflow-hidden">
        {children}
      </div>
    </NextIntlClientProvider>
  );
}

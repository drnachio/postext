import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo";

// The sandbox is an app with its own zoom controls: the page itself does
// not zoom, so iOS does not zoom in on every field that takes focus (it
// does below 16px text), a double tap reaches the preview instead of
// zooming, and the height follows the visible area as the browser bars
// come and go.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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

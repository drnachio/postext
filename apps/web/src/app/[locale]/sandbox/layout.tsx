import type { Metadata } from "next";
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
  });
}

export default function SandboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-screen overflow-hidden">
      {children}
    </div>
  );
}

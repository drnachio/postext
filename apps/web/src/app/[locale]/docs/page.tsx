import { redirect } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { getDocSlugsForLocale } from "@/lib/docs";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "DocsIndex" });
  return buildMetadata({
    locale,
    path: "/docs",
    title: t("metaTitle"),
    description: t("metaDescription"),
    ogTitle: t("ogTitle"),
    ogDescription: t("ogDescription"),
  });
}

export default async function DocsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const slugs = getDocSlugsForLocale(locale);

  if (slugs.length > 0) {
    redirect({ href: `/docs/${slugs[0]}`, locale });
  }

  return (
    <main className="flex-1 py-12 text-center">
      <p className="text-slate">No documentation available yet.</p>
    </main>
  );
}

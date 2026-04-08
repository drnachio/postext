import { redirect } from "@/i18n/navigation";
import { setRequestLocale } from "next-intl/server";
import { getDocSlugsForLocale } from "@/lib/docs";

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

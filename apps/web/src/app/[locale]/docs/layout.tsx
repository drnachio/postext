import { setRequestLocale } from "next-intl/server";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { DocsShell } from "@/components/docs/DocsShell";
import { getAllDocs } from "@/lib/docs";

export default async function DocsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const docs = getAllDocs();

  return (
    <div className="max-w-[100vw]" style={{ overflowX: 'clip' }}>
      <Navbar />
      <DocsShell>
        <DocsSidebar docs={docs} />
        {children}
      </DocsShell>
      <Footer />
    </div>
  );
}

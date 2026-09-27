import { setRequestLocale } from "next-intl/server";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import "@/components/cookbook/cookbook.css";

export default async function CookbookLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="max-w-[100vw]" style={{ overflowX: "clip" }}>
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}

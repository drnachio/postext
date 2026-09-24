import { setRequestLocale } from "next-intl/server";
import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { AboutSection } from "@/components/landing/AboutSection";
import { FiguresSection } from "@/components/landing/FiguresSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { QuoteSection } from "@/components/landing/QuoteSection";
import { ShowcaseSection } from "@/components/landing/ShowcaseSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { BundleSection } from "@/components/landing/BundleSection";
import { InstallSection } from "@/components/landing/InstallSection";
import { Footer } from "@/components/landing/Footer";

/** The landing reads like the guide: a cover, four chapters on their part
 *  colours (blue, gilt, vermilion) with a figures box, a pull quote and a
 *  shelf of books set by Postext between them, and a back cover. */
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Navbar />
      <main id="main-content" role="main">
        <HeroSection />
        <AboutSection />
        <FiguresSection />
        <div className="h-14 md:h-20" aria-hidden="true" />
        <FeaturesSection />
        <QuoteSection />
        <ShowcaseSection />
        <HowItWorksSection />
        <BundleSection />
        <InstallSection />
      </main>
      <Footer />
    </>
  );
}

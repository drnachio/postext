import { setRequestLocale } from "next-intl/server";
import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/sections/HeroSection";
import { InShortSection } from "@/components/landing/sections/InShortSection";
import { ShowreelSection } from "@/components/landing/sections/ShowreelSection";
import { AboutSection } from "@/components/landing/sections/AboutSection";
import { FiguresSection } from "@/components/landing/sections/FiguresSection";
import { FeaturesSection } from "@/components/landing/sections/FeaturesSection";
import { QuoteSection } from "@/components/landing/sections/QuoteSection";
import { ShowcaseSection } from "@/components/landing/sections/ShowcaseSection";
import { HowItWorksSection } from "@/components/landing/sections/HowItWorksSection";
import { BundleSection } from "@/components/landing/sections/BundleSection";
import { InstallSection } from "@/components/landing/sections/InstallSection";
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
      <main id="main-content" tabIndex={-1} role="main">
        <HeroSection />
        {/* The page in plain words (WCAG 3.1.5), under the cover. */}
        <InShortSection />
        <ShowreelSection />
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

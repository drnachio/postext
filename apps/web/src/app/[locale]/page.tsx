import { setRequestLocale } from "next-intl/server";
import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { AboutSection } from "@/components/landing/AboutSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { ApiPreviewSection } from "@/components/landing/ApiPreviewSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { InstallSection } from "@/components/landing/InstallSection";
import { SectionDivider } from "@/components/landing/SectionDivider";
import { Footer } from "@/components/landing/Footer";

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
        <SectionDivider />
        <AboutSection />
        <SectionDivider />
        <FeaturesSection />
        <SectionDivider />
        <ApiPreviewSection />
        <SectionDivider />
        <HowItWorksSection />
        <SectionDivider />
        <InstallSection />
      </main>
      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import { Fraunces, Lora, JetBrains_Mono, Cormorant_Garamond, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-geist'});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["700"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Postext — Programmable Typesetter for the Web",
  description:
    "A layout engine that bridges centuries-old print typesetting craft with modern web technology. Semantic markdown in, publication-grade React components out.",
  metadataBase: new URL("https://postext.dev"),
  openGraph: {
    title: "Postext — Programmable Typesetter for the Web",
    description:
      "Semantic markdown in, publication-grade React components out.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased", geist.variable, fraunces.variable, cormorantGaramond.variable, lora.variable, jetbrainsMono.variable)}
    >
      <body className="min-h-full flex flex-col font-body">
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}

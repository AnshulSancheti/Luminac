import type { Metadata } from "next";
import { Inter, Outfit, Tinos } from "next/font/google";
import type { ReactNode } from "react";

import { MotionProvider } from "@/components/motion/motion-provider";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const tinos = Tinos({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-tinos",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Luminac | Architectural Lighting for Considered Spaces",
  description:
    "Premium indoor and outdoor luminaires for spaces that demand atmosphere, precision and lasting performance.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} ${tinos.variable}`}>
      <body>
        <MotionProvider>{children}</MotionProvider>
        <noscript>
          <style>{`.motion-reveal,.hero-content>*{opacity:1!important;transform:none!important}`}</style>
        </noscript>
      </body>
    </html>
  );
}

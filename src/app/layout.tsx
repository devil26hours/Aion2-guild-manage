import type { Metadata } from "next";
import { Suspense } from "react";
import { Cinzel, Geist, Geist_Mono, Noto_Sans_Thai, Sora } from "next/font/google";
import { CookieNotice } from "@/components/cookies/cookie-notice";
import { ThemeSync } from "@/components/theme/theme-sync";
import { THEME_INIT_SCRIPT } from "@/lib/theme/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

// Thai glyphs only; Latin text keeps Geist / Sora / Cinzel (see --font-sans).
const notoSansThai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai"],
  // Not preloaded: most visitors start in English, the browser fetches it
  // on demand once Thai text appears.
  preload: false,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "ChumChon AION2",
  description:
    "ชุมชนผู้เล่น AION2 · AION2 Player Community — Private guild management system for AION 2 Global. Guild roster, equipment inspection, combat power and dungeon party organisation.",
  icons: {
    icon: "/image/logo/logo_png.png",
    apple: "/image/logo/logo_png.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${sora.variable} ${notoSansThai.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeSync />
        {children}
        <Suspense fallback={null}>
          <CookieNotice />
        </Suspense>
      </body>
    </html>
  );
}

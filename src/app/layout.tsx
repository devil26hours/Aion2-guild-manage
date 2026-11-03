import type { Metadata } from "next";
import { Cinzel, Geist, Geist_Mono, Noto_Sans_Thai } from "next/font/google";
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

// Thai glyphs only; Latin text keeps Geist / Cinzel (see --font-sans).
const notoSansThai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai"],
  // Not preloaded: most visitors start in English, the browser fetches it
  // on demand once Thai text appears.
  preload: false,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "AION II — Guild Command",
  description:
    "Private guild management system for AION 2 Global. Guild roster, equipment inspection, combat power and dungeon party organisation.",
  icons: {
    icon: "/image/logo/logo_png.png",
    apple: "/image/logo/logo_png.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} ${notoSansThai.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

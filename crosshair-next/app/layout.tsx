import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Self-hosted at build time by next/font. Loading these from fonts.googleapis.com
 * cost two extra DNS + TLS round trips before any text could paint; served from
 * our own origin they arrive with the page. `display: swap` plus the fallback
 * metrics below mean text is readable immediately and does not jump when the
 * real font lands.
 */
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-figtree",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
  adjustFontFallback: true,
});

// Bricolage Grotesque is a multi-axis variable font (opsz, wdth, wght), so it
// is loaded as a variable range rather than a fixed weight list.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
  fallback: ["system-ui", "sans-serif"],
  adjustFontFallback: true,
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-jetbrains",
  fallback: ["ui-monospace", "Menlo", "monospace"],
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: "Crosshair",
  description: "An AI sales agent that knows when not to send. Don't email more. Email right.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${bricolage.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}

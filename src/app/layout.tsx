import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { getLang } from "@/lib/i18n/server";
import { LanguageProvider } from "@/lib/i18n/provider";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Deedar Drive",
  description: "Field Sales & Distribution Platform",
};

/**
 * `viewportFit: "cover"` is what makes `env(safe-area-inset-*)` return real
 * values on notched iPhones — without it those insets are always 0 and the
 * mobile bottom nav sits under the home indicator. `themeColor` tints the
 * Android Chrome address bar. Pinch-zoom is deliberately left enabled (no
 * `maximumScale`), since blocking it fails WCAG 1.4.4.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#7ca081",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    // suppressHydrationWarning: the inline script below sets `data-theme` on
    // <html> before React hydrates, so this element's attributes intentionally
    // differ between server and client. The flag is scoped to just <html> (one
    // level deep) — it does NOT hide mismatches anywhere else in the tree.
    <html
      lang={lang}
      className={`${manrope.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme BEFORE first paint, so a dark-mode user
            never sees a white flash on load. Must stay inline and synchronous;
            `useTheme()` then reads this attribute as its source of truth. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('deedar_theme')==='dark'){document.documentElement.dataset.theme='dark'}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <LanguageProvider lang={lang}>{children}</LanguageProvider>
      </body>
    </html>
  );
}

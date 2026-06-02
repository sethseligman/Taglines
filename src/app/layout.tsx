import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { DM_Sans, Geist_Mono, Playfair_Display } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  adjustFontFallback: true,
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: "Taglines — Guess the movie from its tagline",
  description:
    "A daily movie trivia game. See a classic tagline and guess the film. Five chances. Hints that escalate. How well do you know your movies?",
  metadataBase: new URL("https://www.taglines.app"),
  openGraph: {
    title: "Taglines — Guess the movie from its tagline",
    description:
      "A daily movie trivia game. See a classic tagline and guess the film. Five chances. Hints that escalate. How well do you know your movies?",
    url: "https://www.taglines.app",
    siteName: "Taglines",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Taglines — Guess the movie from its tagline",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Taglines — Guess the movie from its tagline",
    description:
      "A daily movie trivia game. See a classic tagline and guess the film. Five chances. Hints that escalate. How well do you know your movies?",
    images: ["/og-image.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistMono.variable} ${playfair.variable} ${dmSans.variable}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <AppShell>{children}</AppShell>
        <Analytics />
      </body>
    </html>
  );
}

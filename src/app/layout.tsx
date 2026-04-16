import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400;1,700&family=DM+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}

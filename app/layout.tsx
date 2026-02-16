import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "wtf did they say?",
  description: "Breaking down what they actually meant.",
  icons: {
    icon: "/favicon.png?v=2",
    shortcut: "/favicon.png?v=2",
    apple: "/favicon.png?v=2",
  },
  openGraph: {
    title: "wtf did they say?",
    description: "We decode nonsense.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "wtf did they say? — we decode nonsense",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "wtf did they say?",
    description: "We decode nonsense.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

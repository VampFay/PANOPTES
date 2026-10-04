import type { Metadata } from "next";
import { Instrument_Serif, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: "PANOPTES — Survivable Security for LLM Agents",
  description:
    "The Observatory of Argus: an interactive companion to the PANOPTES whitepaper. What OpenAPPA (arXiv:2607.24625) actually proves, where airtight leaks, and a nine-organ architecture for survivable agent security — with live simulations of the label lattice, the monotone ratchet, counterfactual noninterference adjudication, canary immunology, and adversary economics.",
  keywords: [
    "PANOPTES",
    "OpenAPPA",
    "APPA",
    "LLM agent security",
    "information-flow control",
    "counterfactual noninterference",
    "prompt injection",
    "guardrails",
  ],
  authors: [{ name: "PANOPTES Research Session" }],
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/panoptes-mark.svg", type: "image/svg+xml", sizes: "any" },
    ],
  },
  openGraph: {
    title: "PANOPTES — The Observatory of Argus",
    description:
      "The algebra, the flaws, the five walls, and nine organs — every mechanism explained by a live simulation you can run.",
    siteName: "PANOPTES",
    type: "website",
    images: [{ url: "/brand/panoptes-mark.svg", width: 512, height: 512, alt: "The PANOPTES emblem — the Argus instrument" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${instrumentSerif.variable} ${spaceGrotesk.variable} ${plexMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Within — private file conversion",
  description:
    "Convert files entirely on your device with bounded memory and direct-to-disk output.",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    title: "Within — private file conversion",
    description: "Big files. Small memory. Private, on-device file conversion.",
    images: [
      {
        url: "https://within-file-converter.lxjsnbc.chatgpt.site/og.png",
        width: 1536,
        height: 1024,
        alt: "Within — Big files. Small memory.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Within — private file conversion",
    description: "Big files. Small memory. Private, on-device file conversion.",
    images: [
      "https://within-file-converter.lxjsnbc.chatgpt.site/og.png",
    ],
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

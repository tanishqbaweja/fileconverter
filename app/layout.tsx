import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Within — private file conversion",
  description:
    "Convert files entirely on your device with bounded memory and direct-to-disk output.",
  manifest: "/manifest.webmanifest",
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

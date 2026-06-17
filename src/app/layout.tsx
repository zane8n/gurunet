import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "GURUnet",
  title: "GURUnet",
  description:
    "A personal network engineering discipline platform for daily challenges, grading, penalties, and technical growth.",
  authors: [{ name: "Kikandi" }],
  creator: "Kikandi",
  publisher: "Kikandi",
  icons: {
    icon: [
      { url: "/favicon.ico?v=4" },
      { url: "/favicon-16x16.png?v=4", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png?v=4", sizes: "32x32", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico?v=4" }],
    apple: [{ url: "/gurunet.png?v=4", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased font-sans">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

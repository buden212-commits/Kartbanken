import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { SessionProvider } from "next-auth/react";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/app-header";
import { PwaProvider } from "@/components/pwa-provider";
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
  title: "kartor.ifkmora.se",
  description: "Versionshantering och OCD-jämförelse för orienteringskartor",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Kartportalen",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#004c88",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isMapViewer = /\/maps\/[^/]+\/versions\/[^/]+\/viewer/.test(pathname);

  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className={`${isMapViewer ? "h-full" : "flex min-h-full flex-col"} bg-background text-slate-900`}
      >
        <SessionProvider>
          <PwaProvider />
          {!isMapViewer && <AppHeader />}
          <main className={isMapViewer ? "h-full" : "flex-1"}>{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}

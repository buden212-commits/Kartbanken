import type { Metadata } from "next";
import { headers } from "next/headers";
import { SessionProvider } from "next-auth/react";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/app-header";
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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isMapViewer = /\/maps\/[^/]+\/versions\/[^/]+\/viewer/.test(pathname);
  const isProductSheet = pathname === "/produkt" || pathname.startsWith("/produkt/");
  const hideChrome = isMapViewer || isProductSheet;

  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className={`${hideChrome ? "h-full" : "flex min-h-full flex-col"} bg-background text-slate-900`}
      >
        <SessionProvider>
          {!hideChrome && <AppHeader />}
          <main className={hideChrome ? "h-full" : "flex-1"}>{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LeaseLens",
  description: "Maintenance requests and lease answers for Capitol Residential Partners.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render every page per request so Next.js can add this request's CSP nonce to its scripts
  // (see proxy.ts). A page built ahead of time would carry no nonce and its scripts would be blocked.
  await connection();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

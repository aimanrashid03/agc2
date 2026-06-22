import type { Metadata } from "next";
import { Public_Sans, Source_Sans_3 } from "next/font/google";
import AppShell from "@/components/layout/AppShell";
import Providers from "@/components/providers/Providers";
import { auth } from "@/auth";
import { getChatbotSettings } from "@/lib/chatbotSettings";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AGC Law Case Viewer",
  description: "Attorney General Chambers Law Case Viewer",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [session, chatbotSettings] = await Promise.all([auth(), getChatbotSettings()]);

  return (
    <html lang="ms">
      <body
        className={`${publicSans.variable} ${sourceSans.variable} antialiased font-sans bg-gray-50 text-gray-900`}
      >
        <Providers session={session}>
          <AppShell chatbotSettings={chatbotSettings}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}

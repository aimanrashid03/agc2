import type { Metadata } from "next";
import { Public_Sans, Source_Sans_3 } from "next/font/google";
import Sidebar from "@/components/layout/Sidebar";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ms">
      <body
        className={`${publicSans.variable} ${sourceSans.variable} antialiased font-sans bg-gray-50 text-gray-900`}
      >
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-4">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

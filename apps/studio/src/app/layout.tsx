import type { Metadata } from "next";
import {
  IBM_Plex_Mono,
  Manrope,
  Noto_Sans_SC,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
});

const notoSansSc = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cjk",
});

export const metadata: Metadata = {
  title: "行业研究生产台",
  description: "Industry Research Product Line",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${spaceGrotesk.variable} ${manrope.variable} ${ibmPlexMono.variable} ${notoSansSc.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}

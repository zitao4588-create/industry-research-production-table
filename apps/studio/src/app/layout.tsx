import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

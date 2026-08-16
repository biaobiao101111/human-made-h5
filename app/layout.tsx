import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "含人量检测 · Human Made",
  description: "粘贴一段文字，看看里面有多少属于你。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "供应商合同工作台",
  description: "AI 原生的供应商合同自动化工作台",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
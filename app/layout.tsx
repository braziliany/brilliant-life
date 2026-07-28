import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "@fontsource/lxgw-wenkai/500.css";
import { PwaRegistration } from "./pwa-registration";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "璀璨人生",
  description: "集中掌握健康数据、工作日历、工资与生活目标。",
  applicationName: "璀璨人生",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "璀璨人生",
  },
  openGraph: {
    title: "璀璨人生",
    description: "健康 · 工作 · 收入 · 生活",
    url: "https://pulse.sophier.org",
    siteName: "璀璨人生",
    locale: "zh_CN",
    type: "website",
    images: [{ url: "https://pulse.sophier.org/og.png", width: 1536, height: 1024, alt: "璀璨人生" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "璀璨人生",
    description: "健康 · 工作 · 收入 · 生活",
    images: ["https://pulse.sophier.org/og.png"],
  },
  icons: {
    icon: [{ url: "/pulse-icon.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f1e9",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={geist.variable}>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}

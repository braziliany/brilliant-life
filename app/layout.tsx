import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "璀璨人生 · 健康、工作与生活仪表盘",
  description: "集中掌握健康数据、工作日历、工资与生活目标。",
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={geist.variable}>{children}</body></html>;
}

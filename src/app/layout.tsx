import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Cormorant_Garamond, Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import "@/styles/global.css";
import InstallGuidance from "@/components/pwa/install-guidance";
import ServiceWorkerRegistration from "@/components/pwa/service-worker-registration";

const latin = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["italic"],
  display: "swap",
  variable: "--font-cormorant-garamond",
});

const serif = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  preload: false,
  variable: "--font-noto-serif-sc",
});

const sans = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
  variable: "--font-noto-sans-sc",
});

export const metadata: Metadata = {
  title: "AI Wardrobe",
  description: "穿你所有，爱你所穿",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F2EEE8",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className={`${latin.variable} ${serif.variable} ${sans.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegistration />
        <InstallGuidance />
      </body>
    </html>
  );
}

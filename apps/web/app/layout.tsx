import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import { Providers } from "@/components/providers";
import { brand, brandTitle } from "@/lib/brand";
import "./globals.css";

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-tajawal",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(brand.siteUrl),
  title: {
    default: brandTitle(),
    template: `%s · ${brand.nameAr}`,
  },
  description: brand.description,
  applicationName: brand.nameAr,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: brand.nameAr,
    description: brand.taglineAr,
    siteName: brand.nameAr,
    locale: "ar_SA",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning className={tajawal.variable}>
      <body className={tajawal.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

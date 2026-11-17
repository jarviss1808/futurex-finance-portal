import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./portal.css";
import "./workflow.css";
import "./admin.css";
import "./branding.css";
import "./app.css";

export const metadata: Metadata = {
  title: { default: "Futurex Sales & Collections", template: "%s · Futurex" },
  description: "Private PI, payment approval, reminder and reporting portal for Futurex Trade Fair and Events Private Limited",
  applicationName: "Futurex Sales & Collections",
  appleWebApp: { capable: true, title: "Futurex", statusBarStyle: "default" },
  icons: { icon: [{ url: "/favicon.ico" }, { url: "/branding/app-icon-192.png", type: "image/png", sizes: "192x192" }], apple: "/branding/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0d1848", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

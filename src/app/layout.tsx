import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AirtimeScan",
  description: "Scan a recharge card and top up automatically using OCR.",
  applicationName: "AirtimeScan",
  appleWebApp: { capable: true, title: "AirtimeScan" },
};
export const viewport: Viewport = { themeColor: "#0b1220" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

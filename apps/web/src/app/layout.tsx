import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTA Transit",
  description: "GTA transit map and departures",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

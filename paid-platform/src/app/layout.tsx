import type { Metadata } from "next";
import { AppPreferences } from "@/components/AppPreferences";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "MTG Opening Hand Pro",
  description: "A paid-product foundation for competitive Magic opening-hand analysis."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppPreferences />
        <div className="app-background" />
        <main className="app-shell">
          <AppNav />
          {children}
        </main>
      </body>
    </html>
  );
}

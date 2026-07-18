import type { Metadata } from "next";
import { AppPreferences } from "@/components/AppPreferences";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opening Edge",
  description: "Competitive Magic opening-hand analysis, deck context, and metagame tools.",
  icons: {
    icon: "/opening-edge-favicon.png",
    shortcut: "/opening-edge-favicon.png",
    apple: "/opening-edge-favicon.png"
  }
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

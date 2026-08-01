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
          <footer className="app-footer">
            <span>
              Please consider supporting us on{" "}
              <a href="https://www.patreon.com/cw/OpeningEdgeMTG" rel="noopener noreferrer" target="_blank">
                Patreon
              </a>
              .
            </span>
            <span>BTC: bc1qjkcf58y4c80043asa97uxylwn8h8g0mu57khz5</span>
            <span>
              <a href="/bug-report">Bug Report</a>
            </span>
          </footer>
        </main>
      </body>
    </html>
  );
}

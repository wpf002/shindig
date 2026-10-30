import type { Metadata } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";

const display = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-display",
});
const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Shindig — Your Board, Booked",
  description: "Connect a Pinterest board. Shindig reads the look and finds DFW vendors who already work that way.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}

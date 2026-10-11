import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import PersistBanner from "@/components/PersistBanner";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/components/ThemeProvider";
import { DataProvider } from "@/lib/data-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "Ranksport | Intelligence Merchandising",
  description: "Advanced Retail Data Science for Footwear",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${inter.variable} ${outfit.variable}`}>
        <ThemeProvider>
          <DataProvider>
            <div className="app-container">
              <Sidebar />
              <main className="main-content">
                <Topbar />
                <div className="page-wrapper animate-fade-in">
                  <PersistBanner />
                  {children}
                </div>
              </main>
            </div>
          </DataProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

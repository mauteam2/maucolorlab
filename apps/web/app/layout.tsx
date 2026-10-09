import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./salon.css";
import "./crm.css";
import "./salon-operations.css";
import "./stock.css";
import "./finance.css";

export const metadata: Metadata = {
  title: {
    default: "ELIFORA",
    template: "%s · ELIFORA",
  },
  description: "Professional color intelligence and salon operations.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}


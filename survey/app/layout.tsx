import "../styles/globals.css";
import type { ReactNode } from "react";
import ThemeScript from "@/components/ThemeScript";

export const metadata = {
  title: "LalGeo Cloud",
  description: "Build and share LalGeo surveys",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}

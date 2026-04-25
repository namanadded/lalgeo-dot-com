import type { ReactNode } from "react";

export const metadata = {
  title: "LalGeo Maps",
  description: "Create, import, edit, and share LalGeo map projects.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

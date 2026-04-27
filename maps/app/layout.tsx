import type { ReactNode } from "react";

export const metadata = {
  title: "LalGeo Maps",
  description: "Create, import, edit, and share LalGeo map projects.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ margin: 0, width: "100%", height: "100%", overflow: "hidden" }}>
      <body style={{ margin: 0, width: "100%", height: "100%", overflow: "hidden" }}>{children}</body>
    </html>
  );
}

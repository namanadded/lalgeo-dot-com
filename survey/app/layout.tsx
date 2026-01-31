import "../styles/globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "LalGeo Survey Cloud",
  description: "Build and share LalGeo surveys",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}

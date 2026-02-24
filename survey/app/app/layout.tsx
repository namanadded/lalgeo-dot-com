import type { ReactNode } from "react";
import AppSidebar from "@/components/AppSidebar";

export default function SaaSLayout({ children }: { children: ReactNode }) {
  return (
    <main className="saas-shell">
      <div className="saas-frame">
        <AppSidebar />
        <section className="saas-content">{children}</section>
      </div>
    </main>
  );
}

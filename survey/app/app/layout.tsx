import type { ReactNode } from "react";
import AppSidebar from "@/components/AppSidebar";
import SaasTopbar from "@/components/SaasTopbar";

export const dynamic = "force-dynamic";

export default function SaaSLayout({ children }: { children: ReactNode }) {
  return (
    <main className="saas-shell">
      <div className="saas-frame">
        <AppSidebar />
        <section className="saas-content">
          <SaasTopbar />
          {children}
        </section>
      </div>
    </main>
  );
}

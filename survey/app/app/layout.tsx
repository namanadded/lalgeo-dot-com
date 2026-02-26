import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import SaasTopbar from "@/components/SaasTopbar";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SaaSLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

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

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import GlobalSearch from "@/components/GlobalSearch";

export default function SaasTopbar() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="saas-topbar">
      <GlobalSearch />
      <button type="button" className="button secondary" onClick={signOut} disabled={loading}>
        {loading ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}

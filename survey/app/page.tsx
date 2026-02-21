"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const decide = async () => {
      const status = await fetch("/survey/api/auth/status");
      const { hasUsers } = await status.json();
      const me = await fetch("/survey/api/me");
      if (me.ok) {
        router.replace("/dashboard");
        return;
      }
      router.replace(hasUsers ? "/login" : "/setup");
    };
    decide();
  }, [router]);

  return (
    <main>
      <div className="container">
        <div className="panel">
          <h1 className="brand-title">LalGeo Survey Cloud</h1>
          <p className="muted">Loading…</p>
        </div>
      </div>
    </main>
  );
}

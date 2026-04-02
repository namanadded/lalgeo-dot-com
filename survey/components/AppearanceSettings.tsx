"use client";

import dynamic from "next/dynamic";

const ThemeToggle = dynamic(() => import("@/components/ThemeToggle"), {
  ssr: false,
});

export default function AppearanceSettings() {
  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ margin: 0, fontSize: 22 }}>Appearance</h2>
      <p className="muted">Choose how the cloud workspace looks while you work.</p>
      <ThemeToggle />
    </div>
  );
}

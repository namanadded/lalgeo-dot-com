"use client";

import { useEffect } from "react";

export default function MobileViewportGuard() {
  useEffect(() => {
    const preventPageScale = (event: Event) => event.preventDefault();
    const options: AddEventListenerOptions = { passive: false };

    document.addEventListener("gesturestart", preventPageScale, options);
    document.addEventListener("gesturechange", preventPageScale, options);

    return () => {
      document.removeEventListener("gesturestart", preventPageScale);
      document.removeEventListener("gesturechange", preventPageScale);
    };
  }, []);

  return null;
}

"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    mapkit?: any;
  }
}

function mapkitTokenForHost(hostname: string) {
  const override = (process.env.NEXT_PUBLIC_MAPKIT_TOKEN || "").trim();
  if (override) return override;
  return hostname.includes("lalgeo.ca")
    ? "eyJraWQiOiJaNTM3TTc2Qk1RIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJKOTU2Mkw2TFE2IiwiaWF0IjoxNzQ3MDk1MzUwLCJvcmlnaW4iOiJsYWxnZW8uY2EifQ.lFsIe9182uBOQ_q2hW1JspNpieuttywt7TgL7GzzcOOCqTDi32Fd59waM4wZnUqys0xLt3Bh_hpK-OHZH6ocoA"
    : "eyJraWQiOiIzOVBKMjNNODVRIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJKOTU2Mkw2TFE2IiwiaWF0IjoxNzQ3MDk1MzUwLCJvcmlnaW4iOiJsYWxnZW8uY29tIn0.CIkZ1wlCStvy0oTTeH4AVBc5EigAa6JFFdFh5bjd7iMOOnVnJ_T4ZDplj5YtL4pxooL1iGYngNz9gAKP4VKgbw";
}

export function AppleAddressPreview({ address, name }: { address: string; name: string }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!address.trim()) return;
      if (!window.mapkit) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector('script[src*="cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"]');
          if (existing) {
            if (window.mapkit) resolve();
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error("MapKit script load failed")), { once: true });
            return;
          }
          const script = document.createElement("script");
          script.src = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("MapKit script load failed"));
          document.head.appendChild(script);
        });
      }
      if (!mapRef.current || !window.mapkit || cancelled) return;

      const token = mapkitTokenForHost(window.location.hostname);
      window.mapkit.init({
        authorizationCallback: (done: (token: string) => void) => done(token),
      });

      const mapkit = window.mapkit;
      const map = new mapkit.Map(mapRef.current, {
        colorScheme: mapkit.Map.ColorSchemes.Light,
        showsCompass: mapkit.FeatureVisibility.Hidden,
        isRotationEnabled: false,
      });
      map.region = new mapkit.CoordinateRegion(
        new mapkit.Coordinate(51.0447, -114.0719),
        new mapkit.CoordinateSpan(0.12, 0.12),
      );

      const search = new mapkit.Search({ region: map.region });
      search.search(address, (searchError: unknown, data: any) => {
        if (searchError || !data?.places?.length) {
          setError(true);
          return;
        }
        const place = data.places[0];
        if (!place?.coordinate) {
          setError(true);
          return;
        }
        const pin = new mapkit.MarkerAnnotation(place.coordinate, {
          title: name || "Client",
          subtitle: place.formattedAddress || "",
          color: "#0a6fff",
        });
        map.addAnnotation(pin);
        map.region = new mapkit.CoordinateRegion(place.coordinate, new mapkit.CoordinateSpan(0.01, 0.01));
        setReady(true);
      });
    }

    boot().catch(() => setError(true));
    return () => {
      cancelled = true;
    };
  }, [address, name]);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <strong>Map Preview</strong>
      <p className="muted">Pinned to the client address.</p>
      <div className="map-preview-wrap">
        <div ref={mapRef} className="map-preview-canvas" />
        {!ready && !error ? <div className="map-preview-overlay">Locating address…</div> : null}
        {error ? <div className="map-preview-overlay">Could not load map preview for this address.</div> : null}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    mapkit?: any;
  }
}

type AddressValues = {
  addressLine1: string;
  addressLine2: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
};

function normalizeCountry(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper === "CA") return "Canada";
  if (upper === "US" || upper === "USA") return "United States";
  return raw;
}

function parseFormattedAddress(rawAddress: string) {
  const raw = String(rawAddress || "").trim();
  if (!raw) {
    return {
      addressLine1: "",
      city: "",
      stateProvince: "",
      postalCode: "",
      country: "",
    };
  }

  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  const addressLine1 = parts[0] || "";
  const country = normalizeCountry(parts[parts.length - 1] || "");

  let city = "";
  let stateProvince = "";
  let postalCode = "";

  // Typical formats:
  // 1) "39 Wolf Hollow Way SE, Calgary AB T2X 0P9, Canada"
  // 2) "39 Wolf Hollow Way SE, Calgary, AB T2X 0P9, Canada"
  // 3) "123 Main St, Seattle, WA 98101, United States"
  if (parts.length >= 3) {
    const beforeCountry = parts.slice(1, parts.length - 1);
    if (beforeCountry.length === 1) {
      const one = beforeCountry[0];
      const caMatch = one.match(/^(.+?)\s+([A-Z]{2})\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i);
      const usMatch = one.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
      if (caMatch) {
        city = caMatch[1].trim();
        stateProvince = caMatch[2].trim();
        postalCode = caMatch[3].toUpperCase().replace(/\s?(\d[A-Z]\d)$/i, " $1");
      } else if (usMatch) {
        city = usMatch[1].trim();
        stateProvince = usMatch[2].trim();
        postalCode = usMatch[3].trim();
      } else {
        city = one;
      }
    } else {
      city = beforeCountry[0] || "";
      const regionLine = beforeCountry.slice(1).join(" ");
      const caTail = regionLine.match(/([A-Z]{2})\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i);
      const usTail = regionLine.match(/([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
      if (caTail) {
        stateProvince = caTail[1].trim();
        postalCode = caTail[2].toUpperCase().replace(/\s?(\d[A-Z]\d)$/i, " $1");
      } else if (usTail) {
        stateProvince = usTail[1].trim();
        postalCode = usTail[2].trim();
      } else {
        stateProvince = regionLine;
      }
    }
  }

  return {
    addressLine1,
    city,
    stateProvince,
    postalCode,
    country,
  };
}

function mapkitTokenForHost(hostname: string) {
  const override = (process.env.NEXT_PUBLIC_MAPKIT_TOKEN || "").trim();
  if (override) return override;
  return hostname.includes("lalgeo.ca")
    ? "eyJraWQiOiJaNTM3TTc2Qk1RIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJKOTU2Mkw2TFE2IiwiaWF0IjoxNzQ3MDk1MzUwLCJvcmlnaW4iOiJsYWxnZW8uY2EifQ.lFsIe9182uBOQ_q2hW1JspNpieuttywt7TgL7GzzcOOCqTDi32Fd59waM4wZnUqys0xLt3Bh_hpK-OHZH6ocoA"
    : "eyJraWQiOiIzOVBKMjNNODVRIiwidHlwIjoiSldUIiwiYWxnIjoiRVMyNTYifQ.eyJpc3MiOiJKOTU2Mkw2TFE2IiwiaWF0IjoxNzQ3MDk1MzUwLCJvcmlnaW4iOiJsYWxnZW8uY29tIn0.CIkZ1wlCStvy0oTTeH4AVBc5EigAa6JFFdFh5bjd7iMOOnVnJ_T4ZDplj5YtL4pxooL1iGYngNz9gAKP4VKgbw";
}

function parseAddress(place: any): AddressValues {
  const formattedFallback = parseFormattedAddress(place?.formattedAddress || "");
  const countryFromDisplay = normalizeCountry(String(place?.address?.country || ""));
  const countryFromCode = normalizeCountry(String(place?.countryCode || ""));
  const subThoroughfare = String(place?.address?.subThoroughfare || place?.subThoroughfare || "").trim();
  const thoroughfare = String(place?.address?.thoroughfare || place?.thoroughfare || "").trim();
  const composedStreet = [subThoroughfare, thoroughfare].filter(Boolean).join(" ").trim();

  const line1 = String(
    place?.address?.street ||
      composedStreet ||
      place?.name ||
      formattedFallback.addressLine1 ||
      "",
  ).trim();

  const city = String(
    place?.address?.locality ||
      place?.locality ||
      formattedFallback.city ||
      "",
  ).trim();

  const stateProvince = String(
    place?.address?.administrativeArea ||
      place?.administrativeArea ||
      formattedFallback.stateProvince ||
      "",
  ).trim();

  const postalCode = String(
    place?.address?.postalCode ||
      place?.postalCode ||
      formattedFallback.postalCode ||
      "",
  ).trim();

  const country = countryFromDisplay || countryFromCode || formattedFallback.country || "Canada";

  const line2 = String(place?.address?.subLocality || place?.subLocality || "").trim();

  return {
    addressLine1: line1,
    addressLine2: line2,
    city,
    stateProvince,
    postalCode,
    country,
  };
}

export function AppleAddressMapField() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObjRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const searchRef = useRef<any>(null);
  const debounceRef = useRef<number | null>(null);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [ready, setReady] = useState(false);
  const [values, setValues] = useState<AddressValues>({
    addressLine1: "",
    addressLine2: "",
    city: "",
    stateProvince: "",
    postalCode: "",
    country: "Canada",
  });

  const fullAddress = useMemo(
    () =>
      [
        values.addressLine1,
        values.addressLine2,
        [values.city, values.stateProvince, values.postalCode].filter(Boolean).join(", "),
        values.country,
      ]
        .filter(Boolean)
        .join(", "),
    [values],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
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

      if (cancelled || !window.mapkit || !mapRef.current) return;

      const token = mapkitTokenForHost(window.location.hostname);
      window.mapkit.init({
        authorizationCallback: (done: (token: string) => void) => done(token),
      });

      const mapkit = window.mapkit;
      const map = new mapkit.Map(mapRef.current, {
        colorScheme: mapkit.Map.ColorSchemes.Light,
        showsCompass: mapkit.FeatureVisibility.Hidden,
        isRotationEnabled: false,
        isZoomEnabled: true,
      });
      map.region = new mapkit.CoordinateRegion(
        new mapkit.Coordinate(51.0447, -114.0719),
        new mapkit.CoordinateSpan(0.15, 0.15),
      );

      mapObjRef.current = map;
      searchRef.current = new mapkit.Search({ region: map.region });
      setReady(true);
    }

    boot().catch(() => {
      setReady(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const setMapPin = (place: any) => {
    const mapkit = window.mapkit;
    const map = mapObjRef.current;
    if (!mapkit || !map || !place?.coordinate) return;

    if (markerRef.current) {
      map.removeAnnotation(markerRef.current);
    }

    const annotation = new mapkit.MarkerAnnotation(place.coordinate, {
      title: place?.name || "Client Address",
      color: "#0a6fff",
    });
    markerRef.current = annotation;
    map.addAnnotation(annotation);
    map.region = new mapkit.CoordinateRegion(place.coordinate, new mapkit.CoordinateSpan(0.01, 0.01));
  };

  const runSearch = (text: string) => {
    const search = searchRef.current;
    if (!search || !text.trim()) {
      setSuggestions([]);
      return;
    }
    search.search(text, (error: unknown, data: any) => {
      if (error || !data?.places) {
        setSuggestions([]);
        return;
      }
      setSuggestions((data.places || []).slice(0, 6));
    });
  };

  const onQueryChange = (next: string) => {
    setQuery(next);
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      runSearch(next);
    }, 250);
  };

  const choosePlace = (place: any) => {
    const parsed = parseAddress(place);
    setValues(parsed);
    setQuery(
      [parsed.addressLine1, parsed.city, parsed.stateProvince, parsed.postalCode, parsed.country]
        .filter(Boolean)
        .join(", "),
    );
    setSuggestions([]);
    setMapPin(place);
  };

  const setField = (key: keyof AddressValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <strong>Address</strong>
      <p className="muted">Search with Apple Maps, then confirm/edit fields below.</p>

      <label htmlFor="addressSearch">Search Address</label>
      <input
        id="addressSearch"
        className="input"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Start typing address..."
        autoComplete="off"
      />
      {suggestions.length > 0 ? (
        <div className="map-suggestions">
          {suggestions.map((place, idx) => (
            <button key={`${place?.name || "place"}-${idx}`} type="button" onClick={() => choosePlace(place)} className="map-suggestion-item">
              <strong>{place?.name || "Address"}</strong>
              <span>{place?.formattedAddress || ""}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="map-preview-wrap" style={{ marginTop: 10 }}>
        <div ref={mapRef} className="map-preview-canvas" />
        {!ready ? <div className="map-preview-overlay">Map loading…</div> : null}
      </div>

      <div className="grid grid-2" style={{ marginTop: 12 }}>
        <div>
          <label htmlFor="addressLine1">Address Line 1</label>
          <input id="addressLine1" name="addressLine1" className="input" value={values.addressLine1} onChange={(e) => setField("addressLine1", e.target.value)} />
        </div>
        <div>
          <label htmlFor="addressLine2">Address Line 2 (optional)</label>
          <input id="addressLine2" name="addressLine2" className="input" value={values.addressLine2} onChange={(e) => setField("addressLine2", e.target.value)} />
        </div>
        <div>
          <label htmlFor="city">City</label>
          <input id="city" name="city" className="input" value={values.city} onChange={(e) => setField("city", e.target.value)} />
        </div>
        <div>
          <label htmlFor="stateProvince">Province/State</label>
          <input id="stateProvince" name="stateProvince" className="input" value={values.stateProvince} onChange={(e) => setField("stateProvince", e.target.value)} />
        </div>
        <div>
          <label htmlFor="postalCode">Postal/ZIP Code</label>
          <input id="postalCode" name="postalCode" className="input" value={values.postalCode} onChange={(e) => setField("postalCode", e.target.value)} />
        </div>
        <div>
          <label htmlFor="country">Country</label>
          <input id="country" name="country" className="input" value={values.country} onChange={(e) => setField("country", e.target.value)} />
        </div>
      </div>

      <input type="hidden" name="fullAddress" value={fullAddress} />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type SearchItem = {
  id: string;
  label: string;
  subtitle: string;
  href: string;
  type: "client" | "job" | "quote" | "invoice";
};

type SearchResponse = {
  results: SearchItem[];
};

const TYPE_LABELS: Record<SearchItem["type"], string> = {
  client: "Clients",
  job: "Jobs",
  quote: "Quotes",
  invoice: "Invoices",
};

export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
        if (!response.ok) {
          setResults([]);
          return;
        }
        const data = (await response.json()) as SearchResponse;
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  const grouped = results.reduce<Record<string, SearchItem[]>>((acc, row) => {
    const key = TYPE_LABELS[row.type];
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return (
    <div className="saas-global-search" ref={rootRef}>
      <input
        className="input"
        type="search"
        placeholder="Search clients, jobs, quotes, invoices"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) setOpen(true);
        }}
      />

      {open && (query.trim().length > 0 || loading) ? (
        <div className="saas-search-dropdown">
          {loading ? <div className="saas-search-empty">Searching…</div> : null}
          {!loading && query.trim().length < 2 ? <div className="saas-search-empty">Type at least 2 characters.</div> : null}
          {!loading && query.trim().length >= 2 && results.length === 0 ? (
            <div className="saas-search-empty">No results found.</div>
          ) : null}

          {!loading && results.length > 0
            ? Object.entries(grouped).map(([group, groupResults]) => (
                <div key={group} className="saas-search-group">
                  <div className="saas-search-group-title">{group}</div>
                  {groupResults.map((item) => (
                    <Link key={item.id} href={item.href} className="saas-search-row" onClick={() => setOpen(false)}>
                      <div className="saas-search-label">{item.label}</div>
                      <div className="saas-search-subtitle">{item.subtitle}</div>
                    </Link>
                  ))}
                </div>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    title: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "◴" }],
  },
  {
    title: "Operations",
    items: [
      { href: "/assets", label: "Assets", icon: "◎" },
      { href: "/clients", label: "Clients", icon: "◉" },
      { href: "/jobs", label: "Jobs", icon: "◌" },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/quotes", label: "Quotes", icon: "◈" },
      { href: "/invoices", label: "Invoices", icon: "◍" },
    ],
  },
  {
    title: "Workspace",
    items: [{ href: "/settings", label: "Settings", icon: "◎" }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppSidebar() {
  const pathname = usePathname();
  const safePathname = pathname || "";

  return (
    <aside className="saas-sidebar">
      <div className="saas-sidebar-title">LalGeo SaaS</div>
      <div className="saas-sidebar-subtitle">Business workspace</div>

      <nav className="saas-nav" aria-label="Main navigation">
        {groups.map((group) => (
          <div key={group.title} className="saas-nav-group">
            <div className="saas-nav-group-title">{group.title}</div>
            {group.items.map((item) => {
              const active = isActive(safePathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`saas-nav-link ${active ? "active" : ""}`.trim()}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="saas-nav-icon" aria-hidden>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

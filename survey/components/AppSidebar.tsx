import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/jobs", label: "Jobs" },
  { href: "/quotes", label: "Quotes" },
  { href: "/invoices", label: "Invoices" },
  { href: "/settings", label: "Settings" },
];

export default function AppSidebar() {
  return (
    <aside className="saas-sidebar">
      <div className="saas-sidebar-title">LalGeo SaaS</div>
      <nav className="saas-nav">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="saas-nav-link">
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

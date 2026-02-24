import Link from "next/link";

const links = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/clients", label: "Clients" },
  { href: "/app/jobs", label: "Jobs" },
  { href: "/app/quotes", label: "Quotes" },
  { href: "/app/invoices", label: "Invoices" },
  { href: "/app/settings", label: "Settings" },
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

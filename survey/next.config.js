/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  async redirects() {
    return [
      {
        source: "/app",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/app/:path*",
        destination: "/:path*",
        permanent: false,
      },
      {
        source: "/survey",
        destination: "/login",
        permanent: false,
      },
      {
        source: "/survey/:path*",
        destination: "/:path*",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/dashboard", destination: "/app/dashboard" },
        { source: "/clients", destination: "/app/clients" },
        { source: "/clients/:path*", destination: "/app/clients/:path*" },
        { source: "/jobs", destination: "/app/jobs" },
        { source: "/jobs/:path*", destination: "/app/jobs/:path*" },
        { source: "/quotes", destination: "/app/quotes" },
        { source: "/quotes/:path*", destination: "/app/quotes/:path*" },
        { source: "/invoices", destination: "/app/invoices" },
        { source: "/invoices/:path*", destination: "/app/invoices/:path*" },
        { source: "/settings", destination: "/app/settings" },
      ],
    };
  },
};

module.exports = nextConfig;

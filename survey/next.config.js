/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/survey",
  output: "standalone",
  images: { unoptimized: true },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/survey",
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;

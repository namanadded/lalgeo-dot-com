/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/survey",
  output: "standalone",
  images: { unoptimized: true }
};

module.exports = nextConfig;

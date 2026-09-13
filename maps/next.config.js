/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  outputFileTracingIncludes: { "/render/lalgeosurvey": ["./public/legacy/lalgeosurvey.html"] },
};

module.exports = nextConfig;

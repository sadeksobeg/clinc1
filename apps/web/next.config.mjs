/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  // Low-RAM Windows builds: fewer parallel workers avoids Jest-worker OOM.
  experimental: { cpus: 1 },
};

export default nextConfig;

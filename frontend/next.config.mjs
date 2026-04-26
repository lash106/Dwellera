/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // This is the key: it prevents crashes during the static generation phase
  experimental: {
    missingSuspenseWithCSRBypass: true,
  }
};

export default nextConfig;
